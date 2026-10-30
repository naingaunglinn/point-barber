import { beforeEach, describe, expect, it, vi } from 'vitest';

// add-walkin-visit-checkout task 10.1 — the start page `/` opens Today and keeps the query.
const redirect = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ redirect }));
const { default: StartPage } = await import('./page');

beforeEach(() => redirect.mockReset());

describe('the start page', () => {
  it('`/` → `/today`', async () => {
    await StartPage({ searchParams: Promise.resolve({}) });
    expect(redirect).toHaveBeenCalledWith('/today');
  });

  it('`/?branch=B3` → `/today?branch=B3`', async () => {
    await StartPage({ searchParams: Promise.resolve({ branch: 'B3' }) });
    expect(redirect).toHaveBeenCalledWith('/today?branch=B3');
  });
});
