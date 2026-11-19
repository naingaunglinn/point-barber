import type { SettingScope } from '@point/shared';

import type { GrantSet } from '../../../common/access/grant-set.js';

// `SettingView.editable` (P1.SET.01 v1.4 · P1-RULE-13 · ADR-012 · owner SS4 · add-settings-store design
// D5): the access rule of P1.SET.03 for the caller, so the screen shows a control only where a write
// would pass — a company value needs settings.update at company scope; a branch value needs a key
// whose scope is `branch` and settings.update covering that branch; a read-only key never.
export interface EditableEntry {
  readonly scope: SettingScope;
  readonly read_only?: boolean;
}

export function isEditable(entry: EditableEntry, grants: GrantSet, branchId?: string): boolean {
  if (entry.read_only === true) return false;
  if (branchId === undefined) return grants.isCompany('settings.update');
  return entry.scope === 'branch' && grants.covers('settings.update', branchId);
}
