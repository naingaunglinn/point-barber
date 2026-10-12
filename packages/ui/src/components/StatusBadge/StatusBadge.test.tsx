import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  BookingStatus,
  PayrollRunStatus,
  SaleStatus,
  StockTransferStatus,
  VisitStatus,
} from '@point/shared';

import { renderIntl } from '../../test/intl';
import { FlagChip } from '../FlagChip/FlagChip';
import { StatusBadge } from './StatusBadge';

// ui-foundation "Status badges take tone, icon and label from one map" and "Flag chips mark exceptions
// with a fixed tone and icon" (D-DB-03 · AD-CMP-05 · AD-CMP-06 · AD-IMPL-04 · AD-A11Y-03 · design D8).
const badges = () =>
  [...document.querySelectorAll('[data-slot="status-badge"], [data-slot="flag-chip"]')].map(
    (badge) => ({
      tone: badge.getAttribute('data-tone'),
      icons: [...badge.querySelectorAll('[data-icon]')].map((icon) =>
        icon.getAttribute('data-icon'),
      ),
      text: badge.textContent,
    }),
  );

describe('StatusBadge', () => {
  it('Scenario: Visit statuses — info "In service" and warning "Awaiting payment", each with an icon', () => {
    renderIntl(
      <>
        <StatusBadge table="visits" code={VisitStatus.STARTED} />
        <StatusBadge table="visits" code={VisitStatus.COMPLETED} />
      </>,
    );
    expect(badges()).toEqual([
      { tone: 'info', icons: ['circle-dot'], text: 'In service' },
      { tone: 'warning', icons: ['triangle-alert'], text: 'Awaiting payment' },
    ]);
  });

  it('Scenario: Locked and ended states', () => {
    renderIntl(
      <>
        <StatusBadge table="sales" code={SaleStatus.FINISHED} />
        <StatusBadge table="payroll_runs" code={PayrollRunStatus.FINALIZED} />
        <StatusBadge table="payroll_runs" code={PayrollRunStatus.PUBLISHED} />
        <StatusBadge table="bookings" code={BookingStatus.CANCELLED} />
        <StatusBadge table="stock_transfers" code={StockTransferStatus.SENT} />
      </>,
    );
    expect(badges().map(({ tone, icons, text }) => [tone, icons.join('+'), text])).toEqual([
      ['success', 'lock', 'Finished'],
      ['warning', 'lock', 'Finalized'],
      ['warning', 'lock+send', 'Published'],
      ['muted', 'circle-slash', 'Cancelled'],
      ['info', 'circle-dot', 'In transit'],
    ]);
  });

  it('shows a derived state by name', () => {
    renderIntl(<StatusBadge table="payments" state="KBZPAY_UNVERIFIED" />);
    expect(badges()).toEqual([{ tone: 'warning', icons: ['triangle-alert'], text: 'Unverified' }]);
  });

  it('draws muted and danger as outline badges, the others on their subtle background', () => {
    renderIntl(
      <>
        <StatusBadge table="bookings" code={BookingStatus.CANCELLED} />
        <StatusBadge table="leaves" code={3} />
        <StatusBadge table="sales" code={SaleStatus.FINISHED} />
      </>,
    );
    const [muted, danger, success] = document.querySelectorAll('[data-slot="status-badge"]');
    expect(muted?.className).toContain('bg-transparent');
    expect(danger?.className).toContain('border-destructive');
    expect(danger?.className).toContain('bg-transparent');
    expect(success?.className).toContain('bg-success-subtle');
    expect(success?.className).toContain('text-success');
  });

  it('shows the Myanmar label in my', () => {
    renderIntl(<StatusBadge table="visits" code={VisitStatus.STARTED} />, { locale: 'my' });
    expect(screen.getByText('ဝန်ဆောင်မှု ပေးနေဆဲ')).toBeDefined();
  });

  it('accepts only a code of the table, and only a derived state of the table', () => {
    // @ts-expect-error -- 7 is no status of `sales` (D-DB-03: named constants).
    const wrongCode = <StatusBadge table="sales" code={7} />;
    // @ts-expect-error -- `DELETED` is no derived state of `payments`.
    const wrongState = <StatusBadge table="payments" state="DELETED" />;
    expect([wrongCode, wrongState]).toHaveLength(2);
  });
});

describe('FlagChip', () => {
  it('Scenario: Flags — Late entry, Recorded by Ko Min, Negative stock', () => {
    renderIntl(
      <>
        <FlagChip flag="late_entry" />
        <FlagChip flag="proxy_recorded" name="Ko Min" />
        <FlagChip flag="negative_stock" />
      </>,
    );
    expect(badges()).toEqual([
      { tone: 'warning', icons: ['clock'], text: 'Late entry' },
      { tone: 'info', icons: ['users'], text: 'Recorded by Ko Min' },
      { tone: 'danger', icons: ['triangle-alert'], text: 'Negative stock' },
    ]);
  });

  it('Scenario: Late entry in Myanmar', () => {
    renderIntl(<FlagChip flag="late_entry" />, { locale: 'my' });
    expect(badges()[0]?.text).toBe('နောက်မှ ထည့်သွင်းခြင်း');
  });

  it('writes the count of the short, over and reopened flags', () => {
    renderIntl(
      <>
        <FlagChip flag="transfer_short" count={2} />
        <FlagChip flag="reopened" count={1} />
      </>,
    );
    expect(badges().map((b) => b.text)).toEqual(['Short 2', 'Reopened ×1']);
  });
});
