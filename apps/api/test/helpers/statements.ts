import { PrismaPg } from '@prisma/adapter-pg';
import { vi } from 'vitest';

// Every SQL statement the application sends through Prisma while `work` runs — a test-only hook until
// `add-ci-guard-rails` brings `expectQueryCount` (coding guideline §24). Prisma sends each statement,
// BEGIN and COMMIT included, through `queryRaw` / `executeRaw` of @prisma/adapter-pg's queryable class,
// which the pool adapter and every transaction share; the hook wraps those two on that prototype. A
// statement of pg-boss, which has its own pool, is not seen.

interface SqlQuery {
  readonly sql: string;
}

interface Queryable {
  queryRaw(query: SqlQuery): Promise<unknown>;
  executeRaw(query: SqlQuery): Promise<number>;
}

async function queryablePrototype(): Promise<Queryable> {
  // An adapter that sends nothing: pg opens a connection only for a first query.
  const adapter = await new PrismaPg({
    connectionString: 'postgresql://unused@127.0.0.1:1/unused',
  }).connect();
  await adapter.dispose();
  return Object.getPrototypeOf(Object.getPrototypeOf(adapter)) as Queryable;
}

/** The SQL of every statement sent while `work` runs, in the order sent. */
export async function statementsOf(work: () => Promise<unknown>): Promise<string[]> {
  const prototype = await queryablePrototype();
  const { queryRaw, executeRaw } = prototype;
  const sent: string[] = [];
  const spies = [
    vi.spyOn(prototype, 'queryRaw').mockImplementation(function (this: Queryable, query) {
      sent.push(query.sql);
      return queryRaw.call(this, query);
    }),
    vi.spyOn(prototype, 'executeRaw').mockImplementation(function (this: Queryable, query) {
      sent.push(query.sql);
      return executeRaw.call(this, query);
    }),
  ];
  try {
    await work();
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
  return sent;
}
