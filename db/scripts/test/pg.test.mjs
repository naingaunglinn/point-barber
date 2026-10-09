import { afterEach, describe, expect, it } from 'vitest';

import { forPsql, passwordOf, psql, withDatabase } from '../lib/pg.mjs';

// Review #10 — libpq rejects Prisma-only URL parameters before it connects. PR-I 9.4 — the password
// never goes on psql's command line (CG-OBS-03 · CG-SEC-05): it is visible in the process list and
// was printed in full when psql could not be started.
describe('connection URLs for psql', () => {
  it('drops the Prisma-only parameters and the password, and keeps the libpq ones', () => {
    expect(
      forPsql(
        'postgresql://point:pw@localhost:5432/point?schema=public&connection_limit=5&sslmode=require',
      ),
    ).toBe('postgresql://point@localhost:5432/point?sslmode=require');
  });

  it('leaves a URL without parameters unchanged apart from the password', () => {
    expect(forPsql('postgresql://point:pw@localhost:5432/point')).toBe(
      'postgresql://point@localhost:5432/point',
    );
  });

  it('reads the password, percent-decoded, for PGPASSWORD', () => {
    expect(passwordOf('postgresql://point:p%40ss%2Fw0rd@localhost:5432/point')).toBe('p@ss/w0rd');
    expect(passwordOf('postgresql://point@localhost:5432/point')).toBeUndefined();
  });

  it('changes only the database name', () => {
    expect(
      withDatabase('postgresql://point:pw@localhost:5432/point?sslmode=require', 'point_template'),
    ).toBe('postgresql://point:pw@localhost:5432/point_template?sslmode=require');
  });
});

describe('psql when it cannot be started', () => {
  const saved = process.env.PSQL;
  afterEach(() => {
    if (saved === undefined) delete process.env.PSQL;
    else process.env.PSQL = saved;
  });

  it('throws a short message that names the fix and holds no password', () => {
    process.env.PSQL = 'psql-that-does-not-exist-9f2c';
    const url = 'postgresql://point:Sup3rSecretOwnerPw@localhost:5432/point';
    let caught;
    try {
      psql(url, ['-c', 'SELECT 1']);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.message).toMatch(/could not start psql-that-does-not-exist-9f2c/);
    expect(caught.message).toMatch(/PostgreSQL 16 client/);
    // Nothing reachable from the error — message, stack or any property — carries the password.
    const everything = JSON.stringify(caught, Object.getOwnPropertyNames(caught));
    expect(everything).not.toContain('Sup3rSecretOwnerPw');
  });
});
