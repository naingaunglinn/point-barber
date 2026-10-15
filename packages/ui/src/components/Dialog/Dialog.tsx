'use client';

import { cn } from 'cn';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLayoutEffect, useRef, type ReactNode } from 'react';

import {
  Dialog as DialogRoot,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../primitives/dialog';
import { Button } from '../Button/Button';
import { useDialogOverDrawer } from './overlay-stack';

// The dialog base (AD-CMP-08 · AD-A11Y-02 · design D10): centred from 768 px, a bottom sheet below;
// the focus is trapped inside, Esc closes the top overlay, and the focus returns to the control that
// opened it (Radix). ConfirmDialog and ReasonDialog are built on it. Enter / exit take the overlay
// motion tokens (200 ms, ease-out in, ease-in out; 0 ms with reduced motion — AD-VIS-09).

export interface DialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Translated title; also the dialog's accessible name. */
  readonly title: string;
  /** Translated sentence under the title; the dialog's accessible description. */
  readonly description?: ReactNode;
  readonly children?: ReactNode;
  /** The action buttons: the primary action last (AD-LAY-04). */
  readonly footer?: ReactNode;
  /** `alertdialog` for a question that needs an answer (confirm, discard). */
  readonly role?: 'dialog' | 'alertdialog';
}

/**
 * The control that had the focus when the overlay opened gets it back on close (AD-A11Y-02). Radix
 * does this only for its own Trigger; the overlays of the system are opened by state.
 */
export function useReturnFocus(open: boolean): (event: Event) => void {
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    // Layout effects run before the overlay moves the focus inside (Radix, in a passive effect).
    if (open && document.activeElement instanceof HTMLElement)
      opener.current = document.activeElement;
  }, [open]);
  return (event) => {
    event.preventDefault();
    opener.current?.focus();
    opener.current = null;
  };
}

/** Overlay motion of the tokens (design D2 · AD-VIS-09), for every overlay of the system. */
export const OVERLAY_MOTION =
  'duration-[var(--motion-overlay)] data-open:ease-[var(--ease-enter)] data-closed:ease-[var(--ease-exit)]';

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  role = 'dialog',
}: DialogProps) {
  const t = useTranslations('common');
  useDialogOverDrawer(open);
  const returnFocus = useReturnFocus(open);
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        role={role}
        showCloseButton={false}
        onCloseAutoFocus={returnFocus}
        {...(description === undefined ? { 'aria-describedby': undefined } : {})}
        className={cn(
          'flex flex-col gap-4 bg-background p-0 text-base text-foreground',
          // A bottom sheet below 768 px …
          'max-md:top-auto max-md:bottom-0 max-md:left-0 max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:data-open:slide-in-from-bottom-10 max-md:data-closed:slide-out-to-bottom-10',
          // … centred from 768 px.
          'md:max-w-lg',
          OVERLAY_MOTION,
        )}
      >
        <div className="flex items-start gap-2 px-4 pt-4">
          <div className="flex flex-1 flex-col gap-1">
            <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
            {description === undefined ? null : (
              <DialogDescription className="text-sm text-muted-foreground">
                {description}
              </DialogDescription>
            )}
          </div>
          <Button
            variant="ghost"
            iconOnly
            icon={<X />}
            aria-label={t('action.close')}
            onClick={() => onOpenChange(false)}
          />
        </div>
        {children === undefined ? null : <div className="px-4">{children}</div>}
        {footer === undefined ? null : (
          <div className="flex flex-col-reverse gap-2 border-t border-border px-4 py-3 md:flex-row md:justify-end">
            {footer}
          </div>
        )}
      </DialogContent>
    </DialogRoot>
  );
}
