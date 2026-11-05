'use client';

import { cn } from 'cn';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { Sheet as SheetRoot, SheetContent, SheetTitle } from '../../primitives/sheet';
import { Button } from '../Button/Button';
import { Dialog, OVERLAY_MOTION, useReturnFocus } from '../Dialog/Dialog';
import { DrawerLayerProvider } from '../Dialog/overlay-stack';

// Drawers and sheets (AD-CMP-08 · AD-LAY-02 · AD-LAY-03 · AD-NAV-06 · AD-FORM-08 · design D10). A drawer
// is a right panel 480–640 px wide (default 560) from 768 px and a full-screen sheet below, with a sticky
// header and a sticky bottom action bar around a scrolling body. With `urlKey` it is addressable
// (`?drawer=<urlKey>`) and the browser Back button closes it first. Closing it while `dirty` asks
// "Discard changes?". At most one dialog may be open above it.

export const DRAWER_WIDTH = { min: 480, max: 640, default: 560 } as const;

export function clampDrawerWidth(width: number = DRAWER_WIDTH.default): number {
  return Math.min(DRAWER_WIDTH.max, Math.max(DRAWER_WIDTH.min, width));
}

const PARAM = 'drawer';

/** The address with `?drawer=<key>` added or removed; the other parameters are kept. */
function addressWith(key: string | null): string {
  const params = new URLSearchParams(window.location.search);
  params.delete(PARAM);
  const rest = params.toString();
  // `:` may stay unescaped in a query (RFC 3986), so the address reads `?drawer=booking:demo-1`.
  const drawer = key === null ? '' : `${PARAM}=${encodeURIComponent(key).replace(/%3A/gi, ':')}`;
  const search = [rest, drawer].filter(Boolean).join('&');
  return `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
}

function drawerInAddress(): string | null {
  return new URLSearchParams(window.location.search).get(PARAM);
}

/** Keeps `?drawer=<key>` in the address while the drawer is open; Back asks the drawer to close. */
function useDrawerAddress(key: string | undefined, open: boolean, onBack: () => void): void {
  const pushed = useRef(false);
  const back = useRef(onBack);
  back.current = onBack;

  useEffect(() => {
    if (key === undefined) return;
    if (open && drawerInAddress() !== key) {
      window.history.pushState(null, '', addressWith(key));
      pushed.current = true;
    }
    if (!open && pushed.current && drawerInAddress() === key) {
      pushed.current = false;
      window.history.back();
    }
  }, [key, open]);

  useEffect(() => {
    if (key === undefined || !open) return;
    const onPopState = () => {
      if (drawerInAddress() === key) return;
      pushed.current = false;
      back.current();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [key, open]);
}

interface PanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly className: string;
  readonly style?: CSSProperties;
  readonly side: 'right' | 'bottom';
  /** On open, the first field of the body takes the focus instead of the close button. */
  readonly focusFirstField?: boolean;
}

const FIELD = 'input:not([type=hidden]), textarea, select, [contenteditable="true"]';

/** The common frame: sticky header with the close button, scrolling body, sticky action bar. */
function Panel(props: PanelProps) {
  const { open, onClose, title, children, footer, className, style, side, focusFirstField } = props;
  const t = useTranslations('common');
  const returnFocus = useReturnFocus(open);
  return (
    <SheetRoot open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent
        side={side}
        showCloseButton={false}
        aria-describedby={undefined}
        onCloseAutoFocus={returnFocus}
        onOpenAutoFocus={(event) => {
          if (!focusFirstField) return;
          const content = event.currentTarget as HTMLElement | null;
          const field = content?.querySelector<HTMLElement>(
            `[data-slot="panel-body"] :is(${FIELD})`,
          );
          if (field) {
            event.preventDefault();
            field.focus();
          }
        }}
        style={style}
        className={cn(
          'gap-0 bg-background p-0 text-base text-foreground',
          OVERLAY_MOTION,
          className,
        )}
      >
        <DrawerLayerProvider>
          <div
            className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2"
            data-slot="panel-header"
          >
            <SheetTitle className="flex-1 text-lg font-bold">{title}</SheetTitle>
            <Button
              variant="ghost"
              iconOnly
              icon={<X />}
              aria-label={t('action.close')}
              onClick={onClose}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" data-slot="panel-body">
            {children}
          </div>
          {footer === undefined ? null : (
            <div
              className="flex shrink-0 flex-col-reverse gap-2 border-t border-border px-4 py-3 md:flex-row md:justify-end"
              data-slot="panel-actions"
            >
              {footer}
            </div>
          )}
        </DrawerLayerProvider>
      </SheetContent>
    </SheetRoot>
  );
}

export interface DrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  /** Makes the drawer addressable: `?drawer=<urlKey>` while open (AD-NAV-06). */
  readonly urlKey?: string;
  /** The form inside holds unsaved edits: closing asks first (AD-FORM-08). */
  readonly dirty?: boolean;
  /** Panel width from 768 px, clamped to 480–640 px (default 560). */
  readonly width?: number;
}

export function Drawer({
  open,
  onOpenChange,
  title,
  children,
  footer,
  urlKey,
  dirty = false,
  width,
}: DrawerProps) {
  const t = useTranslations('common');
  const [asking, setAsking] = useState(false);
  const requestClose = () => (dirty ? setAsking(true) : onOpenChange(false));

  useDrawerAddress(urlKey, open, () => {
    if (!dirty) return onOpenChange(false);
    // Back with unsaved edits: stay, put the address back and ask.
    if (urlKey !== undefined) window.history.pushState(null, '', addressWith(urlKey));
    setAsking(true);
  });

  return (
    <>
      <Panel
        open={open}
        onClose={requestClose}
        title={title}
        footer={footer}
        side="right"
        style={{ '--drawer-width': `${clampDrawerWidth(width)}px` } as CSSProperties}
        className={cn(
          // A full-screen sheet below 768 px …
          'data-[side=right]:inset-0 data-[side=right]:h-dvh data-[side=right]:w-full data-[side=right]:border-0 data-[side=right]:sm:max-w-none',
          // … a right panel of --drawer-width from 768 px.
          'data-[side=right]:md:left-auto data-[side=right]:md:w-[var(--drawer-width)] data-[side=right]:md:max-w-full data-[side=right]:md:border-l',
        )}
      >
        {children}
        <Dialog
          open={asking}
          onOpenChange={setAsking}
          role="alertdialog"
          title={t('form.discard.title')}
          footer={
            <>
              <Button onClick={() => setAsking(false)}>{t('action.keepEditing')}</Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setAsking(false);
                  onOpenChange(false);
                }}
              >
                {t('action.discard')}
              </Button>
            </>
          }
        />
      </Panel>
    </>
  );
}

export interface SheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  /** `full`: the whole screen (a drawer on a phone); `bottom`: from the bottom edge (a dialog on a phone). */
  readonly side?: 'full' | 'bottom';
  /** On open, the first field takes the focus — a search sheet the user opened to type in. */
  readonly focusFirstField?: boolean;
}

export function Sheet(props: SheetProps) {
  const { open, onOpenChange, title, children, footer, side = 'full', focusFirstField } = props;
  return (
    <Panel
      open={open}
      onClose={() => onOpenChange(false)}
      title={title}
      footer={footer}
      focusFirstField={focusFirstField}
      side={side === 'full' ? 'right' : 'bottom'}
      className={
        side === 'full'
          ? 'data-[side=right]:inset-0 data-[side=right]:h-dvh data-[side=right]:w-full data-[side=right]:border-0 data-[side=right]:sm:max-w-none'
          : 'max-h-[90dvh] rounded-t-xl'
      }
    >
      {children}
    </Panel>
  );
}
