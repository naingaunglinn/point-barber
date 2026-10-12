'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { localized } from '@point/shared';

import { Button } from '../../components/Button/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog';
import { Dialog } from '../../components/Dialog/Dialog';
import { Drawer, Sheet } from '../../components/Drawer/Drawer';
import { FormField } from '../../components/FormField/FormField';
import {
  ReasonDialog,
  type MasterReason,
  type PresetReason,
  type ReasonResult,
  type ReasonSource,
} from '../../components/ReasonDialog/ReasonDialog';
import { TextInput } from '../../components/TextInput/TextInput';
import { useFormat } from '../../providers/format';
import { HandlerLog } from '../demo-frame';
import { BOOKING_CANCEL_REASONS, CUSTOMERS, PEOPLE } from '../fixtures';

// Dialogs and overlays demos (task 9.5 · AD-RSN-01 · AD-RSN-02 · AD-CONF-01 · AD-CMP-08 · AD-NAV-06 ·
// AD-FORM-08 · design D12): ReasonDialog with the three reason sources (4, 7 and 8 master reasons; the
// late-entry presets; free text whose result the demo maps to its endpoint's field), ConfirmDialog, the
// booking drawer with its address key, dirty guard and width cases, the two sheets and the plain dialog.

/** The DB Part 3 seed reasons, with demo ids. */
const SEED_REASONS: readonly MasterReason[] = BOOKING_CANCEL_REASONS.map((reason, index) => ({
  id: `reason-${index + 1}`,
  name_mm: reason.name_mm,
  name_en: reason.name_en,
  requires_note: reason.requiresNote,
}));

/** Extra reasons for the 7- and 8-item cases. */
function useMoreReasons(count: number): readonly MasterReason[] {
  const t = useTranslations('devui.reasons');
  const extra = Array.from({ length: Math.max(0, count - SEED_REASONS.length) }, (_, index) => {
    const n = SEED_REASONS.length + index + 1;
    return { id: `reason-${n}`, name_mm: t('extra', { n }), name_en: null, requires_note: false };
  });
  return [...SEED_REASONS.slice(0, count), ...extra];
}

/** The late-entry presets (D-VIS-13): codes 1–4 and 9; OTHER needs a note. */
const LATE_ENTRY: readonly PresetReason[] = [
  { code: 1, name: 'INTERNET_OUTAGE', requiresNote: false },
  { code: 2, name: 'POWER_OUTAGE', requiresNote: false },
  { code: 3, name: 'PHONE_BROKEN', requiresNote: false },
  { code: 4, name: 'FORGOT', requiresNote: false },
  { code: 9, name: 'OTHER', requiresNote: true },
];

function ReasonDemo({
  source,
  kind,
  mapBody,
}: {
  readonly source: ReasonSource;
  readonly kind: 'cancel' | 'lateEntry' | 'refund';
  /** The calling screen's mapping to its endpoint's field (refund: `{ reason }`). */
  readonly mapBody?: (result: ReasonResult) => object;
}) {
  const t = useTranslations('devui.reasons');
  const log = useTranslations('devui.log');
  const { locale } = useFormat('ReasonDialog demo');
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState('');
  const [body, setBody] = useState('');
  const consequence = t(`${kind}.consequence`, {
    customer: CUSTOMERS.maSu.name,
    barber: localized(PEOPLE.aung, 'name', locale),
  });
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          variant={kind === 'cancel' ? 'destructive' : 'secondary'}
          onClick={() => setOpen(true)}
        >
          {t(`${kind}.verb`)}
        </Button>
      </div>
      <ReasonDialog
        open={open}
        title={t(`${kind}.verb`)}
        consequence={consequence}
        source={source}
        confirmLabel={t(`${kind}.verb`)}
        note={source.type === 'free' ? 'required' : 'by-reason'}
        cancelLabel={kind === 'cancel' ? 'keep' : 'goBack'}
        destructive={kind !== 'lateEntry'}
        onConfirm={(value) => {
          setResult(log('result', { text: JSON.stringify(value) }));
          if (mapBody !== undefined) setBody(JSON.stringify(mapBody(value)));
          setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      />
      <HandlerLog label={log('label')} value={result} />
      {mapBody === undefined ? null : <HandlerLog label={t('requestBody')} value={body} />}
    </div>
  );
}

export const ReasonMasterDemo = () => (
  <ReasonDemo source={{ type: 'master', options: SEED_REASONS }} kind="cancel" />
);

export function ReasonSevenDemo() {
  return <ReasonDemo source={{ type: 'master', options: useMoreReasons(7) }} kind="cancel" />;
}

export function ReasonEightDemo() {
  return <ReasonDemo source={{ type: 'master', options: useMoreReasons(8) }} kind="cancel" />;
}

export const ReasonPresetDemo = () => (
  <ReasonDemo source={{ type: 'preset', options: LATE_ENTRY }} kind="lateEntry" />
);

export const ReasonFreeDemo = () => (
  <ReasonDemo
    source={{ type: 'free' }}
    kind="refund"
    // The refund endpoint takes `{ reason }` (P4.RFD) — the screen maps the dialog's note to it.
    mapBody={(result) => ({ reason: result.note ?? '' })}
  />
);

/** The send action takes 1 s, so a second press shows the guard. */
const SEND_MS = 1000;

export function ConfirmTransferDemo() {
  const t = useTranslations('devui.confirm');
  const log = useTranslations('devui.log');
  const [open, setOpen] = useState(false);
  const [calls, setCalls] = useState(0);
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button variant="primary" onClick={() => setOpen(true)}>
          {t('sendTransfer')}
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        title={t('sendTransfer')}
        consequence={t('sendConsequence')}
        confirmLabel={t('sendTransfer')}
        irreversible
        onConfirm={async () => {
          setCalls((count) => count + 1);
          await new Promise((resolve) => setTimeout(resolve, SEND_MS));
          setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      />
      <HandlerLog label={log('label')} value={t('calls', { count: calls })} />
    </div>
  );
}

const DRAWER_WIDTHS = [479, 480, 560, 640, 641] as const;

export function DrawerDemo() {
  const t = useTranslations('devui.drawer');
  const common = useTranslations('common.action');
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState<number>(560);
  const [name, setName] = useState<string>(CUSTOMERS.maSu.name);
  const dirty = name !== CUSTOMERS.maSu.name;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {DRAWER_WIDTHS.map((value) => (
          <Button
            key={value}
            variant={value === width ? 'primary' : 'secondary'}
            aria-pressed={value === width}
            onClick={() => setWidth(value)}
          >
            {t('width', { px: value })}
          </Button>
        ))}
      </div>
      <div>
        <Button
          onClick={() => {
            setName(CUSTOMERS.maSu.name);
            setOpen(true);
          }}
        >
          {t('open')}
        </Button>
      </div>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title={t('title')}
        urlKey="booking:demo-1"
        dirty={dirty}
        width={width}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>{common('cancel')}</Button>
            <Button variant="primary" onClick={() => setOpen(false)}>
              {common('save')}
            </Button>
          </>
        }
      >
        <FormField label={t('customerName')}>
          {(control) => <TextInput {...control} value={name} onChange={setName} />}
        </FormField>
        <p className="mt-4 text-sm text-muted-foreground">{t('body')}</p>
      </Drawer>
    </div>
  );
}

export function SheetDemo() {
  const t = useTranslations('devui.drawer');
  const common = useTranslations('common.action');
  const [side, setSide] = useState<'full' | 'bottom' | null>(null);
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => setSide('full')}>{t('openFull')}</Button>
      <Button onClick={() => setSide('bottom')}>{t('openBottom')}</Button>
      <Sheet
        open={side !== null}
        onOpenChange={(open) => (open ? undefined : setSide(null))}
        side={side ?? 'full'}
        title={t('sheetTitle')}
        footer={
          <Button variant="primary" fullWidth onClick={() => setSide(null)}>
            {common('save')}
          </Button>
        }
      >
        <p className="text-sm text-muted-foreground">{t('body')}</p>
      </Sheet>
    </div>
  );
}

export function DialogDemo() {
  const t = useTranslations('devui.drawer');
  const common = useTranslations('common.action');
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button onClick={() => setOpen(true)}>{t('openDialog')}</Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('dialogTitle')}
        description={t('body')}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>{common('cancel')}</Button>
            <Button variant="primary" onClick={() => setOpen(false)}>
              {common('save')}
            </Button>
          </>
        }
      />
    </div>
  );
}
