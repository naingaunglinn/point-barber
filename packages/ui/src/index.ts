// The public surface of @point/ui (AD-IMPL-03 · design D1). tokens.css is imported by path:
// `@point/ui/tokens.css`; the catalogue by `@point/ui/catalogue` (only /dev/ui imports it).
// Screens use these components, never the shadcn/ui parts of ./primitives (AD-IMPL-02).
export { fontPreloads, type FontPreload, type Locale, type Tree } from './fonts';

export { ClockProvider, useNow } from './providers/clock';
export { FormatProvider, useFormat, type FormatSettings } from './providers/format';
export { createQueryClient, QueryProvider } from './providers/query';

export { Button, type ButtonProps, type ButtonVariant } from './components/Button/Button';
export { DataText } from './components/DataText/DataText';
export { DateText, type DateTextMode, type DateTextProps } from './components/DateText/DateText';
export { Dialog, type DialogProps } from './components/Dialog/Dialog';
export {
  clampDrawerWidth,
  Drawer,
  Sheet,
  type DrawerProps,
  type SheetProps,
} from './components/Drawer/Drawer';
export {
  FormField,
  type FieldControlProps,
  type FieldError,
  type FormFieldProps,
} from './components/FormField/FormField';
export {
  LanguageSwitch,
  type LanguageSwitchProps,
} from './components/LanguageSwitch/LanguageSwitch';
export { MoneyText, type MoneyTextProps } from './components/MoneyText/MoneyText';
export { Skeleton, type SkeletonProps, type SkeletonShape } from './components/Skeleton/Skeleton';
export { toast, Toaster } from './components/Toaster/Toaster';

export {
  AppShell,
  type AppShellProps,
  type ShellModule,
  type ShellScreen,
} from './components/AppShell/AppShell';
export {
  ApprovalCard,
  type ApprovalCardProps,
  type ApprovalFact,
} from './components/ApprovalCard/ApprovalCard';
export {
  AttachmentUploader,
  type AttachmentUploaderProps,
  type UploadedFile,
  type UploadFunction,
  type UploadResult,
} from './components/AttachmentUploader/AttachmentUploader';
export {
  BilingualInput,
  type Bilingual,
  type BilingualInputProps,
} from './components/BilingualInput/BilingualInput';
export {
  BottomNav,
  type BottomNavCentre,
  type BottomNavProps,
  type NavLinkItem,
} from './components/BottomNav/BottomNav';
export {
  ALL_BRANCHES,
  BranchSwitcher,
  type BranchSwitcherProps,
  type SwitcherBranch,
} from './components/BranchSwitcher/BranchSwitcher';
export { CardList, type CardListProps } from './components/CardList/CardList';
export { CountBadge, countText } from './components/CountBadge/CountBadge';
export {
  BarChart,
  LineChart,
  MAX_SERIES,
  type ChartProps,
  type ChartSeries,
  type ChartValueKind,
} from './components/Chart/Chart';
export { ConfirmDialog, type ConfirmDialogProps } from './components/ConfirmDialog/ConfirmDialog';
export {
  DataTable,
  type DataTableColumn,
  type DataTableProps,
} from './components/DataTable/DataTable';
export { DateInput, type DateInputProps } from './components/DateInput/DateInput';
export { EmployeeChip, type EmployeeChipProps } from './components/EmployeeChip/EmployeeChip';
export { EmptyState, type EmptyStateProps } from './components/EmptyState/EmptyState';
export {
  ErrorState,
  type ErrorProblem,
  type ErrorStateProps,
} from './components/ErrorState/ErrorState';
export {
  filterFromSearch,
  searchWithFilter,
  type FilterPreset,
  type FilterValue,
} from './components/FilterBar/filter-address';
export { ALL_PRESETS, FilterBar, type FilterBarProps } from './components/FilterBar/FilterBar';
export { FlagChip, type FlagChipProps } from './components/FlagChip/FlagChip';
export {
  KpiRow,
  KpiTile,
  type KpiComparison,
  type KpiTileProps,
} from './components/KpiTile/KpiTile';
export {
  LockBanner,
  ReadOnlyFields,
  type LockBannerProps,
  type ReadOnlyField,
} from './components/LockBanner/LockBanner';
export { MoneyInput, type MoneyInputProps } from './components/MoneyInput/MoneyInput';
export {
  NotificationBell,
  type NotificationBellProps,
} from './components/NotificationBell/NotificationBell';
export { OfflineBanner, type OfflineBannerProps } from './components/OfflineBanner/OfflineBanner';
export {
  OptionPicker,
  type OptionGroup,
  type OptionGroups,
  type OptionPickerProps,
  type OptionValue,
  type SoldCell,
} from './components/OptionPicker/OptionPicker';
export { PageHeader, type PageHeaderProps } from './components/PageHeader/PageHeader';
export { Pagination } from './components/Pagination/Pagination';
export {
  PAGE_SIZES,
  usePagedList,
  type PagedList,
  type PagedListOptions,
  type PageSize,
} from './components/Pagination/use-paged-list';
export {
  PhoneInput,
  type PhoneInputProps,
  type PhoneValue,
} from './components/PhoneInput/PhoneInput';
export {
  PriceGridEditor,
  type GridBranch,
  type GridLocation,
  type PriceCell,
  type PriceGridEditorProps,
  type PriceGridGroups,
} from './components/PriceGridEditor/PriceGridEditor';
export { type QrErrorKind } from './components/QrScanner/camera';
export { QrScanner, type QrScannerProps, type QrSource } from './components/QrScanner/QrScanner';
export {
  descriptionOf,
  ReceiptRenderer,
  type ReceiptLanguage,
  type ReceiptRendererProps,
} from './components/ReceiptRenderer/ReceiptRenderer';
export {
  ReasonDialog,
  type MasterReason,
  type NoteMode,
  type PresetReason,
  type ReasonDialogProps,
  type ReasonResult,
  type ReasonSource,
} from './components/ReasonDialog/ReasonDialog';
export { SearchInput, type SearchInputProps } from './components/SearchInput/SearchInput';
export { StatusBadge, type StatusBadgeProps } from './components/StatusBadge/StatusBadge';
export { Stepper, type Step, type StepperProps } from './components/Stepper/Stepper';
export { TextInput, type TextInputProps } from './components/TextInput/TextInput';
export {
  TimeSlotPicker,
  type TimeSlotPickerProps,
} from './components/TimeSlotPicker/TimeSlotPicker';
export type { Action, CardFields, CardSpec } from './components/types';

export { FormAlert } from './forms/FormAlert';
export {
  applyProblem,
  fieldErrorOf,
  formResolver,
  registerField,
  useAppForm,
  useTextField,
  type AppFormProps,
} from './forms/use-app-form';

export { DESKTOP, TABLET, useMinWidth } from './hooks/use-min-width';

export { createGrants, type Blocked, type PermissionGateProps } from './permissions/grants';
