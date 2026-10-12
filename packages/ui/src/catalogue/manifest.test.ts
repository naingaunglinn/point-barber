import { describe, expect, it } from 'vitest';

import { anchorOf, MANIFEST } from './manifest';
import { CATALOGUE_SECTIONS } from './sections';

// ui-foundation "Every shared component has a demo" (AD-IMPL-02 · AD-IMPL-06 · design D12): the 38
// names of AD-IMPL-02 and the 7 supporting names — 45 entries, each with at least one demo.
const AD_IMPL_02 = [
  'AppShell',
  'BranchSwitcher',
  'BottomNav',
  'PageHeader',
  'FilterBar',
  'DataTable',
  'CardList',
  'StatusBadge',
  'FlagChip',
  'EmployeeChip',
  'MoneyInput',
  'MoneyText',
  'PhoneInput',
  'BilingualInput',
  'DateInput',
  'DateText',
  'TimeSlotPicker',
  'OptionPicker',
  'PriceGridEditor',
  'ReasonDialog',
  'ConfirmDialog',
  'Drawer',
  'Sheet',
  'Stepper',
  'EmptyState',
  'ErrorState',
  'LockBanner',
  'OfflineBanner',
  'PermissionGate',
  'can',
  'NotificationBell',
  'ApprovalCard',
  'QrScanner',
  'ReceiptRenderer',
  'AttachmentUploader',
  'KpiTile',
  'BarChart',
  'LineChart',
];
const SUPPORTING = [
  'Button',
  'FormField',
  'Dialog',
  'Skeleton',
  'Toaster',
  'LanguageSwitch',
  'DataText',
];

/**
 * Not built yet: task 7.37 waits for the owner (the `ReceiptLine` shape and the receipt label texts —
 * point-sdd work/pr2-notes, owner questions 4 and 5). Task 9.1 stays open until this list is empty.
 */
const PENDING = ['ReceiptRenderer'];

describe('catalogue manifest', () => {
  it('Scenario: Every shared component has a demo — 38 + 7 names, each with at least one demo', () => {
    expect(AD_IMPL_02).toHaveLength(38);
    expect(SUPPORTING).toHaveLength(7);
    const expected = [...AD_IMPL_02, ...SUPPORTING].filter((name) => !PENDING.includes(name));
    expect(MANIFEST.map((entry) => entry.name).sort()).toEqual([...expected].sort());
    for (const entry of MANIFEST) expect(entry.demos.length).toBeGreaterThan(0);
  });

  it('every entry sits in a catalogue section and has unique anchors and demo ids', () => {
    const sections = new Set<string>(CATALOGUE_SECTIONS.map((section) => section.id));
    const anchors = MANIFEST.map((entry) => anchorOf(entry.name));
    expect(new Set(anchors).size).toBe(anchors.length);
    for (const entry of MANIFEST) {
      expect(sections.has(entry.section)).toBe(true);
      const ids = entry.demos.map((demo) => demo.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(anchorOf('MoneyInput')).toBe('money-input');
  });
});
