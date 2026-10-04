import { describe, expect, it } from 'vitest';

import { forPsql, withDatabase } from '../lib/pg.mjs';

// Review #10 — libpq rejects Prisma-only URL parameters before it connects.
describe('connection URLs for psql', () => {
  it('drops the Prisma-only parameters and keeps the libpq ones', () => {
    expect(
      forPsql(
        'postgresql://point:pw@localhost:5432/point?schema=public&connection_limit=5&sslmode=require',
      ),
    ).toBe('postgresql://point:pw@localhost:5432/point?sslmode=require');
  });

  it('leaves a URL without parameters unchanged', () => {
    expect(forPsql('postgresql://point:pw@localhost:5432/point')).toBe(
      'postgresql://point:pw@localhost:5432/point',
    );
  });

  it('changes only the database name', () => {
    expect(
      withDatabase('postgresql://point:pw@localhost:5432/point?sslmode=require', 'point_template'),
    ).toBe('postgresql://point:pw@localhost:5432/point_template?sslmode=require');
  });
});
