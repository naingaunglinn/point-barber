import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type SeededApp, seededApp } from './helpers/seeded.js';
import { type WalkinHttp, walkinHttp } from './helpers/walkin-http.js';

// add-walkin-visit-checkout task 6.12 over HTTP — `Sale.actions` from the real grants (SaleViewers.rightsAt,
// AD-PERM-02 · P4-RULE-03): the unit tests pass hand-made rights, so this pins the mapping of the codes
// (visit.update → edit_lines, sale.finish_override → take_payment and finish with a reason, visit.delete →
// mark_incomplete). Ko Aung's COMPLETED walk-in at B3; Ma Hnin (Manager · B3) holds the three codes, Ko Aung
// holds none of them and acts as the performer.
const { services } = FIXTURE_IDS;
const AUNG = 'E004';
const HNIN = 'E002';

let s: SeededApp;
let api: WalkinHttp;
let visitId: string;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:00:00+06:30'));
  api = walkinHttp(s);
  const visit = await api.start(AUNG, [services.HAIRCUT]);
  await api.complete(AUNG, visit.id);
  visitId = visit.id;
});
afterAll(() => s.close());

const actionsOf = async (who: typeof AUNG | typeof HNIN) => {
  const res = await api.get(who, `/visits/${visitId}`);
  expect(res.status).toBe(200);
  return (res.body as { sale: { actions: Record<string, boolean> } }).sale.actions;
};

describe('Sale.actions from the caller’s grants (review of #20)', () => {
  it('Ma Hnin — the codes of a manager at B3: every control, Finish with a reason', async () => {
    expect(await actionsOf(HNIN)).toMatchObject({
      edit_lines: true,
      take_payment: true,
      finish: true,
      finish_needs_reason: true,
      mark_incomplete: true,
    });
  });

  it('Ko Aung — no code, the performer: the same controls, Finish without a reason', async () => {
    expect(await actionsOf(AUNG)).toMatchObject({
      take_payment: true,
      finish: true,
      finish_needs_reason: false,
      mark_incomplete: true,
    });
  });
});
