import type { Logger } from 'pino';
import { describe, expect, it } from 'vitest';

import { TransactionScope } from '../database/transaction-scope.js';
import { ErrorReporter, type ErrorSink } from '../observability/error-reporter.js';
import { BackgroundTasks } from './background-tasks.js';
import { RequestContext } from './request-context.js';

// add-foundation-auth-access task 2.2 — work the answer does not wait for (design D1 · D4): tracked,
// its failure logged with the request id, awaited by drain() and at shutdown.
function fakeLog() {
  const errors: { fields: Record<string, unknown>; msg: string }[] = [];
  const log = {
    error: (fields: Record<string, unknown>, msg: string) => errors.push({ fields, msg }),
  } as unknown as Logger;
  return { log, errors };
}

const REQUEST_ID = '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70';
const later = <T>(value: T, ms = 20) => new Promise<T>((done) => setTimeout(() => done(value), ms));

describe('BackgroundTasks', () => {
  it('returns at once and runs the work afterwards', async () => {
    const tasks = new BackgroundTasks(fakeLog().log);
    const steps: string[] = [];
    tasks.run(async () => {
      steps.push(await later('work'));
    });
    steps.push('returned');
    await tasks.drain();
    expect(steps).toStrictEqual(['returned', 'work']);
  });

  it('logs a rejection with the request id and does not throw it to the caller', async () => {
    const { log, errors } = fakeLog();
    const tasks = new BackgroundTasks(log);
    RequestContext.run({ request_id: REQUEST_ID }, () => {
      tasks.run(async () => {
        await later(null);
        throw new Error('mail transport down');
      });
    });
    await tasks.drain();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.msg).toBe('background task failed');
    expect(errors[0]?.fields.request_id).toBe(REQUEST_ID);
    expect((errors[0]?.fields.err as Error).message).toBe('mail transport down');
  });

  it('reports the failure with the request id tag (add-staging-deploy · CG-OBS-04)', async () => {
    const captured: { error: unknown; tags: Readonly<Record<string, string>> }[] = [];
    const reporter = new ErrorReporter();
    const sink: ErrorSink = {
      capture: (error, tags) => captured.push({ error, tags }),
      close: async () => true,
    };
    reporter.use(sink);
    const tasks = new BackgroundTasks(fakeLog().log, reporter);
    RequestContext.run({ request_id: REQUEST_ID }, () => {
      tasks.run(() => {
        throw new Error('handler failed');
      });
    });
    tasks.run(async () => undefined);
    await tasks.drain();
    expect(captured).toHaveLength(1);
    expect((captured[0]?.error as Error).message).toBe('handler failed');
    expect(captured[0]?.tags).toStrictEqual({ request_id: REQUEST_ID });
  });

  it('logs a synchronous throw the same way', async () => {
    const { log, errors } = fakeLog();
    const tasks = new BackgroundTasks(log);
    tasks.run(() => {
      throw new Error('sync');
    });
    await tasks.drain();
    expect(errors).toHaveLength(1);
  });

  it('drain() also waits for a task started by a running task', async () => {
    const tasks = new BackgroundTasks(fakeLog().log);
    const done: string[] = [];
    tasks.run(async () => {
      await later(null);
      tasks.run(async () => {
        done.push(await later('second'));
      });
      done.push('first');
    });
    await tasks.drain();
    expect(done).toStrictEqual(['first', 'second']);
  });

  it('is awaited at shutdown', async () => {
    const tasks = new BackgroundTasks(fakeLog().log);
    let finished = false;
    tasks.run(async () => {
      await later(null, 40);
      finished = true;
    });
    await tasks.onApplicationShutdown();
    expect(finished).toBe(true);
  });

  it('runs outside the caller’s transaction but keeps its request context', async () => {
    const tasks = new BackgroundTasks(fakeLog().log);
    let seen: { scope: unknown; requestId: string | undefined } | undefined;
    await RequestContext.run({ request_id: REQUEST_ID }, () =>
      TransactionScope.run(TransactionScope.create(), () => {
        tasks.run(async () => {
          seen = {
            scope: TransactionScope.current(),
            requestId: RequestContext.current()?.request_id,
          };
        });
        return Promise.resolve();
      }),
    );
    await tasks.drain();
    expect(seen).toStrictEqual({ scope: undefined, requestId: REQUEST_ID });
  });
});
