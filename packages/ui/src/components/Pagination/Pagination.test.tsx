import { act, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CursorPage } from '@point/shared';

import { PAGING_ROWS } from '../../catalogue/fixtures';
import { renderIntl } from '../../test/intl';
import { mockViewport } from '../../test/viewport';
import { Pagination } from './Pagination';
import { usePagedList, type PageSize } from './use-paged-list';

// ui-foundation "Lists page with the cursor contract" (AD-LIST-05 · API-DATA-08 · API-LIM-03 · design
// D10), on the 56 generated rows of spec-fixtures.md §8.
type Row = (typeof PAGING_ROWS)[number];

function fakeServer(withTotal = true) {
  return vi.fn(
    async ({
      limit,
      cursor,
    }: {
      limit: PageSize;
      cursor: string | null;
    }): Promise<CursorPage<Row>> => {
      const start = cursor === null ? 0 : Number(cursor);
      const items = PAGING_ROWS.slice(start, start + limit);
      const end = start + items.length;
      return {
        items,
        next_cursor: end < PAGING_ROWS.length ? String(end) : null,
        total: withTotal ? PAGING_ROWS.length : null,
      };
    },
  );
}

const SEARCH = 'q';

function List({ fetchPage }: { fetchPage: ReturnType<typeof fakeServer> }) {
  const [q, setQ] = useState('');
  const list = usePagedList({ fetchPage, resetKey: q });
  return (
    <>
      <input aria-label={SEARCH} value={q} onChange={(event) => setQ(event.target.value)} />
      <ol data-testid="rows">
        {list.items.map((row) => (
          <li key={row.position}>{row.position}</li>
        ))}
      </ol>
      <Pagination list={list} />
    </>
  );
}

const shown = () => {
  const rows = [...document.querySelectorAll('[data-testid="rows"] li')].map((li) =>
    Number(li.textContent),
  );
  return rows.length === 0 ? '' : `${rows[0]}–${rows.at(-1)}`;
};
const settle = () => act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));
const next = () => screen.getByRole('button', { name: 'Next' });

afterEach(() => vi.unstubAllGlobals());

describe('usePagedList and Pagination', () => {
  it('Scenario: Paging through 56 rows — 1–25 with the total 56, 26–50, 51–56 with no next page', async () => {
    mockViewport(320);
    const fetchPage = fakeServer();
    renderIntl(<List fetchPage={fetchPage} />);
    await settle();
    expect(shown()).toBe('1–25');
    expect(screen.getByText('Total 56')).toBeDefined();
    fireEvent.click(next());
    await settle();
    expect(shown()).toBe('26–50');
    fireEvent.click(next());
    await settle();
    expect(shown()).toBe('51–56');
    expect(next()).toHaveProperty('disabled', true);
    expect(fetchPage.mock.calls.map(([request]) => request)).toEqual([
      { limit: 25, cursor: null },
      { limit: 25, cursor: '25' },
      { limit: 25, cursor: '50' },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await settle();
    expect(shown()).toBe('26–50');
  });

  it('Scenario: Page size limit — 25, 50 and 100 at 1280 px; the next request carries limit 100', async () => {
    mockViewport(1280);
    const fetchPage = fakeServer();
    renderIntl(<List fetchPage={fetchPage} />);
    await settle();
    const select = screen.getByRole('combobox', { name: 'Rows per page' }) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['25', '50', '100']);
    fireEvent.change(select, { target: { value: '100' } });
    await settle();
    expect(fetchPage.mock.lastCall?.[0]).toEqual({ limit: 100, cursor: null });
    expect(shown()).toBe('1–56');
  });

  it('shows no page-size choice below 1024 px', async () => {
    mockViewport(1023);
    renderIntl(<List fetchPage={fakeServer()} />);
    await settle();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('Scenario: Unknown total and filter change — no total; a new search on page 2 shows page 1', async () => {
    mockViewport(320);
    const fetchPage = fakeServer(false);
    renderIntl(<List fetchPage={fetchPage} />);
    await settle();
    expect(document.querySelector('[data-slot="total"]')).toBeNull();
    fireEvent.click(next());
    await settle();
    expect(shown()).toBe('26–50');
    fireEvent.change(screen.getByRole('textbox', { name: SEARCH }), { target: { value: 'Ko' } });
    await settle();
    expect(shown()).toBe('1–25');
    expect(fetchPage.mock.lastCall?.[0]).toEqual({ limit: 25, cursor: null });
  });
});
