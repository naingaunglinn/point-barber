import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { RequestContext } from '../../../common/http/request-context.js';
import { Audit } from '../audit/audit.service.js';

// The idempotency helper (API-IDEM-01 / 02 · CG-IDEM-02 · D-DB-12 · add-foundation-auth-access
// design D14). The service calls it as the first statement of its transaction:
//   1. try-lock the key — taken by a running request → 409 idempotency_in_progress, without waiting
//      (a try-lock never waits, so it cannot join a deadlock — outside the API-IDEM-06 lock order);
//   2. find() the row with this client_request_id — found: same() → a replay (no audit row), else
//      → 422 idempotency_mismatch;
//   3. not found → create(). A unique violation on client_request_id there (the last line behind the
//      lock) aborts the transaction; the one error mapper answers 409 and the client's retry replays.
// No key table and no request hash: the comparison is made against the stored row.

export interface IdempotentSpec<R> {
  readonly key: string;
  readonly find: () => Promise<R | null>;
  /** The endpoint's identifying fields equal those of the stored row (API-IDEM-02). */
  readonly same: (row: R) => boolean;
  readonly create: () => Promise<R>;
}

@Injectable()
export class Idempotency {
  constructor(private readonly audit: Audit) {}

  async run<R>(tx: Tx, spec: IdempotentSpec<R>): Promise<{ replayed: boolean; row: R }> {
    const [lock] = await tx.$queryRaw<{ taken: boolean }[]>`
      SELECT pg_try_advisory_xact_lock(hashtextextended(${`idem:${spec.key}`}, 0)) AS taken`;
    if (lock?.taken !== true) throw new ProblemException(ErrorCode.IDEMPOTENCY_IN_PROGRESS, 409);

    const existing = await spec.find();
    if (existing === null) return { replayed: false, row: await spec.create() };
    if (!spec.same(existing)) throw new ProblemException(ErrorCode.IDEMPOTENCY_MISMATCH, 422);
    this.audit.skip();
    const ctx = RequestContext.current();
    if (ctx !== undefined) ctx.idempotent_replayed = true;
    return { replayed: true, row: existing };
  }
}
