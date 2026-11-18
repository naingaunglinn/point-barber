import { FIXTURE_IDS } from '@point/shared/testing';
import { describe, expect, it } from 'vitest';

import { type RecentVisit, pickPreferred } from './preferred-barber.js';

// add-customer-management task 2.9 — customers "The preferred barber is the one who did at least 3 of
// the last 5 finished visits" (D-CUS-08 · owner #6 · design D6). The visits are the customer's last W
// FINISHED visits in the read scope, newest first (spec-fixtures §2: Ma Su's B3 and B1 visits).
const { employees } = FIXTURE_IDS;
const KO_AUNG = employees.E004;
const KO_MIN = employees.E005;
const KO_HTET = employees.E006;

const visit = (day: string, performer: string): RecentVisit => ({
  visit_id: `visit-${day}`,
  finished_at: new Date(`${day}T10:42:00+06:30`),
  performed_by_employee_id: performer,
});

/** Ma Su's last five visits anywhere: 03/Oct Ko Htet (B1), then her last four at B3. */
const ANYWHERE = [
  visit('2026-10-03', KO_HTET),
  visit('2026-09-28', KO_AUNG),
  visit('2026-09-25', KO_MIN),
  visit('2026-09-21', KO_AUNG),
  visit('2026-09-14', KO_MIN),
];

describe('pickPreferred — D-CUS-08 · owner #6', () => {
  it('Scenario: Ko Aung at B3 — 3 of the last 5 visits → Ko Aung', () => {
    const atB3 = [
      visit('2026-09-28', KO_AUNG),
      visit('2026-09-25', KO_MIN),
      visit('2026-09-21', KO_AUNG),
      visit('2026-09-14', KO_MIN),
      visit('2026-09-07', KO_AUNG),
    ];
    expect(pickPreferred(atB3, 3)).toBe(KO_AUNG);
  });

  it('Scenario: Nobody reaches 3 across all branches — 2 / 2 / 1 → null', () => {
    expect(pickPreferred(ANYWHERE, 3)).toBeNull();
  });

  it('Scenario: Fewer visits than needed — one visit → null', () => {
    expect(pickPreferred([visit('2026-10-03', KO_HTET)], 3)).toBeNull();
    expect(pickPreferred([], 3)).toBeNull();
  });

  it('Scenario: Two qualify — with a minimum of 2 the newer latest visit wins (Ko Aung 28/Sep)', () => {
    expect(pickPreferred(ANYWHERE, 2)).toBe(KO_AUNG);
    expect(pickPreferred([...ANYWHERE].reverse(), 2)).toBe(KO_AUNG);
  });

  it('more of the visits beats a newer visit when both qualify', () => {
    const visits = [
      visit('2026-10-03', KO_HTET),
      visit('2026-09-28', KO_AUNG),
      visit('2026-09-21', KO_AUNG),
      visit('2026-09-14', KO_HTET),
      visit('2026-09-07', KO_AUNG),
    ];
    expect(pickPreferred(visits, 2)).toBe(KO_AUNG);
  });
});
