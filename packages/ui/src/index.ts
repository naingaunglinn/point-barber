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

export { FormAlert } from './forms/FormAlert';
export {
  applyProblem,
  fieldErrorOf,
  formResolver,
  registerField,
  useAppForm,
  type AppFormProps,
} from './forms/use-app-form';

export { DESKTOP, TABLET, useMinWidth } from './hooks/use-min-width';
