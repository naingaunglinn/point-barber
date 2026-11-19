import type { BusinessDate, DatePreset } from '@point/shared';

// The filters of a list in the address (AD-LIST-01 · AD-LIST-05 · design D10): `q`, `from`, `to` and a
// repeated `status`, so a filtered list can be reloaded, bookmarked and shared. Other parameters of the
// page are kept.

export type FilterPreset = DatePreset | 'custom';

export interface FilterValue {
  readonly q?: string;
  readonly from?: BusinessDate;
  readonly to?: BusinessDate;
  /** Which preset made `from` / `to`; not in the address. */
  readonly preset?: FilterPreset;
  readonly status?: readonly number[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The filters in an address (`?q=…&from=…&to=…&status=1&status=2`). */
export function filterFromSearch(search: URLSearchParams): FilterValue {
  const q = search.get('q') ?? '';
  const from = search.get('from') ?? '';
  const to = search.get('to') ?? '';
  const status = search
    .getAll('status')
    .map(Number)
    .filter((code) => Number.isInteger(code));
  return {
    ...(q === '' ? {} : { q }),
    ...(DATE.test(from) ? { from } : {}),
    ...(DATE.test(to) ? { to } : {}),
    ...(status.length === 0 ? {} : { status }),
  };
}

/** The address search with the filters written in and the page's other parameters kept. */
export function searchWithFilter(current: URLSearchParams, value: FilterValue): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const key of ['q', 'from', 'to', 'status']) next.delete(key);
  if (value.q !== undefined && value.q !== '') next.set('q', value.q);
  if (value.from !== undefined) next.set('from', value.from);
  if (value.to !== undefined) next.set('to', value.to);
  for (const code of value.status ?? []) next.append('status', String(code));
  return next;
}
