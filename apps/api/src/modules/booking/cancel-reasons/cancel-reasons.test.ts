import { describe, expect, it } from 'vitest';

import type { Tx } from '../../../common/database/transaction-runner.js';
import type { CurrentCompany } from '../../people/index.js';
import type {
  CancelReasonRef,
  CancelReasonsRepository,
} from '../repositories/cancel-reasons.repository.js';
import { CancelReasons } from './cancel-reasons.js';

// add-booking-cancel-reasons task 3.12 — the public surface `CancelReasons.find` / `.noShow` (design D1).
const COMPANY = '0199a3f2-0000-7000-8000-000000000001';
const BUSY: CancelReasonRef = {
  id: '0199a3f2-0000-7000-8000-000000000012',
  name_mm: 'Barber မအား',
  name_en: 'Barber not available',
  requires_note: false,
  system_code: null,
  status: 1,
  archived_at: null,
};
const ARCHIVED: CancelReasonRef = {
  ...BUSY,
  id: '0199a3f2-0000-7000-8000-000000000013',
  archived_at: new Date('2026-10-05T10:00:00+06:30'),
};
const NO_SHOW: CancelReasonRef = {
  ...BUSY,
  id: '0199a3f2-0000-7000-8000-000000000014',
  name_mm: 'Customer မလာ',
  name_en: 'Customer no-show',
  system_code: 1,
};

const db = {} as Tx;
function reasonsOf(rows: readonly CancelReasonRef[]): CancelReasons {
  const repository = {
    findRef: (_db: Tx, companyId: string, id: string) =>
      Promise.resolve(companyId === COMPANY ? (rows.find((row) => row.id === id) ?? null) : null),
    findNoShow: (_db: Tx, companyId: string) =>
      Promise.resolve(
        companyId === COMPANY ? (rows.find((row) => row.system_code === 1) ?? null) : null,
      ),
  } as unknown as CancelReasonsRepository;
  const company = { id: () => Promise.resolve(COMPANY) } as unknown as CurrentCompany;
  return new CancelReasons(repository, company);
}

describe('CancelReasons.find', () => {
  it('answers the reason of the company', async () => {
    expect(await reasonsOf([BUSY]).find(db, BUSY.id)).toStrictEqual(BUSY);
  });

  it('answers null for an unknown id and for text that is not an id', async () => {
    const reasons = reasonsOf([BUSY]);
    expect(await reasons.find(db, '0199a3f2-0000-7000-8000-0000000000ff')).toBeNull();
    expect(await reasons.find(db, 'not-an-id')).toBeNull();
  });

  it('answers an archived reason with its archived_at', async () => {
    expect(await reasonsOf([ARCHIVED]).find(db, ARCHIVED.id)).toStrictEqual(ARCHIVED);
  });
});

describe('CancelReasons.noShow', () => {
  it('answers the system_code 1 row', async () => {
    expect(await reasonsOf([BUSY, NO_SHOW]).noShow(db)).toStrictEqual(NO_SHOW);
  });

  it('throws when the base seed has not added it — a bug, never an empty answer', async () => {
    await expect(reasonsOf([BUSY]).noShow(db)).rejects.toThrow(/system_code 1/);
  });
});
