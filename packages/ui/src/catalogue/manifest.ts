import type { ComponentType } from 'react';

import type { Messages } from '@point/i18n';

import { DataTextDemo, EmployeeChipDemo, FlagsDemo, StatusMapDemo } from './demos/badge-demos';
import {
  KpiSevenDemo,
  KpiSixDemo,
  LineSixDemo,
  LineThreeDemo,
  RevenueBarDemo,
  StepperDemo,
} from './demos/chart-demos';
import {
  ConfirmTransferDemo,
  DialogDemo,
  DrawerDemo,
  ReasonEightDemo,
  ReasonFreeDemo,
  ReasonMasterDemo,
  ReasonPresetDemo,
  ReasonSevenDemo,
  SheetDemo,
} from './demos/dialog-demos';
import { ButtonLoadingDemo, ButtonVariantsDemo, FormDemo } from './demos/form-demos';
import { LanguageSwitchDemo } from './demos/frame-controls';
import {
  BilingualInputDemo,
  DateInputDemo,
  DateTextDemo,
  MoneyInputDemo,
  MoneyTextDemo,
  PhoneInputDemo,
  TextInputDemo,
} from './demos/input-demos';
import {
  CardListDemo,
  FilterBarDemo,
  NineColumnsDemo,
  PagingDemo,
  SalesListDemo,
} from './demos/list-demos';
import {
  ApprovalDecideDemo,
  ApprovalViewDemo,
  BellBadgeDemo,
  BellListDemo,
  QrCameraDemo,
  QrMockDemo,
  ReceiptSaleDemo,
} from './demos/notification-demos';
import { CanTableDemo, GateDemo } from './demos/permission-demos';
import {
  OptionPickerDemo,
  PriceGridDemo,
  PriceGridHomeDemo,
  TimeSlotDemo,
} from './demos/picker-demos';
import {
  BottomNavCentreDemo,
  BottomNavPlainDemo,
  BranchSwitcherDemo,
  PageHeaderFourDemo,
  PageHeaderTwoDemo,
  ShellDemo,
} from './demos/shell-demos';
import {
  ClosedDayDemo,
  EmptyBookingsDemo,
  ErrorStatesDemo,
  FastLoadDemo,
  OfflineDemo,
  SlowLoadDemo,
  TableLoadingDemo,
  ToastDemo,
} from './demos/state-demos';
import { UploadDocumentDemo, UploadImageDemo, UploadImportDemo } from './demos/upload-demos';
import type { CatalogueSectionId } from './sections';

// The catalogue manifest (AD-IMPL-02 · AD-IMPL-06 · design D12): one entry per shared component —
// its section, the rules it implements and its demos. The page renders from it.

export interface ManifestDemo {
  readonly id: string;
  /** Key under `devui.demo`. */
  readonly title: keyof Messages['devui']['demo'];
  readonly Demo: ComponentType;
  /** Spans the whole section width (lists, grids, the shell). */
  readonly wide?: boolean;
  /** Runs edge to edge inside its card, without padding (the shell, which is a frame itself). */
  readonly bleed?: boolean;
}

export interface ManifestEntry {
  readonly name: string;
  readonly section: CatalogueSectionId;
  readonly rules: readonly string[];
  readonly demos: readonly ManifestDemo[];
}

export const MANIFEST: readonly ManifestEntry[] = [
  // Buttons and forms
  {
    name: 'Button',
    section: 'buttons-and-forms',
    rules: ['AD-CMP-01', 'AD-LAY-04', 'AD-A11Y-05', 'AD-NET-01'],
    demos: [
      { id: 'variants', title: 'buttonVariants', Demo: ButtonVariantsDemo },
      { id: 'loading', title: 'buttonLoading', Demo: ButtonLoadingDemo },
    ],
  },
  {
    name: 'FormField',
    section: 'buttons-and-forms',
    rules: ['D-UI-01', 'AD-FORM-01..05', 'API-ERR-03', 'AD-FORM-13'],
    demos: [
      { id: 'form', title: 'form', Demo: FormDemo },
      { id: 'note', title: 'textInput', Demo: TextInputDemo },
    ],
  },
  {
    name: 'LanguageSwitch',
    section: 'buttons-and-forms',
    rules: ['AD-L10N-06', 'D-PLT-03'],
    demos: [{ id: 'switch', title: 'languageSwitch', Demo: LanguageSwitchDemo }],
  },
  // Inputs
  {
    name: 'MoneyInput',
    section: 'inputs',
    rules: ['D-PLT-04', 'AD-FORM-11', 'AD-FMT-10', 'AD-FMT-01'],
    demos: [{ id: 'price', title: 'moneyInput', Demo: MoneyInputDemo }],
  },
  {
    name: 'MoneyText',
    section: 'inputs',
    rules: ['AD-FMT-01', 'FE-FMT-01'],
    demos: [{ id: 'sales', title: 'moneyText', Demo: MoneyTextDemo }],
  },
  {
    name: 'PhoneInput',
    section: 'inputs',
    rules: ['AD-FORM-10', 'FE-CMP-06', 'D-CUS-02'],
    demos: [{ id: 'phone', title: 'phoneInput', Demo: PhoneInputDemo }],
  },
  {
    name: 'BilingualInput',
    section: 'inputs',
    rules: ['D-DB-04', 'AD-FORM-09', 'AD-FORM-13'],
    demos: [{ id: 'service-name', title: 'bilingualInput', Demo: BilingualInputDemo }],
  },
  {
    name: 'DateInput',
    section: 'inputs',
    rules: ['D-PLT-05', 'D-PLT-15', 'AD-FORM-15'],
    demos: [{ id: 'visit-date', title: 'dateInput', Demo: DateInputDemo }],
  },
  {
    name: 'DateText',
    section: 'inputs',
    rules: ['AD-FMT-02', 'AD-FMT-09'],
    demos: [{ id: 'relative', title: 'dateText', Demo: DateTextDemo }],
  },
  {
    name: 'AttachmentUploader',
    section: 'inputs',
    rules: ['AD-FORM-16', 'API-LIM-03'],
    demos: [
      { id: 'image', title: 'uploadImage', Demo: UploadImageDemo },
      { id: 'document', title: 'uploadDocument', Demo: UploadDocumentDemo },
      { id: 'import', title: 'uploadImport', Demo: UploadImportDemo },
    ],
  },
  // Badges and chips
  {
    name: 'StatusBadge',
    section: 'badges-and-chips',
    rules: ['D-DB-03', 'AD-CMP-05', 'AD-IMPL-04', 'AD-A11Y-03'],
    demos: [{ id: 'map', title: 'statusMap', Demo: StatusMapDemo, wide: true }],
  },
  {
    name: 'FlagChip',
    section: 'badges-and-chips',
    rules: ['AD-CMP-06', 'AD-A11Y-03'],
    demos: [{ id: 'flags', title: 'flags', Demo: FlagsDemo }],
  },
  {
    name: 'EmployeeChip',
    section: 'badges-and-chips',
    rules: ['AD-CMP-09', 'AD-VIS-12'],
    demos: [{ id: 'people', title: 'employeeChip', Demo: EmployeeChipDemo }],
  },
  {
    name: 'DataText',
    section: 'badges-and-chips',
    rules: ['AD-L10N-03', 'AD-L10N-04'],
    demos: [{ id: 'names', title: 'dataText', Demo: DataTextDemo }],
  },
  // Dialogs and overlays
  {
    name: 'ReasonDialog',
    section: 'dialogs-and-overlays',
    rules: ['AD-RSN-01', 'AD-RSN-02', 'API-DATA-11', 'D-BKG-14', 'D-VIS-13'],
    demos: [
      { id: 'master', title: 'reasonMaster', Demo: ReasonMasterDemo },
      { id: 'seven', title: 'reasonSeven', Demo: ReasonSevenDemo },
      { id: 'eight', title: 'reasonEight', Demo: ReasonEightDemo },
      { id: 'preset', title: 'reasonPreset', Demo: ReasonPresetDemo },
      { id: 'free', title: 'reasonFree', Demo: ReasonFreeDemo },
    ],
  },
  {
    name: 'ConfirmDialog',
    section: 'dialogs-and-overlays',
    rules: ['AD-CONF-01', 'AD-CONF-02', 'AD-NET-01'],
    demos: [{ id: 'send-transfer', title: 'confirmTransfer', Demo: ConfirmTransferDemo }],
  },
  {
    name: 'Drawer',
    section: 'dialogs-and-overlays',
    rules: ['AD-CMP-08', 'AD-NAV-06', 'AD-FORM-08', 'AD-A11Y-02'],
    demos: [{ id: 'booking', title: 'drawer', Demo: DrawerDemo }],
  },
  {
    name: 'Sheet',
    section: 'dialogs-and-overlays',
    rules: ['AD-CMP-08', 'AD-LAY-03'],
    demos: [{ id: 'sheets', title: 'sheet', Demo: SheetDemo }],
  },
  {
    name: 'Dialog',
    section: 'dialogs-and-overlays',
    rules: ['AD-CMP-08', 'AD-A11Y-02'],
    demos: [{ id: 'plain', title: 'dialog', Demo: DialogDemo }],
  },
  // Lists
  {
    name: 'DataTable',
    section: 'lists',
    rules: ['AD-CMP-07', 'AD-LIST-02', 'AD-LIST-05', 'AD-LIST-06', 'AD-A11Y-07'],
    demos: [
      { id: 'sales', title: 'salesList', Demo: SalesListDemo, wide: true },
      { id: 'nine-columns', title: 'nineColumns', Demo: NineColumnsDemo, wide: true },
      { id: 'paging', title: 'paging', Demo: PagingDemo, wide: true },
    ],
  },
  {
    name: 'CardList',
    section: 'lists',
    rules: ['AD-LIST-02', 'AD-LAY-03'],
    demos: [{ id: 'sales', title: 'cardList', Demo: CardListDemo }],
  },
  {
    name: 'FilterBar',
    section: 'lists',
    rules: ['AD-LIST-01', 'AD-LIST-05', 'AD-FMT-11'],
    demos: [{ id: 'bookings', title: 'filterBar', Demo: FilterBarDemo }],
  },
  // States
  {
    name: 'Skeleton',
    section: 'states',
    rules: ['AD-STATE-01', 'AD-PERF-02'],
    demos: [
      { id: 'slow', title: 'slowLoad', Demo: SlowLoadDemo },
      { id: 'fast', title: 'fastLoad', Demo: FastLoadDemo },
      { id: 'table', title: 'tableLoading', Demo: TableLoadingDemo },
    ],
  },
  {
    name: 'EmptyState',
    section: 'states',
    rules: ['AD-STATE-02', 'AD-PERM-02'],
    demos: [{ id: 'bookings', title: 'emptyBookings', Demo: EmptyBookingsDemo }],
  },
  {
    name: 'ErrorState',
    section: 'states',
    rules: ['API-ERR-01', 'API-ERR-02', 'AD-STATE-03', 'AD-STATE-04'],
    demos: [{ id: 'codes', title: 'errorStates', Demo: ErrorStatesDemo }],
  },
  {
    name: 'LockBanner',
    section: 'states',
    rules: ['AD-DET-03', 'AD-STATE-06', 'AD-PERM-02'],
    demos: [{ id: 'closed-day', title: 'closedDay', Demo: ClosedDayDemo }],
  },
  {
    name: 'OfflineBanner',
    section: 'states',
    rules: ['AD-STATE-05', 'D-VIS-13'],
    demos: [{ id: 'offline', title: 'offline', Demo: OfflineDemo }],
  },
  {
    name: 'Toaster',
    section: 'states',
    rules: ['AD-TOAST-01', 'AD-A11Y-04'],
    demos: [{ id: 'success', title: 'toast', Demo: ToastDemo }],
  },
  // Permissions
  {
    name: 'PermissionGate',
    section: 'permissions',
    rules: ['AD-PERM-02', 'AD-PERM-04', 'AD-DET-03'],
    demos: [{ id: 'cancel-booking', title: 'gateCancel', Demo: GateDemo }],
  },
  {
    name: 'can',
    section: 'permissions',
    rules: ['AD-PERM-03', 'AD-PERM-05', 'API-AUTH-05', 'ADR-012'],
    demos: [{ id: 'persona', title: 'canTable', Demo: CanTableDemo }],
  },
  // Shell
  {
    name: 'AppShell',
    section: 'shell',
    rules: ['AD-LAY-01', 'AD-LAY-02', 'AD-LAY-03', 'AD-VIS-10', 'AD-VIS-11', 'AD-NAV-02'],
    demos: [{ id: 'persona', title: 'shellPersona', Demo: ShellDemo, wide: true, bleed: true }],
  },
  {
    name: 'BottomNav',
    section: 'shell',
    rules: ['AD-NAV-01', 'AD-LAY-03', 'AD-VIS-11'],
    demos: [
      { id: 'centre', title: 'bottomCentre', Demo: BottomNavCentreDemo },
      { id: 'no-centre', title: 'bottomPlain', Demo: BottomNavPlainDemo },
    ],
  },
  {
    name: 'BranchSwitcher',
    section: 'shell',
    rules: ['AD-NAV-04', 'AD-PERM-04', 'D-DSH-01', 'D-ROLE-03'],
    demos: [{ id: 'persona', title: 'branchPersona', Demo: BranchSwitcherDemo }],
  },
  {
    name: 'PageHeader',
    section: 'shell',
    rules: ['AD-LAY-05', 'AD-LAY-04'],
    demos: [
      { id: 'four-secondary', title: 'headerFour', Demo: PageHeaderFourDemo },
      { id: 'two-secondary', title: 'headerTwo', Demo: PageHeaderTwoDemo },
    ],
  },
  // Charts and KPI
  {
    name: 'Stepper',
    section: 'charts-and-kpi',
    rules: ['AD-CMP-12', 'AD-WIZ-01'],
    demos: [{ id: 'checkout', title: 'stepper', Demo: StepperDemo, wide: true }],
  },
  {
    name: 'KpiTile',
    section: 'charts-and-kpi',
    rules: ['AD-DSH-02', 'AD-DSH-03', 'AD-FMT-09'],
    demos: [
      { id: 'six', title: 'kpiSix', Demo: KpiSixDemo, wide: true },
      { id: 'seven', title: 'kpiSeven', Demo: KpiSevenDemo, wide: true },
    ],
  },
  {
    name: 'BarChart',
    section: 'charts-and-kpi',
    rules: ['AD-CHART-01', 'AD-A11Y-07'],
    demos: [{ id: 'revenue', title: 'revenueBar', Demo: RevenueBarDemo }],
  },
  {
    name: 'LineChart',
    section: 'charts-and-kpi',
    rules: ['AD-CHART-01', 'AD-A11Y-07'],
    demos: [
      { id: 'three', title: 'lineThree', Demo: LineThreeDemo },
      { id: 'six', title: 'lineSix', Demo: LineSixDemo },
    ],
  },
  // Pickers
  {
    name: 'TimeSlotPicker',
    section: 'pickers',
    rules: ['AD-BKG-01', 'D-PLT-05'],
    demos: [{ id: 'slots', title: 'timeSlots', Demo: TimeSlotDemo }],
  },
  {
    name: 'OptionPicker',
    section: 'pickers',
    rules: ['AD-POS-05', 'D-SVC-05', 'FE-FMT-01'],
    demos: [{ id: 'hair-colour', title: 'optionPicker', Demo: OptionPickerDemo }],
  },
  {
    name: 'PriceGridEditor',
    section: 'pickers',
    rules: ['AD-CMP-13', 'D-SVC-05', 'D-SVC-06', 'D-SVC-08'],
    demos: [
      { id: 'hair-colour', title: 'priceGrid', Demo: PriceGridDemo, wide: true },
      { id: 'home', title: 'priceGridHome', Demo: PriceGridHomeDemo },
    ],
  },
  // Data-less components
  {
    name: 'NotificationBell',
    section: 'data-less-components',
    rules: ['AD-NTF-01', 'D-NTF-01', 'D-NTF-02', 'AD-FMT-09'],
    demos: [
      { id: 'list', title: 'bellList', Demo: BellListDemo },
      { id: 'badge', title: 'bellBadge', Demo: BellBadgeDemo },
    ],
  },
  {
    name: 'ApprovalCard',
    section: 'data-less-components',
    rules: ['AD-NTF-04', 'AD-POS-16', 'AD-PERM-02'],
    demos: [
      { id: 'decide', title: 'approvalDecide', Demo: ApprovalDecideDemo },
      { id: 'view-only', title: 'approvalView', Demo: ApprovalViewDemo },
    ],
  },
  {
    name: 'QrScanner',
    section: 'data-less-components',
    rules: ['AD-ATT-01', 'AD-QA-03'],
    demos: [
      { id: 'mock', title: 'qrMock', Demo: QrMockDemo },
      { id: 'camera', title: 'qrCamera', Demo: QrCameraDemo },
    ],
  },
  {
    name: 'ReceiptRenderer',
    section: 'data-less-components',
    rules: ['AD-RCPT-01', 'D-PAY-06'],
    demos: [{ id: 'sale', title: 'receiptSale', Demo: ReceiptSaleDemo }],
  },
];

/** `MoneyInput` → `money-input`, the component's anchor on the page. */
export const anchorOf = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
