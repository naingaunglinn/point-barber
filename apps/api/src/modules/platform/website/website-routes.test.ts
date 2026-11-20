import 'reflect-metadata';

import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { ErrorCode, RoleStatus, ScopeType } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { describe, expect, it } from 'vitest';

import { type Target, decide } from '../../../common/access/decide.js';
import type { CanDeclaration, CanViewDeclaration } from '../../../common/access/declarations.js';
import { type AssignmentRow, GrantSet } from '../../../common/access/grant-set.js';
import { parseBranchPath } from '../../../common/access/paths.js';
import { ACCESS_METADATA } from '../../../common/access/public.decorator.js';
import type { BranchClosuresRepository } from '../repositories/branch-closures.repository.js';
import { CLOSURE_ROUTES, ClosureAccess } from './closure-access.js';
import { ClosuresController } from './closures.controller.js';
import { WebsiteController } from './website.controller.js';
import { WebsiteHoursController } from './website-hours.controller.js';

// add-website-management task 1.6 — the twelve routes of P8.WEB.01 – 12 with the access declaration
// of design D2 (API-PERM-02 — exactly one each · P8-RULE-01 · owner F7 · ADR-012), read from the
// decorators' metadata: no database, no application start. Then the access table of the spec's
// scenarios that the declarations alone decide (spec "Site content, revalidation and the share preview
// are company master; hours, closures and the booking QR are branch data").

type Constructor = abstract new (...args: never[]) => unknown;

const METHODS: Record<number, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.PATCH]: 'PATCH',
};

interface Route {
  readonly route: string;
  readonly status: number | undefined;
  readonly access: unknown;
}

/** `<METHOD> /<controller path>/<handler path>` with its HTTP code and access declaration. */
function routesOf(controller: Constructor): Route[] {
  const base = String(Reflect.getMetadata(PATH_METADATA, controller));
  const prototype = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(prototype)
    .map((name) => prototype[name])
    .filter((handler): handler is object => typeof handler === 'function')
    .filter((handler) => Reflect.hasMetadata(METHOD_METADATA, handler))
    .map((handler) => {
      const method = METHODS[Number(Reflect.getMetadata(METHOD_METADATA, handler))];
      const path = `/${base}/${String(Reflect.getMetadata(PATH_METADATA, handler))}`
        .replace(/\/+$/, '')
        .replace(/\/{2,}/g, '/');
      return {
        route: `${method ?? '?'} ${path}`,
        status: Reflect.getMetadata(HTTP_CODE_METADATA, handler) as number | undefined,
        access: Reflect.getMetadata(ACCESS_METADATA, handler),
      };
    });
}

const ROUTES = [WebsiteController, WebsiteHoursController, ClosuresController].flatMap(routesOf);
const declarationOf = (route: string): CanDeclaration | CanViewDeclaration => {
  const found = ROUTES.find((entry) => entry.route === route);
  if (found === undefined) throw new Error(`no route ${route}`);
  return found.access as CanDeclaration | CanViewDeclaration;
};

describe('add-website-management · the twelve website routes (design D2)', () => {
  it('declares P8.WEB.01 – 12 with one access declaration each', () => {
    const company = { kind: 'can', code: 'website.update', level: 'company' };
    const view = { kind: 'canView', module: 'website' };
    expect(Object.fromEntries(ROUTES.map((entry) => [entry.route, entry.access]))).toStrictEqual({
      'GET /v1/website': view,
      'PUT /v1/website/content': company,
      'GET /v1/website/team': view,
      'GET /v1/website/share-preview': view,
      'GET /v1/website/booking-qr/:branch_id': { ...view, branch: 'params.branch_id' },
      'POST /v1/website/revalidate': company,
      'GET /v1/website/branches/:branch_id/hours': { ...view, branch: 'params.branch_id' },
      'PUT /v1/website/branches/:branch_id/hours': {
        kind: 'can',
        code: 'website.update',
        branch: 'params.branch_id',
      },
      'GET /v1/website/closures': view,
      'POST /v1/website/closures': {
        kind: 'can',
        code: 'website.update',
        branch: 'body.branch_id',
      },
      'PATCH /v1/website/closures/:id': {
        kind: 'can',
        code: 'website.update',
        branch: 'params.id→entity.branch_id',
      },
      'POST /v1/website/closures/:id/archive': {
        kind: 'can',
        code: 'website.update',
        branch: 'params.id→entity.branch_id',
      },
    });
  });

  it('answers 202 for the refresh and 200 for the archive (P8.WEB.12 · P8.WEB.08)', () => {
    const status = Object.fromEntries(ROUTES.map((entry) => [entry.route, entry.status]));
    expect(status['POST /v1/website/revalidate']).toBe(202);
    expect(status['POST /v1/website/closures/:id/archive']).toBe(200);
    expect(status['POST /v1/website/closures']).toBeUndefined();
  });

  it('every branch path is one the access guard reads', () => {
    for (const { access } of ROUTES) {
      const branch = (access as { branch?: string }).branch;
      if (branch !== undefined) expect(() => parseBranchPath(branch)).not.toThrow();
    }
  });

  it('the closure loader serves the two routes that name the stored closure', () => {
    expect(CLOSURE_ROUTES).toStrictEqual([
      'PATCH /v1/website/closures/:id',
      'POST /v1/website/closures/:id/archive',
    ]);
  });
});

const { B1, B3 } = FIXTURE_IDS.branches;
const TODAY = '2026-10-05';
const grant = (code: string, branchIds: string[] | 'company'): AssignmentRow => ({
  code,
  module: 'website',
  scope_type: branchIds === 'company' ? ScopeType.COMPANY : ScopeType.BRANCHES,
  revoked_at: null,
  permission_archived_at: null,
  role_archived_at: null,
  role_status: RoleStatus.ACTIVE,
  branch_ids: branchIds === 'company' ? [] : branchIds,
});
const grantsOf = (assignments: AssignmentRow[]) =>
  GrantSet.build({ assignments, branches: [] }, TODAY);

// The seed roles of the fixture (spec-fixtures §2): U Kyaw Zin (Admin · company), Ma Hnin (Manager ·
// B3), Ko Aung (Barber · B3 — no website code).
const kyawZin = grantsOf([grant('website.view', 'company'), grant('website.update', 'company')]);
const hnin = grantsOf([grant('website.view', [B3]), grant('website.update', [B3])]);
const aung = grantsOf([]);
const none: Target = { kind: 'none' };
const at = (branchId: string): Target => ({
  kind: 'branches',
  branchIds: [branchId],
  match: 'all',
});
const method = (route: string) => route.split(' ')[0] ?? '';
const decision = (grants: GrantSet, route: string, target: Target) =>
  decide(declarationOf(route), grants, target, method(route));

describe('add-website-management · website · company master and branch data (P8-RULE-01 · owner F7)', () => {
  it('Scenario: A branch manager cannot change the site content — 403 company_scope_required', () => {
    expect(decision(hnin, 'PUT /v1/website/content', none)).toStrictEqual({
      allow: false,
      status: 403,
      code: ErrorCode.COMPANY_SCOPE_REQUIRED,
    });
    expect(decision(kyawZin, 'PUT /v1/website/content', none)).toStrictEqual({ allow: true });
  });

  it('the refresh needs company scope too (P8.WEB.12)', () => {
    expect(decision(hnin, 'POST /v1/website/revalidate', none)).toMatchObject({
      code: ErrorCode.COMPANY_SCOPE_REQUIRED,
    });
    expect(decision(kyawZin, 'POST /v1/website/revalidate', none)).toStrictEqual({ allow: true });
  });

  it("Scenario: A branch manager edits her own branch's hours, not another's", () => {
    const route = 'PUT /v1/website/branches/:branch_id/hours';
    expect(decision(hnin, route, at(B3))).toStrictEqual({ allow: true });
    expect(decision(hnin, route, at(B1))).toStrictEqual({
      allow: false,
      status: 403,
      code: ErrorCode.FORBIDDEN,
      required: 'website.update',
    });
    expect(decision(kyawZin, route, at(B1))).toStrictEqual({ allow: true });
  });

  it('a closure for another branch is refused with forbidden (P8.WEB.06 – 08)', () => {
    for (const route of [
      'POST /v1/website/closures',
      'PATCH /v1/website/closures/:id',
      'POST /v1/website/closures/:id/archive',
    ]) {
      expect(decision(hnin, route, at(B3))).toStrictEqual({ allow: true });
      expect(decision(hnin, route, at(B1))).toMatchObject({
        status: 403,
        code: ErrorCode.FORBIDDEN,
      });
    }
  });

  // Recorded reading (lead 18/Nov/2026): the spec's 403 for another branch's single resource (task 2.1,
  // "Another branch's QR") follows API-PERM-03 — a single-resource read outside the scope is 404.
  it("another branch's hours or booking QR: 404, as API-PERM-03 answers a single read out of scope", () => {
    for (const route of [
      'GET /v1/website/branches/:branch_id/hours',
      'GET /v1/website/booking-qr/:branch_id',
    ]) {
      expect(decision(hnin, route, at(B3))).toStrictEqual({ allow: true });
      expect(decision(hnin, route, at(B1))).toStrictEqual({
        allow: false,
        status: 404,
        code: ErrorCode.NOT_FOUND,
      });
    }
  });

  it('Scenario: A barber is refused — 403 forbidden with context.required = website.view', () => {
    expect(decision(aung, 'GET /v1/website', none)).toStrictEqual({
      allow: false,
      status: 403,
      code: ErrorCode.FORBIDDEN,
      required: 'website.view',
    });
  });

  it('the overview, the team and the share preview are open to any website code at any scope', () => {
    for (const route of [
      'GET /v1/website',
      'GET /v1/website/team',
      'GET /v1/website/share-preview',
      'GET /v1/website/closures',
    ]) {
      expect(decision(hnin, route, none)).toStrictEqual({ allow: true });
    }
  });
});

describe('ClosureAccess — the closure loader (design D2)', () => {
  const closures = new Map([['0190c3a0-0000-7000-8000-0000000000c1', B3]]);
  const repository = {
    branchOf: (id: string) => Promise.resolve(closures.get(id) ?? null),
  } as unknown as BranchClosuresRepository;
  const access = new ClosureAccess(repository);

  it('gives the branch of a stored closure', async () => {
    await expect(access.target('0190c3a0-0000-7000-8000-0000000000c1')).resolves.toStrictEqual({
      branch_ids: [B3],
    });
  });

  it('an unknown id and an id that is not a UUID are missing (404 before the decision)', async () => {
    await expect(access.target('0190c3a0-0000-7000-8000-0000000000c9')).resolves.toBeNull();
    await expect(access.target('not-a-uuid')).resolves.toBeNull();
  });
});
