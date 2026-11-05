import type { SettingScope, SettingSource } from '@point/shared';

// The effective value of one setting (P1-RULE-08 · P1.SET.04 · add-settings-store design D4): the
// branch row — only for a key whose scope is `branch` — else the company row, else the default of
// settings.json. `source` names the row used, except that a row whose value equals its parent's
// value (the company effective value for a branch row, the default for a company row) reports the
// parent's source. Pure: the rows come from one query of the repository.

/** One `settings` row as the repository reads it. */
export interface StoredSetting {
  readonly id: string;
  readonly key: string;
  readonly branch_id: string | null;
  readonly value: unknown;
  readonly updated_at: Date;
  readonly updated_by_user_id: string;
}

/** What resolution needs of an entry. */
export interface ResolvableEntry {
  readonly key: string;
  readonly scope: SettingScope;
  readonly default: unknown;
}

export interface Resolved {
  /** The company row's value; null when there is none. */
  readonly company_value: unknown;
  /** The branch row's value (null when there is none) — only when a branch was asked for. */
  readonly branch_value?: unknown;
  readonly effective: unknown;
  readonly source: SettingSource;
  /** The row behind the value shown: the branch row used, else the company row, else none. */
  readonly row: StoredSetting | null;
}

/** Deep equality of parsed JSON values; object members in any order (jsonb equality). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => sameValue(item, b[index]))
    );
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]))
  );
}

/** The effective value of `entry` for `branchId`, or the company value when it is absent. */
export function resolveSetting(
  entry: ResolvableEntry,
  rows: readonly StoredSetting[],
  branchId?: string,
): Resolved {
  const company = rows.find((row) => row.key === entry.key && row.branch_id === null);
  const companyEffective = company === undefined ? entry.default : company.value;
  const companySource: SettingSource =
    company === undefined || sameValue(company.value, entry.default) ? 'default' : 'company';
  const branch =
    branchId !== undefined && entry.scope === 'branch'
      ? rows.find((row) => row.key === entry.key && row.branch_id === branchId)
      : undefined;
  const base = { company_value: company === undefined ? null : company.value };
  const withBranch =
    branchId === undefined ? base : { ...base, branch_value: branch?.value ?? null };
  if (branch !== undefined) {
    return {
      ...withBranch,
      effective: branch.value,
      source: sameValue(branch.value, companyEffective) ? companySource : 'branch',
      row: branch,
    };
  }
  return {
    ...withBranch,
    effective: companyEffective,
    source: companySource,
    row: company ?? null,
  };
}
