// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toast } from '@point/ui';

import { BRANCH_IDS, PEOPLE, branchOf } from '../../../../../../test/branch-fixtures';
import { renderPos, routeFetch } from '../../../../../../test/pos-render';
import { json, problem } from '../../../../../../test/render';

// add-branch-management tasks 4.2 / 4.4 / 4.6 — organization "The branch form creates and edits a branch
// with messages at the fields", "Branch members are checked against their limits" and the page guard of
// /settings/branches/new (AD-FORM-01 / 02 / 04 / 05 / 09 · AD-PERM-02 · design D9).
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/settings/branches/new',
  useSearchParams: () => new URLSearchParams(),
}));
const { NewBranchScreen } = await import('./new-branch-screen');

const CREATE = 'POST /api/v1/branches';
const B4 = branchOf({
  id: BRANCH_IDS.B4,
  code: 'B4',
  name_mm: 'ပွိုင့် ၄.၀',
  name_en: 'Point 4.0',
  location_radius_meters: 100,
  active_employees: 0,
});

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  push.mockReset();
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

const field = (member: string) => screen.getByTestId(`branch-field-${member}`);
const input = (member: string, nth = 0) =>
  within(field(member)).getAllByRole('textbox')[nth] as HTMLInputElement;
const messageOf = (element: HTMLElement) =>
  document.getElementById(element.getAttribute('aria-describedby')?.split(' ')[0] ?? '')
    ?.textContent;
const type = (element: HTMLElement, value: string) =>
  fireEvent.change(element, { target: { value } });
const requests = () =>
  fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${String(url)}`);
const sentBody = () => {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
  return JSON.parse(String(call?.[1]?.body)) as unknown;
};

/** Save as a person presses it: the focus moves to the button first, then the click. */
async function save() {
  const button = screen.getByTestId('branch-save');
  act(() => button.focus());
  fireEvent.click(button);
  await flush();
  await flush();
}

function fillB4(code = 'B4') {
  type(input('code'), code);
  type(input('name_mm', 0), 'ပွိုင့် ၄.၀');
  type(input('name_mm', 1), 'Point 4.0');
}

describe('New branch — the form', () => {
  it('has three titled sections and the asterisk on Code and Name (Myanmar) only', () => {
    renderPos(<NewBranchScreen />, { me: PEOPLE.kyawZin });
    const form = screen.getByTestId('branch-form');
    expect(
      within(form)
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent),
    ).toStrictEqual(['Branch', 'Address and location', 'Website']);
    const marks = [...form.querySelectorAll('span')].filter(
      (span) => span.textContent === '*' && span.className.includes('text-destructive'),
    );
    expect(marks).toHaveLength(2);
    expect(field('code').contains(marks[0] ?? null)).toBe(true);
    expect(field('name_mm').contains(marks[1] ?? null)).toBe(true);
    expect(field('address_mm').textContent).not.toContain('*');
  });

  it('the code asks for capitals; the http address fields: the url keyboard, no capital letter, no correction — Viber, phone, e-mail and a link label as before', () => {
    renderPos(<NewBranchScreen />, { me: PEOPLE.kyawZin });
    fireEvent.click(screen.getByTestId('branch-social-add'));
    // The code takes capital letters and digits only (P1.BR.02), and the server keeps its case.
    expect(input('code').getAttribute('autocapitalize')).toBe('characters');
    expect(input('code').getAttribute('inputmode')).toBeNull();
    expect(input('code').getAttribute('autocorrect')).toBeNull();
    for (const member of [
      'map_url',
      'website_url',
      'social_links.facebook',
      'social_links.tiktok',
      'social_links.instagram',
      'social_links.youtube',
      'social_links.other.0.url',
    ]) {
      expect(input(member).getAttribute('inputmode'), member).toBe('url');
      expect(input(member).getAttribute('autocapitalize'), member).toBe('none');
      expect(input(member).getAttribute('autocorrect'), member).toBe('off');
    }
    // Viber is free text — a `viber://` link or a phone.
    for (const member of ['social_links.viber', 'social_links.other.0.label', 'phone', 'email']) {
      expect(input(member).getAttribute('autocapitalize'), member).toBeNull();
      expect(input(member).getAttribute('autocorrect'), member).toBeNull();
    }
    expect(input('social_links.viber').getAttribute('inputmode')).toBeNull();
    expect(input('social_links.other.0.label').getAttribute('inputmode')).toBeNull();
    expect(input('phone').getAttribute('inputmode')).toBe('tel');
    expect(input('email').getAttribute('inputmode')).toBe('email');
  });

  it('Scenario: The admin creates B4 — the toast "Branch saved" and the new branch opens', async () => {
    const saved = vi.spyOn(toast, 'success');
    routeFetch(fetchMock, { [CREATE]: json(201, B4) });
    renderPos(<NewBranchScreen />, { me: PEOPLE.kyawZin });
    fillB4();
    await save();
    expect(sentBody()).toStrictEqual({
      code: 'B4',
      name_mm: 'ပွိုင့် ၄.၀',
      name_en: 'Point 4.0',
      is_public: true,
    });
    expect(saved).toHaveBeenCalledWith('Branch saved');
    expect(push).toHaveBeenCalledWith(`/settings/branches/${BRANCH_IDS.B4}`);
  });

  it('Scenario: Messages under the code — b4 is refused before sending, a taken B3 after', async () => {
    routeFetch(fetchMock, {
      [CREATE]: json(409, problem(409, 'already_exists')),
    });
    renderPos(<NewBranchScreen />, { me: PEOPLE.kyawZin });
    fillB4('b4');
    await save();
    expect(messageOf(input('code'))).toBe("This format isn't valid.");
    expect(requests()).toStrictEqual([]);
    type(input('code'), 'B3');
    await save();
    expect(requests()).toStrictEqual([CREATE]);
    expect(messageOf(input('code'))).toBe('A branch with this code already exists.');
    expect(push).not.toHaveBeenCalled();
  });

  it("puts a 400's errors[] under their fields, and a refusal without a field in the alert at the top", async () => {
    let answer = json(
      400,
      problem(400, 'validation', {
        errors: [
          { field: 'name_en', code: 'zawgyi_text' },
          { field: 'social_links.other[0].label', code: 'zawgyi_text' },
        ],
      }),
    );
    routeFetch(fetchMock, { [CREATE]: () => answer });
    renderPos(<NewBranchScreen />, { me: PEOPLE.kyawZin });
    fillB4();
    fireEvent.click(screen.getByTestId('branch-social-add'));
    type(input('social_links.other.0.label'), 'Map');
    type(input('social_links.other.0.url'), 'https://maps.example/p4');
    await save();
    expect(messageOf(input('name_mm', 0))).toBe(
      'This text is in Zawgyi. Please type it in Unicode.',
    );
    expect(messageOf(input('social_links.other.0.label'))).toBe(
      'This text is in Zawgyi. Please type it in Unicode.',
    );
    expect(screen.getByTestId('branch-form').querySelector('[role="alert"]')).toBeNull();
    answer = json(403, problem(403, 'company_scope_required'));
    await save();
    expect(
      screen.getByTestId('branch-form').querySelector('[role="alert"]')?.textContent,
    ).toContain('Only someone with company-wide access can change this.');
  });

  it('Cancel with nothing typed goes back to the list; after typing it asks "Discard changes?"', async () => {
    renderPos(<NewBranchScreen />, { me: PEOPLE.kyawZin });
    fireEvent.click(screen.getByTestId('branch-cancel'));
    expect(push).toHaveBeenCalledWith('/settings/branches');
    push.mockReset();
    type(input('code'), 'B4');
    fireEvent.click(screen.getByTestId('branch-cancel'));
    const dialog = await screen.findByRole('alertdialog', { name: 'Discard changes?' });
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));
    expect(push).toHaveBeenCalledWith('/settings/branches');
  });
});

// 10 s: ten Other rows added and removed one at a time run past 5 s on a loaded machine (as the late-entry suites).
describe('New branch — the social links (task 4.6)', { timeout: 10_000 }, () => {
  it('five links; Other rows added up to 10 and removed', () => {
    renderPos(<NewBranchScreen />, { me: PEOPLE.kyawZin });
    const links = screen.getByTestId('branch-social-links');
    for (const label of ['Facebook', 'TikTok', 'Instagram', 'YouTube', 'Viber']) {
      expect(within(links).getByRole('textbox', { name: label })).toBeTruthy();
    }
    for (let i = 0; i < 10; i += 1) fireEvent.click(screen.getByTestId('branch-social-add'));
    expect(screen.queryByTestId('branch-social-add')).toBeNull();
    expect(screen.getAllByTestId(/^branch-social-other-\d+$/)).toHaveLength(10);
    fireEvent.click(screen.getByTestId('branch-social-remove-3'));
    expect(screen.getAllByTestId(/^branch-social-other-\d+$/)).toHaveLength(9);
    expect(screen.getByTestId('branch-social-add')).toBeTruthy();
  });

  it('a javascript: link is refused under its field and nothing is sent', async () => {
    renderPos(<NewBranchScreen />, { me: PEOPLE.kyawZin });
    fillB4();
    type(input('social_links.facebook'), 'javascript:alert(1)');
    await save();
    expect(messageOf(input('social_links.facebook'))).toBe("This format isn't valid.");
    expect(requests()).toStrictEqual([]);
  });
});

describe('New branch — the page guard', () => {
  it('Scenario: Opening the screen by its address — Ma Hnin (no company-scope branch.create) sees the forbidden page', () => {
    renderPos(<NewBranchScreen />, { me: PEOPLE.hnin });
    expect(screen.getByTestId('refused-page').textContent).toContain(
      "You don't have access to this page. Ask an admin if you need it.",
    );
    expect(screen.queryByTestId('branch-form')).toBeNull();
  });
});
