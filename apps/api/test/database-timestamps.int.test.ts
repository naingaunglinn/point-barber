import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// The instant of a timestamptz survives the Asia/Yangon session (D-PLT-15 · `*_at` = timestamptz).
// @prisma/adapter-pg 7.10.0 sends a Date as a UTC wall time without an offset and reads a timestamptz by
// replacing its offset with +00:00 — right only for a UTC session. Under Asia/Yangon every value was
// 6 h 30 min off inside the database while a JS round trip looked fine. patches/@prisma__adapter-pg
// fixes both legs; these tests look at what the database holds and computes, not at a round trip.
let t: TestApp;
let prisma: PrismaService;

beforeAll(async () => {
  t = await startTestApp();
  prisma = t.app.get(PrismaService);
});
afterAll(() => t.close());

const MIDNIGHT_MMT = new Date('2026-10-05T17:30:00Z'); // 06/Oct/2026 00:00 in Myanmar

describe('timestamptz through Prisma in the Asia/Yangon session (D-PLT-15)', () => {
  it('a parameter keeps its instant: the database sees the same epoch and Myanmar date', async () => {
    const [row] = await prisma.$queryRaw<{ epoch: number; mmt_date: string; text: string }[]>`
      SELECT extract(epoch FROM ${MIDNIGHT_MMT}::timestamptz)::float8 AS epoch,
             (${MIDNIGHT_MMT}::timestamptz AT TIME ZONE 'Asia/Yangon')::date::text AS mmt_date,
             ${MIDNIGHT_MMT}::timestamptz::text AS text`;
    expect(row).toStrictEqual({
      epoch: MIDNIGHT_MMT.getTime() / 1000,
      mmt_date: '2026-10-06',
      text: '2026-10-06 00:00:00+06:30',
    });
  });

  it('a model write stores the instant (extract(epoch) of the column)', async () => {
    const id = randomUUID();
    await prisma.companies.create({
      data: { id, name_mm: `Time zone ${id.slice(0, 8)}`, created_at: MIDNIGHT_MMT },
    });
    const [row] = await prisma.$queryRaw<{ epoch: number }[]>`
      SELECT extract(epoch FROM created_at)::float8 AS epoch FROM companies WHERE id = ${id}::uuid`;
    expect(row?.epoch).toBe(MIDNIGHT_MMT.getTime() / 1000);
    const read = await prisma.companies.findUniqueOrThrow({ where: { id } });
    expect(read.created_at.toISOString()).toBe(MIDNIGHT_MMT.toISOString());
  });

  it('now() and a DEFAULT now() column read back as the current instant', async () => {
    const [row] = await prisma.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
    expect(Math.abs((row?.now.getTime() ?? 0) - Date.now())).toBeLessThan(10_000);
    const id = randomUUID();
    await prisma.companies.create({ data: { id, name_mm: `Default ${id.slice(0, 8)}` } });
    const read = await prisma.companies.findUniqueOrThrow({ where: { id } });
    expect(Math.abs(read.created_at.getTime() - Date.now())).toBeLessThan(10_000);
  });

  it('a microsecond value read back keeps its instant to the millisecond', async () => {
    const [row] = await prisma.$queryRaw<{ at: Date }[]>`
      SELECT timestamptz '2026-10-15 14:30:33.283512+06:30' AS at`;
    expect(row?.at.toISOString()).toBe('2026-10-15T08:00:33.283Z');
  });
});
