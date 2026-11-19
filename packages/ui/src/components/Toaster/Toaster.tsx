'use client';

import { toast as sonner } from 'sonner';

import { TABLET, useMinWidth } from '../../hooks/use-min-width';
import { Toaster as ToasterPrimitive } from '../../primitives/sonner';

// Success toasts (AD-TOAST-01 · AD-A11Y-04 · design D10): 4 s, one at a time, at the bottom above the
// bottom navigation below 768 px and top-right from 768 px, announced through the polite live region
// of the toaster. Errors that need action stay inline (AD-FORM-04), so only `success` exists.

const DURATION_MS = 4_000;
/** Above the 64 px bottom navigation, with the 16 px gutter (AD-LAY-03 · AD-VIS-07). */
const ABOVE_BOTTOM_NAV = 'calc(4rem + 1rem + env(safe-area-inset-bottom))';

export const toast = {
  /** Shows a translated success sentence ("Booking saved"); the toast before it goes away. */
  success(text: string): void {
    sonner.dismiss();
    sonner.success(text, { duration: DURATION_MS });
  },
};

export function Toaster() {
  const wide = useMinWidth(TABLET);
  return (
    <ToasterPrimitive
      position={wide ? 'top-right' : 'bottom-center'}
      offset={wide ? '1.5rem' : { bottom: ABOVE_BOTTOM_NAV }}
      mobileOffset={{ bottom: ABOVE_BOTTOM_NAV }}
      visibleToasts={1}
      duration={DURATION_MS}
    />
  );
}
