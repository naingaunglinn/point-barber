import { Injectable } from '@nestjs/common';
import { AuditSource } from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import type { AuditRow } from '../../../common/database/audit-row.js';
import { TransactionScope } from '../../../common/database/transaction-scope.js';
import { RequestContext } from '../../../common/http/request-context.js';
import { uuidV7 } from '../../../common/http/uuid-v7.js';
import { withoutSecrets } from './secrets.js';

// The application audit writer (API-AUD-01 · D-AUD-01 · P1-RULE-10 · design D12). A service calls
// emit() for what it did, or skip() when it did nothing (an idempotent replay, an unchanged repeat),
// inside its TransactionRunner.run(); the runner writes the rows just before commit, so a rollback
// leaves none. Jobs call emitSystem(). Nobody inserts an audit_events row by hand.

export interface AuditEvent {
  readonly action: string;
  readonly entity_type: string;
  readonly entity_id?: string | null;
  readonly before?: Readonly<Record<string, unknown>> | null;
  readonly after?: Readonly<Record<string, unknown>> | null;
  readonly reason?: string | null;
  /** The branch of the one entity acted on, when the guard resolved none (D12). */
  readonly branch_id?: string | null;
  /** Sign-in: the new session's user and session — the request context has none yet (D12). */
  readonly actor_user_id?: string | null;
  readonly actor_session_id?: string | null;
  /** `@Audited({ target: 'employee' })`: the employee acted on; the caller's own when absent. */
  readonly employee_id?: string | null;
}

/** The primary branch of an employee today (D12): supplied by the people module, which owns it. */
export type PrimaryBranchOf = (employeeId: string) => Promise<string | null>;

@Injectable()
export class Audit {
  private primaryBranchOf: PrimaryBranchOf | undefined;

  constructor(private readonly clock: Clock) {}

  /**
   * Called once by the people module at start-up. The platform module does not import people:
   * people builds on platform (the audit writer, the jobs), so the rule comes in this way.
   */
  usePrimaryBranchOf(fn: PrimaryBranchOf): void {
    this.primaryBranchOf = fn;
  }

  /** One source-1 row for what the service did, written with its transaction. */
  async emit(event: AuditEvent): Promise<void> {
    const scope = TransactionScope.require('Audit.emit');
    const ctx = RequestContext.current();
    if (ctx?.audit !== undefined && !ctx.audit.actions.includes(event.action)) {
      // A programming error: the throw rolls the action back, the request answers 500.
      throw new Error(`audit action ${event.action} is not declared by @Audited`);
    }
    const branchId = await this.branchOf(event);
    scope.audit.push(
      this.row(AuditSource.APP, event, {
        actor_user_id: event.actor_user_id ?? ctx?.user_id ?? null,
        actor_session_id: event.actor_session_id ?? ctx?.session_id ?? null,
        branch_id: branchId,
      }),
    );
    if (ctx?.audit !== undefined) ctx.audit.done = true;
  }

  /** The service did nothing that needs a row (an idempotent replay, an unchanged repeat). */
  skip(): void {
    TransactionScope.require('Audit.skip');
    const intent = RequestContext.current()?.audit;
    if (intent !== undefined) intent.done = true;
  }

  /** One source-3 row for a job's own change: no actor (design D12). */
  emitSystem(event: AuditEvent): void {
    TransactionScope.require('Audit.emitSystem').audit.push(
      this.row(AuditSource.SYSTEM_JOB, event, {
        actor_user_id: null,
        actor_session_id: null,
        branch_id: event.branch_id ?? null,
      }),
    );
  }

  /**
   * The one branch the request acted on (D12 · P1-RULE-10): the branch the access guard resolved →
   * the branch of the one entity the service passed → for an employee-targeted action, that
   * employee's primary branch → NULL (company master, several branches, sign-in).
   */
  private async branchOf(event: AuditEvent): Promise<string | null> {
    const ctx = RequestContext.current();
    if (ctx?.branch_id !== undefined) return ctx.branch_id;
    if (event.branch_id !== undefined && event.branch_id !== null) return event.branch_id;
    if (ctx?.audit?.target === 'employee') {
      const employeeId = event.employee_id ?? ctx.employee_id;
      if (employeeId === undefined || employeeId === null) return null;
      if (this.primaryBranchOf === undefined) {
        throw new Error('Audit: no primary-branch rule registered (PeopleModule not loaded)');
      }
      return this.primaryBranchOf(employeeId);
    }
    return null;
  }

  private row(
    source: AuditSource,
    event: AuditEvent,
    who: Pick<AuditRow, 'actor_user_id' | 'actor_session_id' | 'branch_id'>,
  ): AuditRow {
    const now = this.clock.now();
    return {
      id: uuidV7(now.getTime()),
      occurred_at: now,
      source,
      action: event.action,
      entity_type: event.entity_type,
      entity_id: event.entity_id ?? null,
      before_data: withoutSecrets(event.before),
      after_data: withoutSecrets(event.after),
      reason: event.reason ?? null,
      request_id: RequestContext.current()?.request_id ?? null,
      ...who,
    };
  }
}
