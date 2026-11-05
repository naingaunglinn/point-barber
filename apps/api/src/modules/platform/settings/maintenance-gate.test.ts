import {
  ErrorCode,
  RoleStatus,
  ScopeType,
  type SettingKey,
  type SettingValues,
} from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { describe, expect, it } from 'vitest';

import type { AssignmentRow, GrantSourceRows } from '../../../common/access/grant-set.js';
import { Clock } from '../../../common/clock/clock.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { RequestContext, type RequestContextData } from '../../../common/http/request-context.js';
import { StoreMaintenanceGate } from './maintenance-gate.js';
import { RegisteredGrantSource } from './ports.js';
import type { SettingsReader } from './settings-reader.js';

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

function gateWith(maintenance: unknown) {
  const reads: string[] = [];
  const grantReads: string[] = [];
  const reader = {
    effective: <K extends SettingKey>(keys: readonly K[]) => {
      reads.push(...keys);
      return Promise.resolve({ 'system.maintenance': maintenance } as unknown as SettingValues<K>);
    },
  } as unknown as SettingsReader;
  const source = new RegisteredGrantSource();
  source.use({
    rowsFor: (employeeId) => {
      grantReads.push(employeeId);
      const rows = PEOPLE[employeeId];
      if (rows === undefined) throw new Error(`no fixture ${employeeId}`);
      return Promise.resolve(rows);
    },
  });
  return { gate: new StoreMaintenanceGate(reader, source, new FixedClock()), reads, grantReads };
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
