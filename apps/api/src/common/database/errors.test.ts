import { describe, expect, it } from 'vitest';

import { isLeaveTypeNameTaken } from './errors.js';

// add-leave-types design D5 — the matcher behind 409 already_exists on a leave type's name.
const violation = (index: string, code = 'P2002') => ({
  code,
  meta: { driverAdapterError: { cause: { originalCode: '23505', constraint: { index } } } },
});

describe('isLeaveTypeNameTaken', () => {
  it('matches a unique violation of leave_types_name_active, from a model call or a raw query', () => {
    expect(isLeaveTypeNameTaken(violation('leave_types_name_active'))).toBe(true);
    expect(isLeaveTypeNameTaken(violation('leave_types_name_active', 'P2010'))).toBe(true);
  });

  it('does not match another index or a value that is not an error', () => {
    expect(isLeaveTypeNameTaken(violation('branches_company_id_code_idx'))).toBe(false);
    expect(isLeaveTypeNameTaken(new Error('boom'))).toBe(false);
    expect(isLeaveTypeNameTaken(null)).toBe(false);
  });
});
