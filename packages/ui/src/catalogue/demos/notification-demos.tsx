'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { localized, NotificationCategory, type NotificationItem } from '@point/shared';

import { ApprovalCard } from '../../components/ApprovalCard/ApprovalCard';
import { Button } from '../../components/Button/Button';
import { MoneyText } from '../../components/MoneyText/MoneyText';
import { NotificationBell } from '../../components/NotificationBell/NotificationBell';
import { QrScanner } from '../../components/QrScanner/QrScanner';
import { useFormat } from '../../providers/format';
import { HandlerLog } from '../demo-frame';
import { BRANCHES, DISCOUNT_APPROVAL, NOTIFICATIONS, PEOPLE } from '../fixtures';

// Demos of the data-less components (task 9.12 · AD-NTF-01 · AD-NTF-04 · AD-ATT-01 · AD-QA-03): the bell
// with the three fixture notifications at the catalogue clock, the discount approval, and the QR
// scanner with the mock and the camera source. Nothing leaves the page.

const B3 = BRANCHES.find((branch) => branch.code === 'B3') ?? BRANCHES[0];
const NOTIFICATION_TEXT = {
  [NotificationCategory.MONEY]: 'discount',
  [NotificationCategory.BOOKING]: 'booking',
  [NotificationCategory.SECURITY]: 'security',
} as const;

function useFixtureNotifications(): NotificationItem[] {
  const t = useTranslations('devui.bell');
  const { locale } = useFormat('NotificationBell demo');
  const branch = B3 === undefined ? '' : localized(B3, 'name', locale);
  return NOTIFICATIONS.map((notification, index) => {
    const key = NOTIFICATION_TEXT[notification.category as keyof typeof NOTIFICATION_TEXT];
    return {
      id: `n${index + 1}`,
      category: notification.category,
      // Ko Min asks for the discount; Ma Hnin is the user who signed in on a new device.
      text: t(key, {
        name: localized(key === 'discount' ? PEOPLE.min : PEOPLE.hnin, 'name', locale),
        branch,
      }),
      created_at: notification.at,
      read: index === 2,
      href: null,
    };
  });
}

export function BellListDemo() {
  const t = useTranslations('devui.log');
  const initial = useFixtureNotifications();
  const [items, setItems] = useState<readonly NotificationItem[] | null>(null);
  const [log, setLog] = useState('');
  const shown = items ?? initial;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <NotificationBell
          unreadCount={shown.filter((item) => !item.read).length}
          items={shown}
          onOpenItem={(id) => {
            setItems(shown.map((item) => (item.id === id ? { ...item, read: true } : item)));
            setLog(t('opened', { id }));
          }}
          onMarkAllRead={() => {
            setItems(shown.map((item) => ({ ...item, read: true })));
            setLog(t('markAllRead'));
          }}
          onDelete={(id) => {
            setItems(shown.filter((item) => item.id !== id));
            setLog(t('deleted', { id }));
          }}
        />
      </div>
      <HandlerLog label={t('label')} value={log} />
    </div>
  );
}

export function BellBadgeDemo() {
  const t = useTranslations('devui.bell');
  return (
    <ul className="flex flex-wrap gap-6">
      {[0, 99, 100].map((count) => (
        <li key={count} className="flex items-center gap-2 text-sm">
          <span>{t('count', { count })}</span>
          <NotificationBell
            unreadCount={count}
            items={[]}
            onOpenItem={() => undefined}
            onMarkAllRead={() => undefined}
            onDelete={() => undefined}
          />
        </li>
      ))}
    </ul>
  );
}

function ApprovalDemo({ canDecide }: { readonly canDecide: boolean }) {
  const t = useTranslations('devui.approval');
  const log = useTranslations('devui.log');
  const { locale } = useFormat('ApprovalCard demo');
  const [decision, setDecision] = useState('');
  const { barber, services, subtotal, discount, total } = DISCOUNT_APPROVAL;
  const branch = B3 === undefined ? '' : localized(B3, 'name', locale);
  return (
    <div className="flex flex-col gap-2">
      <ApprovalCard
        title={t('title')}
        requester={{ name: localized(barber, 'name', locale) }}
        branch={branch}
        facts={[
          {
            label: t('services'),
            value: services.map((service) => localized(service, 'name', locale)).join(' + '),
          },
          { label: t('subtotal'), value: <MoneyText amount={subtotal} /> },
          { label: t('discount'), value: <MoneyText amount={discount} /> },
        ]}
        result={{ label: t('total'), value: <MoneyText amount={total} /> }}
        reason={t('reason')}
        requestedAt={NOTIFICATIONS[0]?.at}
        canDecide={canDecide}
        onApprove={() => setDecision(log('approved'))}
        onReject={(note) => setDecision(log('rejected', { note }))}
      />
      {canDecide ? <HandlerLog label={log('label')} value={decision} /> : null}
    </div>
  );
}

export const ApprovalDecideDemo = () => <ApprovalDemo canDecide />;
export const ApprovalViewDemo = () => <ApprovalDemo canDecide={false} />;

/** The attendance QR of the fixtures (AD-QR-02): `/clock?t=<token>` on the app host. */
export const MOCK_QR_TEXT = 'https://app.point.test/clock?t=FIXTURE-TOKEN';

function ScannerDemo({ camera }: { readonly camera: boolean }) {
  const t = useTranslations('devui.qr');
  const log = useTranslations('devui.log');
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button onClick={() => setOpen(true)}>{t('open')}</Button>
      </div>
      {open ? (
        <QrScanner
          source={camera ? 'camera' : { mock: MOCK_QR_TEXT }}
          hint={t('hint')}
          onResult={(text) => {
            setResult(log('result', { text }));
            setOpen(false);
          }}
          onError={(kind) => setResult(log('error', { kind }))}
          onClose={() => setOpen(false)}
        />
      ) : null}
      <HandlerLog label={log('label')} value={result} />
    </div>
  );
}

export const QrMockDemo = () => <ScannerDemo camera={false} />;
export const QrCameraDemo = () => <ScannerDemo camera />;
