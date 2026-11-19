import {
  ErrorCode,
  RoleStatus,
  ScopeType,
  type SettingKey,
  type SettingValues,
} from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import type { Logger } from 'pino';
import { describe, expect, it } from 'vitest';

import type { AssignmentRow, GrantSourceRows } from '../../../common/access/grant-set.js';
import { Clock } from '../../../common/clock/clock.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { RequestContext, type RequestContextData } from '../../../common/http/request-context.js';
import type { SettingsRepository } from '../repositories/settings.repository.js';
import { StoreMaintenanceGate } from './maintenance-gate.js';
import { CompanyOfSettings, RegisteredGrantSource } from './ports.js';
import type { SettingsReader } from './settings-reader.js';
import { StoreSettingsReader } from './store-settings-reader.js';

// add-settings-store task 4.2 — StoreMaintenanceGate (API-AUTH-06 · P1-RULE-04 · D-PLT-08 · design D9):
// off → every request passes and no grant is read; on → only a company-scope settings.update holder
// passes, and the grant set built for the decision is kept for the access guard and /me; anyone else
// gets 503 `maintenance` with { until, message_mm, message_en }.
const { B3 } = FIXTURE_IDS.branches;
const ON = {
  enabled: true,
  until: '2026-10-05T22:00:00+06:30',
  message_mm: 'ဆာဗာ ပြင်နေပါတယ်',
  message_en: 'Server update',
};

class FixedClock extends Clock {
  override now(): Date {
    return new Date('2026-10-05T21:05:00+06:30');
  }
}

const grant = (code: string, branchIds: string[] | 'company'): AssignmentRow => ({
  code,
  module: code.split('.')[0] ?? code,
  scope_type: branchIds === 'company' ? ScopeType.COMPANY : ScopeType.BRANCHES,
  revoked_at: null,
  permission_archived_at: null,
  role_archived_at: null,
  role_status: RoleStatus.ACTIVE,
  branch_ids: branchIds === 'company' ? [] : branchIds,
});

const PEOPLE: Record<string, GrantSourceRows> = {
  kyawZin: {
    assignments: [grant('settings.view', 'company'), grant('settings.update', 'company')],
    branches: [],
  },
  maHnin: {
    assignments: [grant('settings.view', [B3]), grant('settings.update', [B3])],
    branches: [],
  },
  koAung: { assignments: [grant('sale.create', [B3])], branches: [] },
};

function gateOn(reader: SettingsReader) {
  const grantReads: string[] = [];
  const source = new RegisteredGrantSource();
  source.use({
    rowsFor: (employeeId) => {
      grantReads.push(employeeId);
      const rows = PEOPLE[employeeId];
      if (rows === undefined) throw new Error(`no fixture ${employeeId}`);
      return Promise.resolve(rows);
    },
  });
  return { gate: new StoreMaintenanceGate(reader, source, new FixedClock()), grantReads };
}

function gateWith(maintenance: unknown) {
  const reads: string[] = [];
  const reader = {
    effective: <K extends SettingKey>(keys: readonly K[]) => {
      reads.push(...keys);
      return Promise.resolve({ 'system.maintenance': maintenance } as unknown as SettingValues<K>);
    },
  } as unknown as SettingsReader;
  return { ...gateOn(reader), reads };
}

/** The gate on the store's reader, with `stored` as the company row of `system.maintenance`. */
function gateOnStoredRow(stored: unknown) {
  const repository = {
    rowsOf: () =>
      Promise.resolve([
        {
          id: '0199a3f2-0000-7000-8000-000000005e01',
          key: 'system.maintenance',
          branch_id: null,
          value: stored,
          updated_at: new Date('2026-10-05T14:30:00Z'),
          updated_by_user_id: FIXTURE_IDS.users.E001,
        },
      ]),
  } as unknown as SettingsRepository;
  const company = new CompanyOfSettings();
  company.use(() => Promise.resolve('0199a3f2-0000-7000-8000-00000000c001'));
  const errors: unknown[] = [];
  const log = { error: (fields: unknown) => errors.push(fields) } as unknown as Logger;
  return { ...gateOn(new StoreSettingsReader(repository, company, log)), errors };
}

const asCaller = <T>(
  employeeId: string | undefined,
  work: (ctx: RequestContextData) => Promise<T>,
) => {
  const ctx: RequestContextData = {
    request_id: 'req-1',
    user_id: 'user-1',
    ...(employeeId === undefined ? {} : { employee_id: employeeId }),
  };
  return RequestContext.run(ctx, () => work(ctx));
};

async function refusal(promise: Promise<unknown>): Promise<ProblemException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ProblemException) return error;
    throw error;
  }
  throw new Error('the gate let the request pass');
}

describe('StoreMaintenanceGate (task 4.2)', () => {
  it('off: every request passes with one settings read and no grant read', async () => {
    const { gate, reads, grantReads } = gateWith({ enabled: false });
    await asCaller('koAung', async (ctx) => {
      await expect(gate.assertOpen()).resolves.toBeUndefined();
      expect(ctx.grants).toBeUndefined();
    });
    expect(reads).toStrictEqual(['system.maintenance']);
    expect(grantReads).toStrictEqual([]);
  });

  it('on: a company-scope settings.update holder passes; the grant set is kept for the request', async () => {
    const { gate, grantReads } = gateWith(ON);
    await asCaller('kyawZin', async (ctx) => {
      await expect(gate.assertOpen()).resolves.toBeUndefined();
      expect(ctx.grants?.isCompany('settings.update')).toBe(true);
    });
    expect(grantReads).toStrictEqual(['kyawZin']);
  });

  it.each(['maHnin', 'koAung'])(
    'on: %s (branch scope or no code) gets 503 maintenance with the context',
    async (who) => {
      const { gate } = gateWith(ON);
      const error = await asCaller(who, () => refusal(gate.assertOpen()));
      expect([error.code, error.status]).toStrictEqual([ErrorCode.MAINTENANCE, 503]);
      expect(error.options.context).toStrictEqual({
        until: '2026-10-05T22:00:00+06:30',
        message_mm: 'ဆာဗာ ပြင်နေပါတယ်',
        message_en: 'Server update',
      });
    },
  );

  it('on with only `enabled`: the context members are null', async () => {
    const { gate } = gateWith({ enabled: true });
    const error = await asCaller('koAung', () => refusal(gate.assertOpen()));
    expect(error.options.context).toStrictEqual({
      until: null,
      message_mm: null,
      message_en: null,
    });
  });

  it('on: a caller without an employee cannot hold the code and is refused', async () => {
    const { gate, grantReads } = gateWith(ON);
    const error = await asCaller(undefined, () => refusal(gate.assertOpen()));
    expect(error.code).toBe(ErrorCode.MAINTENANCE);
    expect(grantReads).toStrictEqual([]);
  });

  it('isOn() is the effective enabled', async () => {
    expect(await gateWith(ON).gate.isOn()).toBe(true);
    expect(await gateWith({ enabled: false }).gate.isOn()).toBe(false);
  });
});

// Review of PR #45: the restore runbook writes `system.maintenance` by SQL while the API is stopped
// (P8.BAK.03), so the row can hold a value P1.SYS.03 would refuse. The reader ignores such a row: the
// default `{ enabled: false }` applies, so maintenance is off — no 500 for everyone, and a string
// "false" is not read as on — and an error names the key and the issue.
describe('StoreMaintenanceGate — a malformed stored value is off', () => {
  it.each([
    ['JSON null', null, { path: [], code: 'invalid_type' }],
    ['the string "false"', { enabled: 'false' }, { path: ['enabled'], code: 'invalid_type' }],
    [
      'no `enabled` member',
      { until: null, message_mm: null },
      { path: ['enabled'], code: 'invalid_type' },
    ],
  ])('%s: every request passes, isOn() is false, the error is logged', async (_, stored, issue) => {
    const { gate, grantReads, errors } = gateOnStoredRow(stored);
    await asCaller('koAung', () => expect(gate.assertOpen()).resolves.toBeUndefined());
    expect(await gate.isOn()).toBe(false);
    expect(grantReads).toStrictEqual([]);
    expect(errors).toStrictEqual([
      { key: 'system.maintenance', issues: [issue] },
      { key: 'system.maintenance', issues: [issue] },
    ]);
  });

  it('a well-formed value written by SQL with only `enabled` is on', async () => {
    const { gate, errors } = gateOnStoredRow({ enabled: true });
    const error = await asCaller('koAung', () => refusal(gate.assertOpen()));
    expect(error.code).toBe(ErrorCode.MAINTENANCE);
    expect(errors).toStrictEqual([]);
  });
});
