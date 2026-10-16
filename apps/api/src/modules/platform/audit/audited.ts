import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  SetMetadata,
  UseInterceptors,
  applyDecorators,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Observable, map } from 'rxjs';

import { RequestContext } from '../../../common/http/request-context.js';

// @Audited() on an action endpoint (API-AUD-01 · CG-SEC-10 · design D12): it registers the audit
// intent — the actions this endpoint may write and, for an employee-targeted action, `target` — in
// the request context before the handler runs. The service then emits or skips inside its run();
// Audit.emit reads the intent for the branch rule. When the handler returns and the service has done
// neither — no transaction ran, or it forgot — the request fails with 500: every integration test of
// the endpoint fails until the service is fixed (the check).
export interface AuditedOptions {
  readonly actions: readonly string[];
  readonly target?: 'employee';
}

const AUDITED = 'point:audited';

@Injectable()
export class AuditedInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<AuditedOptions | undefined>(AUDITED, context.getHandler());
    const ctx = RequestContext.current();
    if (options === undefined || ctx === undefined) return next.handle();
    const intent = { actions: options.actions, target: options.target, done: false };
    ctx.audit = intent;
    return next.handle().pipe(
      map((value: unknown) => {
        if (!intent.done) {
          throw new Error(
            `@Audited(${options.actions.join(', ')}): the service neither emitted nor skipped inside TransactionRunner.run`,
          );
        }
        return value;
      }),
    );
  }
}

export const Audited = (options: AuditedOptions) =>
  applyDecorators(SetMetadata(AUDITED, options), UseInterceptors(AuditedInterceptor));
