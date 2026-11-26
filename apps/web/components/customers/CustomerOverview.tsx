'use client';

import { useTranslations } from 'next-intl';

import { type CustomerDto, moneyFromWire } from '@point/shared';
import { DataText, DateText, EmployeeChip, KpiRow, KpiTile, MoneyText } from '@point/ui';

// The Overview tab of a customer's page (add-customer-management spec "The customer page shows the profile,
// the statistics and the history" · AD-CUS-02 · AD-VIS-12 · AD-FMT-01 · AD-FMT-02 · design D11 · task 4.6):
// the notes (or "No notes") and the five statistics of P3.CUS.04 — Visits, Total spent (kyats, MoneyText),
// Last visit (DateText), Preferred barber (the employee's name, or "–") and No-shows — with the caption
// `customer.stats.scopeNote` when the numbers are the viewer's branches' only (`scope_note = "read_scope"`;
// an Admin sees every branch and no caption). `cancelled_count` and `upcoming_bookings` come with the
// customer but are not shown — AD-CUS-02 lists the five statistics only.

const NOTHING = '–';

export function CustomerOverview({
  customer,
  updatedAt,
}: Readonly<{
  customer: CustomerDto;
  /** When the statistics were loaded (the tile never shows a number without its time). */
  updatedAt: string;
}>) {
  const t = useTranslations('customer');
  const { stats } = customer;
  const tiles = [
    ['visits', t('stats.visits'), <span key="v">{stats.visit_count}</span>],
    [
      'totalSpent',
      t('stats.totalSpent'),
      <MoneyText key="m" amount={moneyFromWire(stats.total_spent_amount)} />,
    ],
    [
      'lastVisit',
      t('stats.lastVisit'),
      stats.last_visit_at === null ? NOTHING : <DateText key="d" value={stats.last_visit_at} />,
    ],
    [
      'preferredBarber',
      t('stats.preferredBarber'),
      stats.preferred_employee === null ? (
        NOTHING
      ) : (
        <EmployeeChip key="p" name={stats.preferred_employee.display_name} />
      ),
    ],
    ['noShows', t('stats.noShows'), <span key="n">{stats.no_show_count}</span>],
  ] as const;
  return (
    <div className="grid gap-6" data-testid="customer-overview">
      <section className="grid gap-2" data-testid="customer-notes">
        <h2 className="text-lg font-semibold">{t('field.notes')}</h2>
        {customer.notes === null ? (
          <p className="text-muted-foreground">{t('detail.notesEmpty')}</p>
        ) : (
          <p className="break-words whitespace-pre-wrap">
            <DataText>{customer.notes}</DataText>
          </p>
        )}
      </section>
      <section className="grid gap-3">
        <KpiRow>
          {tiles.map(([key, label, value]) => (
            <div key={key} data-testid={`customer-stat-${key}`}>
              <KpiTile label={label} value={value} updatedAt={updatedAt} />
            </div>
          ))}
        </KpiRow>
        {stats.scope_note === 'read_scope' ? (
          <p className="text-sm text-muted-foreground" data-testid="customer-scope-note">
            {t('stats.scopeNote')}
          </p>
        ) : null}
      </section>
    </div>
  );
}
