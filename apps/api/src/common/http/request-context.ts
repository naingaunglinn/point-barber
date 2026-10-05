import { AsyncLocalStorage } from 'node:async_hooks';

// The request context (design D6 · CG-OBS-02): the request id now; the user and session ids are
// added by add-foundation-auth-access. Read by the log lines, the problem filter and the
// transaction runner.
export interface RequestContextData {
  readonly request_id: string;
  user_id?: string;
  session_id?: string;
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
