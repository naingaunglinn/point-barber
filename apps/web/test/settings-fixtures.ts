import {
  BranchStatus,
  type MeResponse,
  SETTINGS,
  ScopeType,
  type SettingKey,
  type SettingView,
  settingEntry,
} from '@point/shared';

import { IDS, meOf } from './pos-fixtures';

// add-settings-store — the settings of the Additional settings screen as P1.SET.01 answers them, on the
// fixture data of spec-fixtures (U Kyaw Zin the admin, Ma Hnin the B3 manager, Ko Aung a B3 barber;
// branches Point 1.0 – 3.0), with every key at its default unless a test says otherwise.

export const SETTINGS_IDS = {
  B1: '0199a3f2-0000-7000-8001-0000000000b1',
  B2: '0199a3f2-0000-7000-8001-0000000000b2',
  B3: IDS.B3,
  KYAW_ZIN_USER: '0199a3f2-0000-7000-8002-00000000e001',
  MA_HNIN_USER: '0199a3f2-0000-7000-8002-00000000e002',
} as const;

export const KYAW_ZIN_REF = {
  id: SETTINGS_IDS.KYAW_ZIN_USER,
  name_mm: 'ဦးကျော်ဇင်',
  name_en: 'U Kyaw Zin',
};
export const MA_HNIN_REF = { id: SETTINGS_IDS.MA_HNIN_USER, name_mm: 'မနှင်း', name_en: 'Ma Hnin' };

/** One SettingView of a key at its default; `overrides` changes what the API would answer. */
export function viewOf(key: SettingKey, overrides: Partial<SettingView> = {}): SettingView {
  const entry = settingEntry(key);
  return {
    key,
    definition: {
      type: entry.type,
      scope: entry.scope,
      module: entry.module,
      default: entry.default,
      label_key: entry.label_key,
      help_key: entry.help_key,
      impact_key: entry.impact_key,
      validation: entry.validation,
      client_readable: entry.client_readable,
    },
    company_value: null,
    effective: entry.default,
    source: 'default',
    editable: !('read_only' in entry),
    updated_at: null,
    updated_by: null,
    ...overrides,
  };
}

/** The company view of every key in file order: `editable` for the admin, read-only for a manager. */
export function listOf(
  options: {
    readonly editable?: boolean;
    readonly items?: Partial<Record<SettingKey, Partial<SettingView>>>;
    readonly branch?: boolean;
    /** Only these keys (a component test about some rows renders less); default every key. */
    readonly only?: readonly SettingKey[];
  } = {},
): { items: SettingView[] } {
  const { editable = true, items = {}, branch = false, only } = options;
  return {
    items: SETTINGS.filter((entry) => only === undefined || only.includes(entry.key)).map(
      (entry) => {
        const key = entry.key;
        const readOnly = 'read_only' in entry;
        const canEdit = editable && !readOnly && (!branch || entry.scope === 'branch');
        return viewOf(key, {
          editable: canEdit,
          ...(branch ? { branch_value: null } : {}),
          ...items[key],
        });
      },
    ),
  };
}

const BRANCHES: MeResponse['branches_in_scope'] = [
  {
    id: SETTINGS_IDS.B1,
    code: 'B1',
    name_mm: 'ပွိုင့် ၁.၀',
    name_en: 'Point 1.0',
    phone: null,
    status: BranchStatus.ACTIVE,
    is_public: true,
  },
  {
    id: SETTINGS_IDS.B2,
    code: 'B2',
    name_mm: 'ပွိုင့် ၂.၀',
    name_en: 'Point 2.0',
    phone: null,
    status: BranchStatus.ACTIVE,
    is_public: true,
  },
  {
    id: SETTINGS_IDS.B3,
    code: 'B3',
    name_mm: 'ပွိုင့် ၃.၀',
    name_en: 'Point 3.0',
    phone: null,
    status: BranchStatus.ACTIVE,
    is_public: true,
  },
];

const company = (code: string) => ({ code, scope_type: ScopeType.COMPANY, branch_ids: [] });
const atB3 = (code: string) => ({
  code,
  scope_type: ScopeType.BRANCHES,
  branch_ids: [SETTINGS_IDS.B3],
});

/** U Kyaw Zin (Admin, company scope) in English. */
export const kyawZinMe = (locale: 1 | 2 = 2): MeResponse =>
  meOf({
    user: { ...meOf().user, id: SETTINGS_IDS.KYAW_ZIN_USER, ui_language: locale },
    grants: [company('settings.view'), company('settings.update')],
    branches_in_scope: BRANCHES,
  });

/** Ma Hnin (Manager, B3). */
export const maHninMe = (locale: 1 | 2 = 2): MeResponse =>
  meOf({
    user: { ...meOf().user, id: SETTINGS_IDS.MA_HNIN_USER, ui_language: locale },
    grants: [atB3('settings.view'), atB3('settings.update'), atB3('visit.view')],
    branches_in_scope: BRANCHES.filter((branch) => branch.id === SETTINGS_IDS.B3),
  });

/** Ko Aung (Barber, B3) — no settings code. */
export const koAungMe = (): MeResponse =>
  meOf({ user: { ...meOf().user, ui_language: 2 }, grants: [atB3('sale.create')] });
