import { timingSafeEqual } from 'node:crypto';

import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, todayMmt } from '@point/shared';
import type { Request } from 'express';

import { Clock } from '../clock/clock.js';
import { AppConfig } from '../config/config.js';
import { ProblemException } from '../http/problem.exception.js';
import { RequestContext, type RequestContextData } from '../http/request-context.js';
import { type Target, decide } from './decide.js';
import type { AccessDeclaration, CanDeclaration, CanViewDeclaration } from './declarations.js';
import { GrantSet, GrantSource } from './grant-set.js';
import {
  type RequestParts,
  branchIdsAt,
  paramAt,
  parseBranchPath,
  requestValueAt,
  targetFieldAt,
} from './paths.js';
import { ACCESS_METADATA } from './public.decorator.js';
import {
  type Caller,
  EMPLOYEE_TARGET,
  type LoadedTarget,
  OrSelfResolvers,
  TargetResolvers,
  routeKey,
} from './resolvers.js';

// The third global guard (design D2 · D11 · API-PERM-02): it reads the route's one access
// declaration and enforces it. A route without one is refused — the run-time half of the lint rule
// `point/one-access-decorator`. The session guard has already put the caller into the request context.
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly grantSource: GrantSource,
    private readonly targets: TargetResolvers,
    private readonly orSelf: OrSelfResolvers,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const declaration = this.reflector.getAllAndOverride<AccessDeclaration | undefined>(
      ACCESS_METADATA,
      [context.getHandler(), context.getClass()],
    );
    const req = context.switchToHttp().getRequest<Request>();
    // An undeclared route is closed for everyone; the session guard answered 401 without a session.
    if (declaration === undefined) throw new ProblemException(ErrorCode.FORBIDDEN, 403);
    switch (declaration.kind) {
      case 'public':
        return true;
      case 'internal':
        this.assertInternalKey(req);
        return true;
      case 'self':
        return true;
      case 'staff': {
        const ctx = this.caller();
        ctx.access_scope = (await this.grantsOf(ctx)).readScope;
        return true;
      }
      case 'can':
      case 'canView':
        await this.decide(declaration, req);
        return true;
    }
  }

  private async decide(
    declaration: CanDeclaration | CanViewDeclaration,
    req: Request,
  ): Promise<void> {
    const ctx = this.caller();
    const grants = await this.grantsOf(ctx);
    const parts: RequestParts = { body: req.body as unknown, query: req.query, params: req.params };
    const target = await this.targetOf(declaration, req, parts, {
      userId: ctx.user_id ?? '',
      employeeId: ctx.employee_id ?? '',
    });
    const decision = decide(declaration, grants, target, req.method);
    if (!decision.allow) {
      throw new ProblemException(decision.code, decision.status, {
        ...(decision.required === undefined ? {} : { context: { required: decision.required } }),
      });
    }
    // The one branch the request acts on goes to the audit writer (D12).
    if (target.kind === 'branches') {
      const distinct = [...new Set(target.branchIds)];
      if (distinct.length === 1) ctx.branch_id = distinct[0];
    }
    // A list without a branch or a target filters by the branches its module reaches (D11).
    if (declaration.kind === 'canView' && target.kind === 'none') {
      ctx.access_scope = grants.branchesOfModule(declaration.module);
    }
  }

  /** Resolves what the declaration points at, and whether the orSelf rule matches the caller. */
  private async targetOf(
    declaration: CanDeclaration | CanViewDeclaration,
    req: Request,
    parts: RequestParts,
    caller: Caller,
  ): Promise<Target> {
    let loaded: LoadedTarget | null | undefined;
    let target: Target;
    if (declaration.target !== undefined) {
      const id = paramAt(parts, declaration.target.slice('employee:'.length));
      loaded = id === undefined ? null : await this.targets.get(EMPLOYEE_TARGET)(id);
      target =
        loaded === null
          ? { kind: 'missing' }
          : { kind: 'branches', branchIds: loaded.branch_ids, match: loaded.match ?? 'all' };
    } else if (declaration.branch !== undefined) {
      const path = parseBranchPath(declaration.branch);
      if (path.kind === 'entity') {
        const id = paramAt(parts, path.param);
        const pattern = (req.route as { path?: string } | undefined)?.path ?? req.path;
        loaded =
          id === undefined ? null : await this.targets.get(routeKey(req.method, pattern))(id);
        target =
          loaded === null
            ? { kind: 'missing' }
            : { kind: 'branches', branchIds: loaded.branch_ids, match: loaded.match ?? 'all' };
      } else {
        const named = branchIdsAt(path, parts);
        target = named.empty
          ? { kind: 'empty' }
          : { kind: 'branches', branchIds: named.ids, match: 'all' };
      }
    } else {
      target = { kind: 'none' };
    }
    if (declaration.orSelf === undefined || target.kind === 'missing') return target;
    return { ...target, self: await this.isSelf(declaration.orSelf, parts, loaded, caller) };
  }

  private async isSelf(
    orSelf: string,
    parts: RequestParts,
    loaded: LoadedTarget | null | undefined,
    caller: Caller,
  ): Promise<boolean> {
    const matches = (value: unknown): boolean =>
      typeof value === 'string' && (value === caller.employeeId || value === caller.userId);
    const inRequest = requestValueAt(orSelf, parts);
    if (inRequest.found) return matches(inRequest.value);
    const field = targetFieldAt(orSelf);
    if (field !== undefined) return matches(loaded?.[field]);
    return this.orSelf.get(orSelf)(parts, caller);
  }

  /** Built once per request from the people tables — no cache between requests (D-ROLE-06). */
  private async grantsOf(ctx: RequestContextData): Promise<GrantSet> {
    if (ctx.grants !== undefined) return ctx.grants;
    if (ctx.employee_id === undefined) throw new ProblemException(ErrorCode.FORBIDDEN, 403);
    const rows = await this.grantSource.rowsFor(ctx.employee_id);
    ctx.grants = GrantSet.build(rows, todayMmt(this.clock.now()));
    return ctx.grants;
  }

  private caller(): RequestContextData {
    const ctx = RequestContext.current();
    if (ctx?.user_id === undefined) throw new ProblemException(ErrorCode.UNAUTHENTICATED, 401);
    return ctx;
  }

  /** `X-Internal-Key` must equal INTERNAL_OPS_KEY (ADR-009); the SSR key does not open it. */
  private assertInternalKey(req: Request): void {
    const sent = Buffer.from(req.header('x-internal-key') ?? '', 'utf8');
    const expected = Buffer.from(this.config.env.INTERNAL_OPS_KEY, 'utf8');
    if (sent.length !== expected.length || !timingSafeEqual(sent, expected)) {
      throw new ProblemException(ErrorCode.UNAUTHENTICATED, 401);
    }
  }
}
