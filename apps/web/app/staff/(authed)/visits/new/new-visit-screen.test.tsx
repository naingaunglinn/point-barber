// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VisitStatus } from '@point/shared';

import { chooseTime } from '../../../../../test/late-entry';
import { IDS, meOf, saleOf, serviceOf, visitOf } from '../../../../../test/pos-fixtures';
import { renderPos, routeFetch } from '../../../../../test/pos-render';
import { json, problem } from '../../../../../test/render';

// add-walkin-visit-checkout tasks 10.5 – 10.9 — visits spec "START records a walk-in …", "START is
// idempotent on its Idempotency-Key", "A completed, unpaid visit blocks the performer's next START" and
// "Was it saved?" on the screen: Walk-in → the sheet (branch, me, chips) → Start sends one POST with a key
// and opens the sale; a double tap sends one request; the unpaid link opens that sale; no answer for
// 15 s → the key is looked up.
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/visits/new',
  useSearchParams: () => new URLSearchParams(),
}));
const { NewVisitScreen } = await import('./new-visit-screen');

const SERVICES = `GET /api/v1/services?branch_id=${IDS.B3}&pricing_mode=1&limit=100`;
const START = 'POST /api/v1/visits';
const services = json(200, {
  items: [serviceOf(IDS.HAIRCUT, 'Haircut', 1), serviceOf(IDS.SHAVE, 'Shave', 2)],
  next_cursor: null,
  total: null,
});
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  push.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const starts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
const keyOf = (call: Parameters<typeof fetch>) =>
  (call[1]?.headers as Record<string, string>)['Idempotency-Key'];

async function openSheet() {
  renderPos(<NewVisitScreen />);
  fireEvent.click(screen.getByRole('button', { name: 'Walk-in' }));
  await screen.findByRole('button', { name: 'Haircut' });
}

describe('START (P4.VIS.03)', () => {
  it('Scenario: First service chosen on the START sheet — one POST with a key, the sale opens', async () => {
    routeFetch(fetchMock, { [SERVICES]: services, [START]: json(201, visitOf()) });
    await openSheet();
    expect(screen.getByTestId('start-branch').textContent).toBe('Point 3.0');
    fireEvent.click(screen.getByRole('button', { name: 'Haircut' }));
    fireEvent.click(screen.getByTestId('start-submit'));
    fireEvent.click(screen.getByTestId('start-submit'));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/sales/${IDS.SALE}`));
    expect(starts()).toHaveLength(1);
    const [call] = starts();
    expect(keyOf(call as Parameters<typeof fetch>)).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(String(call?.[1]?.body))).toStrictEqual({
      branch_id: IDS.B3,
      items: [{ service_id: IDS.HAIRCUT }],
    });
  });

  it('a second tap after the answer, while the sale opens, starts nothing (workbook case 8)', async () => {
    routeFetch(fetchMock, { [SERVICES]: services, [START]: json(201, visitOf()) });
    await openSheet();
    fireEvent.click(screen.getByTestId('start-submit'));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/sales/${IDS.SALE}`));
    const button = screen.getByTestId('start-submit') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(button);
    await act(async () => undefined);
    expect(starts()).toHaveLength(1);
  });

  it('Scenario: Awaiting payment blocks the next customer — the message and the link to that sale', async () => {
    const waiting = '0199a3f2-0000-7000-8005-000000000009';
    const waitingSale = '0199a3f2-0000-7000-8006-000000000009';
    routeFetch(fetchMock, {
      [SERVICES]: services,
      [START]: json(422, problem(422, 'unpaid_visit_open', { context: { visit_id: waiting } })),
      [`GET /api/v1/visits/${waiting}`]: json(
        200,
        visitOf({
          id: waiting,
          status: VisitStatus.COMPLETED,
          sale: saleOf({ id: waitingSale, visit_id: waiting }),
        }),
      ),
    });
    await openSheet();
    fireEvent.click(screen.getByTestId('start-submit'));
    expect((await screen.findByTestId('start-unpaid')).textContent).toContain(
      'Finish payment for your previous customer first',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open the previous customer' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/sales/${waitingSale}`));
  });

  it('"Open the previous customer" whose read fails — busy while it reads, the alert in the sheet, the link kept; a second tap opens it', async () => {
    const waiting = '0199a3f2-0000-7000-8005-000000000009';
    const waitingSale = '0199a3f2-0000-7000-8006-000000000009';
    let reads = 0;
    let answer: (response: Response) => void = () => {};
    routeFetch(fetchMock, {
      [SERVICES]: services,
      [START]: json(422, problem(422, 'unpaid_visit_open', { context: { visit_id: waiting } })),
      [`GET /api/v1/visits/${waiting}`]: () => {
        reads += 1;
        return new Promise<Response>((resolve) => {
          answer = resolve;
        });
      },
    });
    await openSheet();
    fireEvent.click(screen.getByTestId('start-submit'));
    const link = (await screen.findByTestId('start-open-unpaid')) as HTMLButtonElement;
    fireEvent.click(link);
    await waitFor(() => expect(link.getAttribute('aria-busy')).toBe('true'));
    fireEvent.click(link);
    expect(reads).toBe(1);
    await act(async () => answer(json(500, problem(500, 'internal_error'))));
    const unpaid = screen.getByTestId('start-unpaid');
    expect(
      await within(unpaid).findByText(
        'Something went wrong on the server. Try again; if it happens again, give the error ID to an admin.',
      ),
    ).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(within(unpaid).getByTestId('start-open-unpaid'));
    await waitFor(() => expect(reads).toBe(2));
    await act(async () =>
      answer(
        json(
          200,
          visitOf({
            id: waiting,
            status: VisitStatus.COMPLETED,
            sale: saleOf({ id: waitingSale, visit_id: waiting }),
          }),
        ),
      ),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/sales/${waitingSale}`));
  });

  it('Scenario: Lost reply, then the lookup — "Checking whether it was saved…", then the visit opens', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let key = '';
    routeFetch(fetchMock, {
      [SERVICES]: services,
      [START]: (init) => {
        key = (init?.headers as Record<string, string>)['Idempotency-Key'] ?? '';
        return new Promise<Response>(() => undefined);
      },
    });
    await openSheet();
    fireEvent.click(screen.getByTestId('start-submit'));
    routeFetch(fetchMock, {
      [SERVICES]: services,
      [`GET /api/v1/me/requests/${key}`]: json(200, {
        client_request_id: key,
        resource_type: 'visit',
        id: IDS.VISIT,
        sale_id: IDS.SALE,
        visit_id: null,
      }),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/sales/${IDS.SALE}`));
  });

  it('nothing saved — "It wasn\'t saved" and Retry sends the same key', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const keys: string[] = [];
    routeFetch(fetchMock, {
      [SERVICES]: services,
      [START]: (init) => {
        keys.push((init?.headers as Record<string, string>)['Idempotency-Key'] ?? '');
        return keys.length === 1 ? new Promise<Response>(() => undefined) : json(201, visitOf());
      },
    });
    await openSheet();
    fireEvent.click(screen.getByTestId('start-submit'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(await screen.findByTestId('saved-not-saved')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/sales/${IDS.SALE}`));
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });
});

describe('the page title (task 13.8 · WCAG 2.4.2)', () => {
  it.each([
    ['en', 'Start a visit'],
    ['my', 'ဝန်ဆောင်မှု စမယ်'],
  ] as const)('%s: the document title is "%s"', async (locale, title) => {
    routeFetch(fetchMock, { [SERVICES]: services });
    renderPos(<NewVisitScreen />, { locale });
    await waitFor(() => expect(document.title).toBe(title));
    expect(document.head.querySelectorAll('title')).toHaveLength(1);
  });
});

// add-late-entry tasks 4.2 – 4.4 on the screen: START of yesterday's paper slip sends the reason and the
// start time (P4.VIS.03 `late_entry`); the three later times stay on this device for the steps.
// Each test fills up to four late-entry dates and times (a 288-time combobox each): 4.7–5.1 s in a
// full `pnpm test` on 8 cores against the 5 s default, so these get 10 s (measured on #18, 02/Nov/2026).
describe('late entry on START (add-late-entry)', { timeout: 10_000 }, () => {
  const lateMe = () =>
    meOf({
      grants: [{ code: 'sale.late_entry', scope_type: 2, branch_ids: [IDS.B3] }],
    });

  it('without sale.late_entry at the branch there is no link', async () => {
    routeFetch(fetchMock, { [SERVICES]: services });
    await openSheet();
    expect(screen.queryByTestId('late-entry-link')).toBeNull();
  });

  it('START sends late_entry with the reason and the start time, and keeps the later times by visit', async () => {
    localStorage.clear();
    routeFetch(fetchMock, { [SERVICES]: services, [START]: json(201, visitOf()) });
    renderPos(<NewVisitScreen />, { me: lateMe() });
    fireEvent.click(screen.getByRole('button', { name: 'Walk-in' }));
    await screen.findByRole('button', { name: 'Haircut' });
    fireEvent.click(screen.getByTestId('late-entry-link'));
    fireEvent.click(screen.getByTestId('late-entry-reason-1'));
    const fill = (key: string, label: string, time: string) => {
      const field = screen.getByTestId(`late-entry-${key}`);
      const input = within(field).getByRole('textbox', { name: `${label} — Date` });
      fireEvent.change(input, { target: { value: '04/Oct/2026' } });
      fireEvent.blur(input);
      chooseTime(key, time);
    };
    fill('started', 'Actual start time', '15:00');
    fill('completed', 'Completed time', '15:30');
    fill('received', 'Payment received time', '15:35');
    fill('finished', 'Finish time', '15:35');
    fireEvent.click(screen.getByTestId('start-submit'));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/sales/${IDS.SALE}`));
    expect(JSON.parse(String(starts()[0]?.[1]?.body))).toStrictEqual({
      branch_id: IDS.B3,
      items: [],
      late_entry: { reason: 1, started_at: '2026-10-04T15:00:00+06:30' },
    });
    expect(
      JSON.parse(localStorage.getItem(`point.lateEntry.${IDS.VISIT}`) ?? 'null'),
    ).toStrictEqual({
      completed_at: '2026-10-04T15:30:00+06:30',
      received_at: '2026-10-04T15:35:00+06:30',
      finished_at: '2026-10-04T15:35:00+06:30',
    });
  });
});
