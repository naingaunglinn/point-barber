import { act, fireEvent, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { moneyFromWire, SaleStatus, sumMoney, type Mmk } from '@point/shared';

import { DEMO_SALES } from '../../catalogue/fixtures';
import { FormatProvider } from '../../providers/format';
import { renderIntl } from '../../test/intl';
import { mockViewport } from '../../test/viewport';
import { MoneyText } from '../MoneyText/MoneyText';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import type { CardSpec } from '../types';
import { DataTable, nextSort, type DataTableColumn } from './DataTable';

// ui-foundation "DataTable shows lists as a real table from 768 px" and "Lists become cards below 768 px"
// (AD-CMP-07 · AD-LIST-02 · AD-LIST-06 · AD-FMT-01 · AD-A11Y-07 · design D10). The rows are the four B3
// sales of 05/Oct/2026 (spec-fixtures.md §8).
interface Sale {
  readonly id: string;
  readonly receiptNo: string;
  readonly barber: string;
  readonly services: string;
  readonly amount: Mmk;
  readonly finishedAt: string;
}

const SALES: readonly Sale[] = DEMO_SALES.map((sale, i) => ({
  id: sale.receiptNo,
  receiptNo: sale.receiptNo,
  barber: sale.barber.name_en ?? sale.barber.name_mm,
  services: sale.services.map((s) => s.name_en).join(' + '),
  amount: sale.amount,
  finishedAt: `2026-10-05T1${i}:00:00+06:30`,
}));

const COLUMNS: readonly DataTableColumn<Sale>[] = [
  { key: 'receipt', header: 'Receipt no.', kind: 'text', value: (s) => s.receiptNo },
  {
    key: 'finished',
    header: 'Finished on',
    kind: 'date',
    value: (s) => s.finishedAt,
    sortKey: 'finished_at',
  },
  { key: 'barber', header: 'Barber', kind: 'text', value: (s) => s.barber },
  { key: 'services', header: 'Services', kind: 'text', value: (s) => s.services },
  { key: 'amount', kind: 'money', value: (s) => s.amount },
  {
    key: 'status',
    header: 'Status',
    kind: 'status',
    value: () => ({ table: 'sales', code: SaleStatus.FINISHED }),
  },
];

const card = (s: Sale): CardSpec => ({
  fields: [
    s.receiptNo,
    s.barber,
    <MoneyText key="a" amount={s.amount} />,
    <StatusBadge key="s" table="sales" code={SaleStatus.FINISHED} />,
  ],
});

function Sales({
  columns = COLUMNS,
  userId = 'admin',
  onSort,
}: {
  columns?: readonly DataTableColumn<Sale>[];
  userId?: string;
  onSort?: (sort: string) => void;
}) {
  const [sort, setSort] = useState<string | undefined>(undefined);
  return (
    <FormatProvider locale="en" profile="app">
      <DataTable
        columns={columns}
        rows={SALES}
        rowKey={(s) => s.id}
        card={card}
        userId={userId}
        storageKey="sales"
        totals={{ amount: sumMoney(SALES.map((s) => s.amount)) }}
        sort={sort}
        onSortChange={(next) => {
          setSort(next);
          onSort?.(next);
        }}
      />
    </FormatProvider>
  );
}

const headers = () => screen.getAllByRole('columnheader').map((th) => th.textContent);

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('DataTable', () => {
  it('Scenario: Sales table at 1280 px — Amount (Ks), the amounts right-aligned, the total 44,000', () => {
    mockViewport(1280);
    renderIntl(<Sales />);
    expect(headers()).toEqual([
      'Receipt no.',
      'Finished on',
      'Barber',
      'Services',
      'Amount (Ks)',
      'Status',
    ]);
    const amounts = screen
      .getAllByRole('row')
      .slice(1, 5)
      .map((row) => within(row).getAllByRole('cell')[4]);
    expect(amounts.map((cell) => cell?.textContent)).toEqual([
      '8,000',
      '10,000',
      '11,000',
      '15,000',
    ]);
    for (const cell of amounts) expect(cell?.className).toContain('text-end');
    const totals = document.querySelector('[data-slot="totals"]');
    expect(totals?.textContent).toBe('44,000');
    for (const th of screen.getAllByRole('columnheader'))
      expect(th.getAttribute('scope')).toBe('col');
  });

  it('Scenario: Sorting — -finished_at, then finished_at; Barber has no sort button', () => {
    mockViewport(1280);
    const onSort = vi.fn();
    renderIntl(<Sales onSort={onSort} />);
    fireEvent.click(screen.getByRole('button', { name: 'Finished on' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finished on' }));
    expect(onSort.mock.calls.map(([s]) => s)).toEqual(['-finished_at', 'finished_at']);
    expect(screen.queryByRole('button', { name: 'Barber' })).toBeNull();
    expect(nextSort('finished_at', 'finished_at')).toBe('-finished_at');
  });

  it('Scenario: Column limit on a tablet — 7 of 9 visible at 768 px, all 9 in the Columns menu; 48 / 56 px rows', () => {
    mockViewport(768);
    const nine: DataTableColumn<Sale>[] = [
      ...COLUMNS,
      { key: 'extra1', header: 'Extra 1', kind: 'text', value: () => 'x' },
      { key: 'extra2', header: 'Extra 2', kind: 'text', value: () => 'y' },
      { key: 'extra3', header: 'Extra 3', kind: 'text', value: () => 'z' },
    ];
    renderIntl(<Sales columns={nine} />);
    expect(headers()).toHaveLength(7);
    const row = screen.getAllByRole('row')[1];
    expect(row?.className).toContain('h-12');
    expect(row?.className).toContain('pointer-coarse:h-14');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Columns' }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getAllByRole('menuitemcheckbox')).toHaveLength(9);
  });

  it('Scenario: Column choice is per user — hidden for admin, visible for manager, still hidden for admin', () => {
    mockViewport(1280);
    const first = renderIntl(<Sales userId="admin" />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Columns' }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Services' }));
    act(() => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' }));
    expect(headers()).not.toContain('Services');
    first.unmount();
    const manager = renderIntl(<Sales userId="manager" />);
    expect(headers()).toContain('Services');
    manager.unmount();
    renderIntl(<Sales userId="admin" />);
    expect(headers()).not.toContain('Services');
    expect(window.localStorage.getItem('point.columns.sales.admin')).toContain('"services":false');
  });
});

describe('DataTable rows', () => {
  it('marks the selected row and reports a pressed row', () => {
    mockViewport(1280);
    const onRowPress = vi.fn();
    renderIntl(
      <FormatProvider locale="en" profile="app">
        <DataTable
          columns={COLUMNS}
          rows={SALES}
          rowKey={(s) => s.id}
          card={card}
          userId="admin"
          storageKey="sales"
          selectedId="B3-2026-OCT-00002"
          onRowPress={onRowPress}
        />
      </FormatProvider>,
    );
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((r) => r.getAttribute('aria-selected'))).toEqual([
      'false',
      'true',
      'false',
      'false',
    ]);
    expect(rows[1]?.className).toContain('bg-accent');
    fireEvent.click(rows[2] as HTMLElement);
    fireEvent.keyDown(rows[3] as HTMLElement, { key: 'Enter' });
    expect(onRowPress.mock.calls.map(([sale]) => (sale as Sale).receiptNo)).toEqual([
      'B3-2026-OCT-00003',
      'B3-2026-OCT-00004',
    ]);
  });

  it('Scenario: Table loading — skeleton rows after 400 ms, never a spinner', () => {
    vi.useFakeTimers();
    mockViewport(1280);
    renderIntl(
      <FormatProvider locale="en" profile="app">
        <DataTable
          columns={COLUMNS}
          rows={[]}
          rowKey={(s: Sale) => s.id}
          card={card}
          userId="admin"
          storageKey="sales"
          loading
        />
      </FormatProvider>,
    );
    act(() => vi.advanceTimersByTime(400));
    const shapes = document.querySelectorAll('[data-slot="skeleton"]');
    expect(shapes.length).toBe(5);
    expect(shapes[0]?.className).toContain('h-12');
    expect(document.querySelector('[data-slot="spinner"]')).toBeNull();
    vi.useRealTimers();
  });
});

describe('CardList below 768 px', () => {
  it('Scenario: The sales list at 320 px — no table; receipt, barber, 8,000 Ks and the badge on each card', () => {
    mockViewport(320);
    renderIntl(<Sales />);
    expect(document.querySelector('table')).toBeNull();
    const cards = document.querySelectorAll('[data-slot="card"]');
    expect(cards).toHaveLength(4);
    expect(cards[0]?.textContent).toBe('B3-2026-OCT-00001Ko Min8,000 KsFinished');
  });

  it('Scenario: Boundary at 767 and 768 px — cards, then a table', () => {
    mockViewport(767);
    const phone = renderIntl(<Sales />);
    expect(document.querySelector('table')).toBeNull();
    phone.unmount();
    mockViewport(768);
    renderIntl(<Sales />);
    expect(document.querySelector('table')).not.toBeNull();
  });

  it('Scenario: A fifth card field does not compile', () => {
    const four: CardSpec = { fields: ['a', 'b', 'c', 'd'] };
    // @ts-expect-error -- at most 4 fields (AD-LIST-02).
    const five: CardSpec = { fields: ['a', 'b', 'c', 'd', 'e'] };
    expect([four, five]).toHaveLength(2);
  });

  it('keeps money a whole MMK value', () => {
    expect(moneyFromWire(44_000)).toBe(sumMoney(SALES.map((s) => s.amount)));
  });
});
