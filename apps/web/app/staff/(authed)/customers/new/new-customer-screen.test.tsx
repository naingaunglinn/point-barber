// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CustomerStatus } from '@point/shared';
import { toast } from '@point/ui';

import { CUSTOMER_IDS, PEOPLE, customerOf } from '../../../../../test/customer-fixtures';
import { renderPos, routeFetch } from '../../../../../test/pos-render';
import { json, problem } from '../../../../../test/render';

// add-customer-management tasks 4.3 / 4.5 — "The Add customer form shows an existing customer instead of a
// duplicate" (P3.CUS.03 · AD-FORM-01 / 02 / 04 / 08 / 10 · AD-PERM-02 · design D11) and the page guard of
// /customers/new: the asterisks, the phone preview, `phone_invalid` under Phone, the existing-phone alert
// with Open customer and — for an archived holder and `customer.delete` — Restore, the typed values kept,
// the toast and the customer page, and the shared "Discard changes?" guard.
const push = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn() }),
  usePathname: () => '/customers/new',
  useSearchParams: () => new URLSearchParams(),
}));
const { NewCustomerScreen } = await import('./new-customer-screen');

const CREATE = 'POST /api/v1/customers';
const KO_PHYO = customerOf({
  id: CUSTOMER_IDS.KO_PHYO,
  name: 'Ko Phyo',
  phone: '09 4500 1122',
  phone_normalized: '+95945001122',
  notes: null,
  last_visit_at: null,
  visit_count: 0,
  stats: {
    visit_count: 0,
    total_spent_amount: 0,
    last_visit_at: null,
    no_show_count: 0,
    cancelled_count: 0,
    preferred_employee: null,
    scope_note: 'read_scope',
  },
});

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const field = (member: string) => screen.getByTestId(`customer-field-${member}`);
const input = (member: string) => within(field(member)).getByRole('textbox') as HTMLInputElement;
const type = (element: HTMLElement, value: string) =>
  fireEvent.change(element, { target: { value } });
const messageOf = (element: HTMLElement) =>
  document.getElementById(element.getAttribute('aria-describedby')?.split(' ')[0] ?? '')
    ?.textContent;
const requests = () =>
  fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${String(url)}`);
const sentBody = () => {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
  return JSON.parse(String(call?.[1]?.body)) as unknown;
};

/** Save as a person presses it: the focus moves to the button first, then the click. */
async function save() {
  const button = screen.getByTestId('customer-save');
  act(() => button.focus());
  fireEvent.click(button);
  await flush();
  await flush();
}

function fillTaken(phone: string) {
  type(input('name'), 'Su Su');
  type(input('phone'), phone);
}

describe('Add customer — the form', () => {
  it('has the asterisk on Name and Phone only, a helper under Notes, and the phone preview', () => {
    renderPos(<NewCustomerScreen />, { me: PEOPLE.aung });
    const marks = [
      ...screen.getByTestId('customer-form').querySelectorAll('[data-slot="required-mark"]'),
    ];
    expect(marks).toHaveLength(2);
    expect(field('name').contains(marks[0] ?? null)).toBe(true);
    expect(field('phone').contains(marks[1] ?? null)).toBe(true);
    expect(field('notes').textContent).not.toContain('*');
    expect(field('notes').textContent).toContain('Every staff member can see these notes.');
    expect(input('phone').getAttribute('inputmode')).toBe('tel');
    type(input('phone'), '0945001122');
    expect(field('phone').textContent).toContain('09 4500 1122');
  });

  it('Scenario: Ko Aung adds Ko Phyo — the toast "Customer saved" and the page of Ko Phyo opens', async () => {
    const saved = vi.spyOn(toast, 'success');
    routeFetch(fetchMock, { [CREATE]: json(201, KO_PHYO) });
    renderPos(<NewCustomerScreen />, { me: PEOPLE.aung });
    type(input('name'), 'Ko Phyo');
    type(input('phone'), '09 4500 1122');
    await save();
    expect(sentBody()).toStrictEqual({ name: 'Ko Phyo', phone: '09 4500 1122' });
    expect(saved).toHaveBeenCalledWith('Customer saved');
    expect(replace).toHaveBeenCalledWith(`/customers/${CUSTOMER_IDS.KO_PHYO}`);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('sends the notes typed, trimmed by the schema; blank notes are not sent', async () => {
    routeFetch(fetchMock, { [CREATE]: json(201, KO_PHYO) });
    renderPos(<NewCustomerScreen />, { me: PEOPLE.aung });
    type(input('name'), ' Ko Phyo ');
    type(input('phone'), '09 4500 1122');
    type(input('notes'), '  Short fade  ');
    await save();
    expect(sentBody()).toStrictEqual({
      name: 'Ko Phyo',
      phone: '09 4500 1122',
      notes: 'Short fade',
    });
  });

  it('a blank Name and Phone say "required" under their fields and nothing is sent', async () => {
    renderPos(<NewCustomerScreen />, { me: PEOPLE.aung });
    await save();
    expect(messageOf(input('name'))).toBe('This field is required.');
    expect(messageOf(input('phone'))).toBe('This field is required.');
    expect(requests()).toStrictEqual([]);
  });

  it('`12` is `phone_invalid` under Phone before anything is sent', async () => {
    renderPos(<NewCustomerScreen />, { me: PEOPLE.aung });
    type(input('name'), 'Ko Phyo');
    type(input('phone'), '12');
    await save();
    expect(messageOf(input('phone'))).toBe('Enter a valid phone number.');
    expect(requests()).toStrictEqual([]);
  });

  it("puts the API's errors[] under their fields — Zawgyi in the name — and keeps what was typed", async () => {
    routeFetch(fetchMock, {
      [CREATE]: json(
        400,
        problem(400, 'zawgyi_text', { errors: [{ field: 'name', code: 'zawgyi_text' }] }),
      ),
    });
    renderPos(<NewCustomerScreen />, { me: PEOPLE.aung });
    type(input('name'), 'Ko Phyo');
    type(input('phone'), '09 4500 1122');
    await save();
    expect(messageOf(input('name'))).toBe('This text is in Zawgyi. Please type it in Unicode.');
    expect(input('name').value).toBe('Ko Phyo');
  });

  it('a refusal without a field is the alert at the top', async () => {
    routeFetch(fetchMock, { [CREATE]: json(403, problem(403, 'forbidden')) });
    renderPos(<NewCustomerScreen />, { me: PEOPLE.aung });
    type(input('name'), 'Ko Phyo');
    type(input('phone'), '09 4500 1122');
    await save();
    expect(screen.getByTestId('customer-form').querySelector('[role="alert"]')).not.toBeNull();
    expect(push).not.toHaveBeenCalled();
  });
});

describe('Add customer — a phone that already belongs to a customer', () => {
  const taken = (archived: boolean) =>
    json(
      409,
      problem(409, 'already_exists', {
        context: { customer_id: CUSTOMER_IDS.MA_SU, status: CustomerStatus.ACTIVE, archived },
      }),
    );

  it('Scenario: An existing phone — the alert with Open customer, which opens Ma Su; the typed values stay', async () => {
    routeFetch(fetchMock, { [CREATE]: taken(false) });
    renderPos(<NewCustomerScreen />, { me: PEOPLE.aung });
    fillTaken('09 7712 3456');
    await save();
    const alert = screen.getByTestId('customer-phone-taken');
    expect(alert.textContent).toContain('A customer with this phone already exists.');
    expect(input('name').value).toBe('Su Su');
    expect(input('phone').value).toBe('09 7712 3456');
    expect(within(alert).queryByRole('button', { name: 'Restore' })).toBeNull();
    // Open customer leaves the unsaved form, so the shared guard asks first.
    fireEvent.click(within(alert).getByRole('button', { name: 'Open customer' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Discard changes?' });
    expect(replace).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));
    expect(replace).toHaveBeenCalledWith(`/customers/${CUSTOMER_IDS.MA_SU}`);
  });

  it("Scenario: An archived phone and who may restore — Ko Aung's alert offers Open customer only", async () => {
    routeFetch(fetchMock, { [CREATE]: taken(true) });
    renderPos(<NewCustomerScreen />, { me: PEOPLE.aung });
    fillTaken('09 4411 2233');
    await save();
    const alert = screen.getByTestId('customer-phone-taken');
    expect(within(alert).getByRole('button', { name: 'Open customer' })).toBeTruthy();
    expect(within(alert).queryByRole('button', { name: 'Restore' })).toBeNull();
  });

  it("…U Kyaw Zin's also offers Restore, which restores the customer, toasts and opens the page", async () => {
    const restored = vi.spyOn(toast, 'success');
    routeFetch(fetchMock, {
      [CREATE]: taken(true),
      [`POST /api/v1/customers/${CUSTOMER_IDS.MA_SU}/restore`]: json(200, customerOf()),
    });
    renderPos(<NewCustomerScreen />, { me: PEOPLE.kyawZin });
    fillTaken('09 4411 2233');
    await save();
    fireEvent.click(
      within(screen.getByTestId('customer-phone-taken')).getByRole('button', { name: 'Restore' }),
    );
    await flush();
    await flush();
    expect(requests()).toContain(`POST /api/v1/customers/${CUSTOMER_IDS.MA_SU}/restore`);
    expect(restored).toHaveBeenCalledWith('Customer restored');
    expect(replace).toHaveBeenCalledWith(`/customers/${CUSTOMER_IDS.MA_SU}`);
  });
});

describe('Add customer — leaving, and the page guard', () => {
  it('Cancel with nothing typed goes back to the list; after typing it asks "Discard changes?"', async () => {
    renderPos(<NewCustomerScreen />, { me: PEOPLE.aung });
    fireEvent.click(screen.getByTestId('customer-cancel'));
    expect(push).toHaveBeenCalledWith('/customers');
    push.mockReset();
    type(input('name'), 'Ko Phyo');
    fireEvent.click(screen.getByTestId('customer-cancel'));
    const dialog = await screen.findByRole('alertdialog', { name: 'Discard changes?' });
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));
    expect(replace).toHaveBeenCalledWith('/customers');
  });

  it('shows the form in Myanmar', () => {
    renderPos(<NewCustomerScreen />, { me: PEOPLE.aung, locale: 'my' });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('ဧည့်သည် ထည့်မယ်');
    expect(field('name').textContent).toContain('အမည်');
    expect(field('phone').textContent).toContain('ဖုန်း');
  });

  it('Scenario: Opening the screen by its address — a user without customer.create sees the forbidden page', () => {
    const viewer = {
      ...PEOPLE.aung,
      grants: PEOPLE.aung.grants.filter((g) => g.code === 'customer.view'),
    };
    renderPos(<NewCustomerScreen />, { me: viewer });
    expect(screen.getByTestId('refused-page').textContent).toContain(
      "You don't have access to this page. Ask an admin if you need it.",
    );
    expect(screen.queryByTestId('customer-form')).toBeNull();
  });
});
