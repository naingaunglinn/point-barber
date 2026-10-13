import { AsyncLocalStorage } from 'node:async_hooks';

// The request context (design D6 · CG-OBS-02 · add-foundation-auth-access D1): the request id from
// the start; the caller (user, session, employee) once the session guard has resolved it; the one
// branch the access guard resolved; the client facts the audit and session rows record; the audit
// intent of an @Audited() endpoint (D12). Read by the log lines, the problem filter, the transaction
// runner and the audit writer.

/** What an @Audited() endpoint may write, and whether its service has emitted or skipped (D12). */
export interface AuditIntent {
  readonly actions: readonly string[];
  readonly target?: 'employee';
  done: boolean;
}

export interface RequestContextData {
  readonly request_id: string;
  user_id?: string;
  session_id?: string;
  employee_id?: string;
  /** The single branch the access guard resolved (D11); the audit row's branch (D12). */
  branch_id?: string;
  ip?: string;
  user_agent?: string;
  /** `X-Client`: web, android-shell, windows-shell (API-AUD-02). */
  client?: string;
  audit?: AuditIntent;
  /** Set by Idempotency.run on a replay: the response is 200 with Idempotent-Replayed (D14). */
  idempotent_replayed?: boolean;
}

const storage = new AsyncLocalStorage<RequestContextData>();

export const RequestContext = {
  run<T>(data: RequestContextData, fn: () => T): T {
    return storage.run(data, fn);
  },
  current(): RequestContextData | undefined {
    return storage.getStore();
  },
};
