'use client';

import { useTranslations } from 'next-intl';

import { Button } from '../Button/Button';
import { Dialog } from '../Dialog/Dialog';

// A confirmation (AD-CONF-01 · AD-CONF-02 · AD-LAY-04 · AD-NET-01 · AD-COPY-04 · design D10): the title
// names the action, the body states the consequence, the confirm button repeats the verb — there is no
// default "OK" and no body-less form (the props are required). An irreversible action adds "This can't
// be undone."; a destructive one uses the destructive style. "Go back" left, the verb last on the right;
// the confirm button is disabled with a spinner while its action runs, so one press is one call.

export interface ConfirmDialogProps {
  readonly open: boolean;
  /** The action, translated ("Send transfer"). */
  readonly title: string;
  /** What will happen (translated). */
  readonly consequence: string;
  /** The verb again ("Send transfer"). */
  readonly confirmLabel: string;
  readonly irreversible?: boolean;
  readonly destructive?: boolean;
  readonly onConfirm: () => void | Promise<unknown>;
  readonly onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  consequence,
  confirmLabel,
  irreversible = false,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const t = useTranslations('common');
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? undefined : onCancel())}
      role="alertdialog"
      title={title}
      description={
        <>
          <span className="block">{consequence}</span>
          {irreversible ? (
            <span className="mt-1 block font-semibold text-foreground">
              {t('confirm.irreversible')}
            </span>
          ) : null}
        </>
      }
      footer={
        <>
          <Button onClick={onCancel}>{t('action.goBack')}</Button>
          <Button variant={destructive ? 'destructive' : 'primary'} onClick={() => onConfirm()}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
