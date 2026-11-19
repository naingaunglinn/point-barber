import { RoleStatus, ScopeType, settingEntry } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { describe, expect, it } from 'vitest';

import { type AssignmentRow, GrantSet } from '../../../common/access/grant-set.js';
import { isEditable } from './editable.js';

// add-settings-store task 3.3 — spec "editable says which value the caller may change" (P1.SET.01
// v1.4 · P1-RULE-13 · ADR-012 · owner SS4 · design D5): a company value needs company-scope
// settings.update; a branch value needs a branch key and settings.update covering that branch; a
// read-only key is never editable.
const { B1, B3 } = FIXTURE_IDS.branches;
const TODAY = '2026-10-05';

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
const grantsOf = (assignments: AssignmentRow[]) =>
  GrantSet.build({ assignments, branches: [] }, TODAY);

// The seed roles of the fixture (spec-fixtures §2): the Admin at company scope, the Managers at
// their branch, the Barbers without a settings code.
const kyawZin = grantsOf([grant('settings.view', 'company'), grant('settings.update', 'company')]);
const maHnin = grantsOf([grant('settings.view', [B3]), grant('settings.update', [B3])]);
const koZaw = grantsOf([grant('settings.view', [B1]), grant('settings.update', [B1])]);
const koAung = grantsOf([grant('sale.create', [B3])]);

const SLOT = settingEntry('booking.slot_interval_minutes');
const FEE = settingEntry('home_service.transport_fee_amount');
const TRAVEL = settingEntry('home_service.travel_minutes');
const WIDTH = settingEntry('receipt.printer_width_mm');
const READ_ONLY = [
  settingEntry('system.maintenance'),
  settingEntry('sales.tax_enabled'),
  settingEntry('sales.service_charge_enabled'),
];

describe('add-settings-store · settings · editable says which value the caller may change', () => {
  it('Scenario: The admin', () => {
    expect(isEditable(SLOT, kyawZin)).toBe(true);
    for (const entry of READ_ONLY) expect(isEditable(entry, kyawZin), entry.key).toBe(false);
    // With a branch: the branch keys of any branch, never a company-only key.
    expect(isEditable(FEE, kyawZin, B1)).toBe(true);
    expect(isEditable(SLOT, kyawZin, B1)).toBe(false);
  });

  it('Scenario: A manager without a branch', () => {
    for (const entry of [SLOT, FEE, TRAVEL, WIDTH, ...READ_ONLY]) {
      expect(isEditable(entry, maHnin), entry.key).toBe(false);
    }
  });

  it('Scenario: A manager for her branch', () => {
    for (const entry of [FEE, TRAVEL, WIDTH]) expect(isEditable(entry, maHnin, B3)).toBe(true);
    expect(isEditable(SLOT, maHnin, B3)).toBe(false);
    // Not another branch.
    expect(isEditable(FEE, maHnin, B1)).toBe(false);
  });

  it('Ko Zaw at B1 may change the B1 printer width', () => {
    expect(isEditable(WIDTH, koZaw, B1)).toBe(true);
    expect(isEditable(WIDTH, koZaw, B3)).toBe(false);
  });

  it('a caller without settings.update changes nothing', () => {
    expect(isEditable(SLOT, koAung)).toBe(false);
    expect(isEditable(FEE, koAung, B3)).toBe(false);
  });
});
