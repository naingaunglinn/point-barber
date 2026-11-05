import { Injectable } from '@nestjs/common';
import {
  type EffectiveSettings,
  ErrorCode,
  SETTINGS,
  type SettingHistoryPage,
  type SettingKey,
  type SettingUser,
  type SettingView,
  isSettingKey,
  settingEntry,
  toMmtIso,
} from '@point/shared';

import { type GrantSet, type Scope, reaches } from '../../../common/access/grant-set.js';
import { Clock } from '../../../common/clock/clock.js';
import { decodeCursor, encodeCursor } from '../../../common/http/cursor.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { SettingsRepository } from '../repositories/settings.repository.js';
import { isEditable } from './editable.js';
import { CompanyOfSettings, SettingBranches, UserNames } from './ports.js';
import { type Resolved, resolveSetting } from './resolve.js';
import { CLIENT_READABLE_KEYS, SettingsReader } from './settings-reader.js';

// The settings store (D-PLT-16 · P1-RULE-08 · add-settings-store design D1 / D4 / D5 / D8): the list
// of every key with its values (P1.SET.01), the client-readable effective values (P1.SET.02) and the
// history of one value (P1.SET.05). Reads are open to any `settings.*` grant; the branch values are
// filtered here — a branch the caller's grant does not cover is an empty list, not a 404.

type Entry = (typeof SETTINGS)[number];

const CLIENT_READABLE: ReadonlySet<string> = new Set(CLIENT_READABLE_KEYS);

const notFound = () => new ProblemException(ErrorCode.NOT_FOUND, 404);

/** `SettingDefinition` of an entry — `read_only` is internal (editable says it). */
function definitionOf(entry: Entry): SettingView['definition'] {
  return {
    type: entry.type,
    scope: entry.scope,
    module: entry.module,
    default: structuredClone(entry.default),
    label_key: entry.label_key,
    help_key: entry.help_key,
    impact_key: entry.impact_key,
    validation: structuredClone(entry.validation),
    client_readable: entry.client_readable,
  };
}

/** One `SettingView` (P1.SET.01): `branch_value` only when a branch was asked for. */
export function settingView(
  entry: Entry,
  resolved: Resolved,
  editable: boolean,
  names: ReadonlyMap<string, SettingUser>,
): SettingView {
  const { row } = resolved;
  return {
    key: entry.key,
    definition: definitionOf(entry),
    company_value: resolved.company_value,
    ...('branch_value' in resolved ? { branch_value: resolved.branch_value } : {}),
    effective: structuredClone(resolved.effective),
    source: resolved.source,
    editable,
    updated_at: row === null ? null : toMmtIso(row.updated_at),
    updated_by: row === null ? null : (names.get(row.updated_by_user_id) ?? null),
  };
}

@Injectable()
export class SettingsStore {
  constructor(
    private readonly repository: SettingsRepository,
    private readonly company: CompanyOfSettings,
    private readonly names: UserNames,
    private readonly branches: SettingBranches,
    private readonly reader: SettingsReader,
    private readonly clock: Clock,
  ) {}

  /**
   * P1.SET.01: every key in file order (only `module`'s when given), with the company values and —
   * for a `branchId` the caller's settings grant covers — that branch's values; another branch, or
   * an id that is no branch, is an empty list.
   */
  async list(
    grants: GrantSet,
    filter: { readonly module?: string; readonly branchId?: string },
  ): Promise<SettingView[]> {
    const { branchId } = filter;
    if (branchId !== undefined) {
      if (!reaches(grants.branchesOfModule('settings'), branchId)) return [];
      if (!(await this.branches.exists(branchId))) return [];
    }
    const entries = SETTINGS.filter(
      (entry) => filter.module === undefined || entry.module === filter.module,
    );
    return this.viewsOf(grants, entries, branchId);
  }

  /**
   * The `SettingView` of one key — the answer of P1.SET.03 / 04 after the guard and the service
   * checked the key and the branch; with `branchId`, that branch's values.
   */
  async view(grants: GrantSet, key: SettingKey, branchId?: string): Promise<SettingView> {
    const [view] = await this.viewsOf(grants, [settingEntry(key)], branchId);
    if (view === undefined) throw new Error(`settings: no view of ${key}`);
    return view;
  }

  private async viewsOf(
    grants: GrantSet,
    entries: readonly Entry[],
    branchId: string | undefined,
  ): Promise<SettingView[]> {
    if (entries.length === 0) return [];
    const companyId = await this.company.id();
    const rows =
      companyId === null
        ? []
        : await this.repository.rowsOf(
            companyId,
            entries.map((entry) => entry.key),
            branchId ?? null,
          );
    const resolved = entries.map((entry) => resolveSetting(entry, rows, branchId));
    const names = await this.names.of(
      resolved.flatMap(({ row }) => (row === null ? [] : [row.updated_by_user_id])),
    );
    return entries.map((entry, index) =>
      settingView(entry, resolved[index] as Resolved, isEditable(entry, grants, branchId), names),
    );
  }

  /**
   * P1.SET.02: the effective values of client-readable keys — all of them when `keys` is absent —
   * for a branch in the caller's read scope, or the company values. Any other key, or a branch
   * outside the read scope, is 404 (API-PERM-03 · proposal reading 4).
   */
  async effectiveForClient(
    readScope: Scope,
    query: { readonly keys?: readonly string[]; readonly branchId?: string },
  ): Promise<EffectiveSettings> {
    const keys = query.keys ?? CLIENT_READABLE_KEYS;
    if (!keys.every((key) => CLIENT_READABLE.has(key))) throw notFound();
    if (query.branchId !== undefined && !reaches(readScope, query.branchId)) throw notFound();
    const values = await this.reader.effective(keys as readonly SettingKey[], query.branchId);
    return { values, as_of: toMmtIso(this.clock.now()) };
  }

  /**
   * P1.SET.05: the history of the company value, or of one branch's override, newest first. A key
   * that is not in settings.json is 404; a branch the caller's settings grant does not cover is an
   * empty page.
   */
  async history(
    grants: GrantSet,
    key: string,
    query: { readonly branchId?: string; readonly cursor?: string; readonly limit: number },
  ): Promise<SettingHistoryPage> {
    if (!isSettingKey(key)) throw notFound();
    const empty: SettingHistoryPage = { items: [], next_cursor: null };
    const { branchId } = query;
    if (branchId !== undefined && !reaches(grants.branchesOfModule('settings'), branchId)) {
      return empty;
    }
    const afterId = query.cursor === undefined ? null : decodeCursor(query.cursor);
    const companyId = await this.company.id();
    if (companyId === null) return empty;
    const rows = await this.repository.historyPage(
      companyId,
      key,
      branchId ?? null,
      afterId,
      query.limit,
    );
    const page = rows.slice(0, query.limit);
    const names = await this.names.of(page.map((row) => row.changed_by_user_id));
    const last = page.at(-1);
    return {
      items: page.map((row) => {
        const by = names.get(row.changed_by_user_id);
        if (by === undefined) {
          throw new Error(`settings history ${row.id}: the user who changed it has no employee`);
        }
        return {
          id: row.id,
          branch_id: row.branch_id,
          old_value: row.old_value,
          new_value: row.new_value,
          changed_at: toMmtIso(row.changed_at),
          changed_by: by,
        };
      }),
      next_cursor: rows.length > query.limit && last !== undefined ? encodeCursor(last.id) : null,
    };
  }
}
