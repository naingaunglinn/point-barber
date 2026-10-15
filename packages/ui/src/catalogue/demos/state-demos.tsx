'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { formatDate, formatTime, localized, type Mmk } from '@point/shared';

import { Button } from '../../components/Button/Button';
import { DataTable } from '../../components/DataTable/DataTable';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { ErrorState, type ErrorProblem } from '../../components/ErrorState/ErrorState';
import { FormField } from '../../components/FormField/FormField';
import { LockBanner, ReadOnlyFields } from '../../components/LockBanner/LockBanner';
import { MoneyInput } from '../../components/MoneyInput/MoneyInput';
import { MoneyText } from '../../components/MoneyText/MoneyText';
import { OfflineBanner } from '../../components/OfflineBanner/OfflineBanner';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { toast } from '../../components/Toaster/Toaster';
import { useFormat } from '../../providers/format';
import { useCataloguePersona } from '../catalogue-providers';
import { DemoToggle, HandlerLog } from '../demo-frame';
import { useFixtureCan } from '../fixture-grants';
import { BRANCHES, DEMO_SALES, DEMO_SALES_TOTAL, PEOPLE } from '../fixtures';

// States demos (task 9.7 · AD-STATE-01..06 · AD-TOAST-01 · AD-PERM-02 · design D12): skeletons for a slow
// and a fast load, the table while loading, the empty bookings for the persona, the error texts, the
// closed day with its read-only values and the reopen action for those who may, the offline banner and
// the success toast. Actions follow can() only (AD-META-06).

const SLOW_MS = 2000;
const FAST_MS = 200;

function LoadDemo({ ms }: { readonly ms: number }) {
  const t = useTranslations('devui.states');
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const run = () => {
    setState('loading');
    setTimeout(() => setState('done'), ms);
  };
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button onClick={run}>{t('load', { ms })}</Button>
      </div>
      {state === 'loading' ? <Skeleton shape="card" count={2} /> : null}
      {state === 'done' ? <p className="text-sm">{t('loaded')}</p> : null}
    </div>
  );
}

export const SlowLoadDemo = () => <LoadDemo ms={SLOW_MS} />;
export const FastLoadDemo = () => <LoadDemo ms={FAST_MS} />;

export function TableLoadingDemo() {
  const t = useTranslations('devui.lists');
  const persona = useCataloguePersona();
  return (
    <DataTable
      columns={[
        { key: 'receipt', header: t('receiptNo'), kind: 'text', value: (row) => row.receiptNo },
        { key: 'amount', kind: 'money', value: (row) => row.amount },
      ]}
      rows={DEMO_SALES}
      rowKey={(row) => row.receiptNo}
      card={(row) => ({ fields: [row.receiptNo, <MoneyText key="a" amount={row.amount} />] })}
      userId={persona}
      storageKey="demo-loading"
      loading
    />
  );
}

export function EmptyBookingsDemo() {
  const t = useTranslations('devui.states');
  const log = useTranslations('devui.log');
  const can = useFixtureCan();
  const [pressed, setPressed] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <EmptyState
        title={t('emptyTitle')}
        body={t('emptyBody')}
        action={{
          label: t('newBooking'),
          allowed: can('booking.create', { branchId: 'B3' }),
          onPress: () => setPressed(log('pressed', { label: t('newBooking') })),
        }}
      />
      <HandlerLog label={log('label')} value={pressed} />
    </div>
  );
}

const REQUEST_ID = '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70';
const PROBLEMS: readonly (ErrorProblem & { readonly detail?: string })[] = [
  { code: 'file_too_large', params: { max_mb: 10 } },
  { code: 'forbidden' },
  { code: 'not_found' },
  // The developer text never reaches the page (API-ERR-01).
  { code: 'zz_unknown', detail: 'stack trace line 1', request_id: REQUEST_ID },
  { code: 'internal_error', request_id: REQUEST_ID },
];

export function ErrorStatesDemo() {
  const log = useTranslations('devui.log');
  const [retried, setRetried] = useState(0);
  return (
    <div className="flex flex-col gap-3">
      {PROBLEMS.map((problem) => (
        <ErrorState
          key={problem.code}
          problem={problem}
          onRetry={problem.code === 'internal_error' ? () => setRetried((n) => n + 1) : undefined}
        />
      ))}
      <HandlerLog
        label={log('label')}
        value={retried === 0 ? '' : log('retried', { count: retried })}
      />
    </div>
  );
}

const CLOSED_DAY = '2026-10-04';
const CLOSED_AT = '2026-10-04T21:05:00+06:30';

export function ClosedDayDemo() {
  const t = useTranslations('devui.states');
  const log = useTranslations('devui.log');
  const { locale } = useFormat('LockBanner demo');
  const can = useFixtureCan();
  const [pressed, setPressed] = useState('');
  const b3 = BRANCHES.find((branch) => branch.code === 'B3');
  return (
    <div className="flex flex-col gap-3">
      <LockBanner
        message={t('closedBy', {
          date: formatDate(CLOSED_DAY, { locale }),
          branch: b3 === undefined ? '' : localized(b3, 'name', locale),
          name: localized(PEOPLE.hnin, 'name', locale),
          time: formatTime(CLOSED_AT, { locale }),
        })}
        correction={{
          text: t('adminCanReopen'),
          action: {
            label: t('reopenDay'),
            allowed: can('closing.reopen', { branchId: 'B3' }),
            onPress: () => setPressed(log('pressed', { label: t('reopenDay') })),
          },
        }}
      />
      <ReadOnlyFields
        fields={[
          { label: t('salesCount'), value: String(DEMO_SALES.length) },
          { label: t('salesTotal'), value: <MoneyText amount={DEMO_SALES_TOTAL} /> },
        ]}
      />
      <HandlerLog label={log('label')} value={pressed} />
    </div>
  );
}

export function OfflineDemo() {
  const t = useTranslations('devui.states');
  const inputs = useTranslations('devui.inputs');
  const [unreachable, setUnreachable] = useState(false);
  const [value, setValue] = useState<Mmk | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <DemoToggle label={t('apiUnreachable')} checked={unreachable} onChange={setUnreachable} />
      <p className="text-sm text-muted-foreground">{t('offlineHint')}</p>
      <OfflineBanner helpHref="#states" apiUnreachable={unreachable} />
      <div className="max-w-xs">
        <FormField label={inputs('price')}>
          {(control) => <MoneyInput {...control} value={value} onChange={setValue} />}
        </FormField>
      </div>
    </div>
  );
}

export function ToastDemo() {
  const t = useTranslations('devui.states');
  const [count, setCount] = useState(0);
  return (
    <div>
      <Button
        variant="primary"
        onClick={() => {
          const next = count + 1;
          setCount(next);
          toast.success(t('saved', { n: next }));
        }}
      >
        {t('raiseToast')}
      </Button>
    </div>
  );
}
