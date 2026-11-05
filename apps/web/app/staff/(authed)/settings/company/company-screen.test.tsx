// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Locale } from '@point/i18n';
import {
  type CompanyDto,
  CompanyStatus,
  type MeResponse,
  ScopeType,
  companySchema,
} from '@point/shared';

import { IDS, meOf } from '../../../../../test/pos-fixtures';
import { type Route, routeFetch } from '../../../../../test/pos-render';
import { json, problem, renderStaff } from '../../../../../test/render';

// add-company-profile tasks 4.3 – 4.7 — organization spec "Settings › Company is shown to holders of a
// company code and editable only with company scope" and "The company form sends only the changed members
// and shows each refusal where it belongs" (AD-PERM-02 / 03 · AD-STATE-01 / 03 / 04 · AD-FORM-01 … 05 /
// 08 / 09 · AD-RT-02 · AD-TOAST-01 · CP1 – CP3). The screen runs inside the session layer — `/me`, its
// grants and the client's 403 handler — with every request answered by route. Monday 05/Oct/2026; the
// company was last changed at 9:00 AM.

const back = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back }),
  usePathname: () => '/settings/company',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../../../../../lib/session/navigate', () => ({ navigation: { assign: vi.fn() } }));
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('@point/ui', async (load) => {
  const ui = await load<typeof import('@point/ui')>();
  return { ...ui, toast: { ...ui.toast, success: toastSuccess } };
});
const { SessionLayer } = await import('../../../../../lib/session/session-layer');
const { CompanyScreen } = await import('./company-screen');

const B1 = '0199a3f2-0000-7000-8001-0000000000b1';
const AT_9 = '2026-10-05T09:00:00.000+06:30';
const AT_930 = '2026-10-05T09:30:00.000+06:30';
const NAME_MM = 'ပွိုင့် ဘာဘာရှော့';
const ADDRESS_MM = 'အမှတ် ၁၂၊ စမ်းသပ်လမ်း၊ ရန်ကုန်';
const FACEBOOK = 'https://www.facebook.com/point.test';
const MAP_1 = { label: 'Branch map 1', url: 'https://point.test/map/1' };
const MAP_2 = { label: 'Branch map 2', url: 'https://point.test/map/2' };

function companyOf(overrides: Partial<CompanyDto> = {}): CompanyDto {
  return companySchema.parse({
    id: '0199a3f2-0000-7000-8000-000000000c01',
    name_mm: NAME_MM,
    name_en: 'Point Barbershop',
    logo_url: null,
    phone: null,
    email: null,
    address_mm: null,
    address_en: null,
    website_url: null,
    social_links: {},
    status: CompanyStatus.ACTIVE,
    updated_at: AT_9,
    ...overrides,
  });
}

const grant = (code: string, branchIds?: readonly string[]) =>
  branchIds === undefined
    ? { code, scope_type: ScopeType.COMPANY, branch_ids: [] }
    : { code, scope_type: ScopeType.BRANCHES, branch_ids: [...branchIds] };

const person = (name_en: string, grants: MeResponse['grants']): MeResponse =>
  meOf({
    user: { ...meOf().user, ui_language: 2 },
    employee: { ...meOf().employee, name_en },
    grants,
  });

/** U Kyaw Zin — Admin, company scope. */
const KYAW_ZIN = person('U Kyaw Zin', [grant('company.view'), grant('company.update')]);
/** Ko Zaw with the test role "Company viewer" at B1. */
const ZAW_VIEWER = person('Ko Zaw', [grant('company.view', [B1])]);
/** Ko Zaw with the test role "Company editor" at B1. */
const ZAW_EDITOR = person('Ko Zaw', [grant('company.view', [B1]), grant('company.update', [B1])]);
/** Ko Aung — Barber at B3, no `company.*` code. */
const AUNG = person('Ko Aung', [grant('sale.create', [IDS.B3])]);

const ME = 'GET /api/v1/me';
const COMPANY = 'GET /api/v1/company';
const PATCH = 'PATCH /api/v1/company';

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  back.mockReset();
  toastSuccess.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function renderScreen(me: MeResponse, routes: Record<string, Route> = {}, locale: Locale = 'en') {
  routeFetch(fetchMock, {
    [ME]: json(200, me),
    'GET /api/v1/me/visits?status=1&status=2': json(200, { items: [] }),
    [COMPANY]: json(200, companyOf()),
    ...routes,
  });
  return renderStaff(
    <SessionLayer locale={locale}>
      <CompanyScreen />
    </SessionLayer>,
    { locale },
  );
}

const calls = (method: string, path: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => (init?.method ?? 'GET') === method && String(url) === `/api/v1${path}`,
  );
const sentBody = (index = 0): unknown =>
  JSON.parse(String(calls('PATCH', '/company')[index]?.[1]?.body));

const input = (testId: string) => screen.getByTestId(testId) as HTMLInputElement;
/** Types into a field and leaves it for the next one (validation on blur — AD-FORM-03). */
function type(testId: string, value: string) {
  fireEvent.change(input(testId), { target: { value } });
  fireEvent.blur(input(testId), { relatedTarget: document.body });
}
const save = () => fireEvent.click(screen.getByTestId('company-save'));
const form = () => screen.findByTestId('company-form');
/** The message under the field of this test id. */
const messageOf = (testId: string) =>
  input(testId).closest('[data-slot="form-field"]')?.querySelector('[data-slot="field-message"]')
    ?.textContent ?? null;

describe('Settings › Company — who sees what (task 4.3)', () => {
  it('Scenario: The company admin — the form with Save, the stored values in the inputs', async () => {
    renderScreen(KYAW_ZIN);
    await form();
    expect(screen.getByTestId('company-save')).toBeTruthy();
    expect(input('company-name-mm').value).toBe(NAME_MM);
    expect(input('company-name-en').value).toBe('Point Barbershop');
    expect(input('company-phone').value).toBe('');
    expect(document.title).toBe('Company');
  });

  it('Scenario: A viewer sees text only — Ko Zaw, "Company viewer" at B1', async () => {
    renderScreen(ZAW_VIEWER, {
      [COMPANY]: json(200, companyOf({ phone: '09 400 000 111' })),
    });
    const view = await screen.findByTestId('company-read-only');
    expect(within(view).getByText(NAME_MM)).toBeTruthy();
    expect(within(view).getByText('09 400 000 111')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByTestId('company-save')).toBeNull();
  });

  it('Ko Zaw with "Company editor" at branch scope only — text, no Save (the API answers company_scope_required)', async () => {
    renderScreen(ZAW_EDITOR);
    await screen.findByTestId('company-read-only');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByTestId('company-save')).toBeNull();
  });

  it('Scenario: Manager and barber — Ko Aung opens /settings/company: the "no access" page with a link Home', async () => {
    renderScreen(AUNG);
    const page = await screen.findByTestId('refused-page');
    expect(
      within(page).getByText("You don't have access to this page. Ask an admin if you need it."),
    ).toBeTruthy();
    expect(within(page).getByRole('link').getAttribute('href')).toBe('/');
    expect(calls('GET', '/company')).toHaveLength(0);
  });

  it('a slow load: nothing before 400 ms, the skeleton after it (AD-STATE-01)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      renderScreen(KYAW_ZIN, { [COMPANY]: () => new Promise<Response>(() => undefined) });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      const loading = await vi.waitFor(() => screen.getByTestId('company-loading'));
      expect(loading.querySelector('[data-slot="skeleton"]')).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });
      expect(loading.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a failed load: the error state with the 8-character error ID; Retry loads the form', async () => {
    let answers = 0;
    renderScreen(KYAW_ZIN, {
      [COMPANY]: () => {
        answers += 1;
        return answers === 1 ? json(500, problem(500, 'internal_error')) : json(200, companyOf());
      },
    });
    const state = await screen.findByRole('alert');
    expect(within(state).getByText('Error ID: 0199a3f2')).toBeTruthy();
    fireEvent.click(within(state).getByRole('button', { name: 'Retry' }));
    await form();
  });
});

describe('Settings › Company — the form and its bounds (task 4.4)', () => {
  it('four sections: Name (Myanmar required, English with the hint), Contact, Address, Website and social links', async () => {
    renderScreen(KYAW_ZIN);
    const company = await form();
    for (const heading of ['Contact', 'Address', 'Website and social links']) {
      expect(within(company).getByRole('heading', { name: heading })).toBeTruthy();
    }
    expect(within(company).getByText('Leave English empty to show the Myanmar text')).toBeTruthy();
    expect(input('company-name-mm').getAttribute('aria-required')).toBe('true');
    for (const id of [
      'company-email',
      'company-address-mm',
      'company-address-en',
      'company-website',
      'company-link-facebook',
      'company-link-tiktok',
      'company-link-viber',
      'company-link-instagram',
      'company-link-youtube',
      'company-other-add',
    ]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    expect(input('company-address-mm').tagName).toBe('TEXTAREA');
  });

  it('the Myanmar name cannot be emptied: "This field is required." under the pair', async () => {
    renderScreen(KYAW_ZIN);
    await form();
    type('company-name-mm', '   ');
    await waitFor(() => expect(messageOf('company-name-mm')).toBe('This field is required.'));
  });

  it.each([
    ['company-name-en', 255, 'maximum 255'],
    ['company-phone', 50, 'maximum 50'],
    ['company-address-en', 1000, 'maximum 1000'],
  ])('%s: %i characters pass, one more is too long (CP1)', async (testId, limit, maximum) => {
    renderScreen(KYAW_ZIN);
    await form();
    type(testId, 'a'.repeat(limit));
    await waitFor(() => expect(messageOf(testId)).toBeNull());
    type(testId, 'a'.repeat(limit + 1));
    await waitFor(() =>
      expect(messageOf(testId)).toBe(`This value is too long or too large — ${maximum}.`),
    );
  });

  it('a link: 1,000 characters pass, 1,001 are too long; javascript: and no scheme are not a web address (CP1 · CP2)', async () => {
    renderScreen(KYAW_ZIN);
    await form();
    const at = (length: number) => `https://point.test/${'a'.repeat(length - 19)}`;
    type('company-link-facebook', at(1000));
    await waitFor(() => expect(messageOf('company-link-facebook')).toBeNull());
    type('company-link-facebook', at(1001));
    await waitFor(() =>
      expect(messageOf('company-link-facebook')).toBe(
        'This value is too long or too large — maximum 1000.',
      ),
    );
    for (const wrong of ['javascript:alert(1)', 'www.facebook.com/point.test']) {
      type('company-link-facebook', wrong);
      await waitFor(() =>
        expect(messageOf('company-link-facebook')).toBe("This format isn't valid."),
      );
    }
    // Viber is free text: a phone is fine.
    type('company-link-viber', '09 400 000 111');
    await waitFor(() => expect(messageOf('company-link-viber')).toBeNull());
  });

  it('Scenario: A refusal under its field — "hello@" shows error.email_invalid under E-mail, marks it and focuses it', async () => {
    renderScreen(KYAW_ZIN);
    await form();
    fireEvent.change(input('company-email'), { target: { value: 'hello@' } });
    save();
    await waitFor(() => expect(messageOf('company-email')).toBe('Enter a valid email address.'));
    expect(input('company-email').getAttribute('aria-invalid')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(input('company-email')));
    expect(calls('PATCH', '/company')).toHaveLength(0);
  });

  it('other links: added up to 10 — Add is not offered at 10; a label of 51 characters is too long; a row is removed', async () => {
    // "Branch map 1" … "Branch map 9" stored (the spec's ten-links scenario, one short).
    const other = Array.from({ length: 9 }, (_, n) => ({
      label: `Branch map ${n + 1}`,
      url: `https://point.test/map/${n + 1}`,
    }));
    renderScreen(KYAW_ZIN, { [COMPANY]: json(200, companyOf({ social_links: { other } })) });
    await form();
    expect(input('company-other-8-label').value).toBe('Branch map 9');
    fireEvent.click(screen.getByTestId('company-other-add'));
    expect(screen.getByTestId('company-other-9')).toBeTruthy();
    expect(screen.queryByTestId('company-other-add')).toBeNull();
    type('company-other-0-label', 'a'.repeat(51));
    await waitFor(() =>
      expect(messageOf('company-other-0-label')).toBe(
        'This value is too long or too large — maximum 50.',
      ),
    );
    fireEvent.click(screen.getByTestId('company-other-9-remove'));
    expect(screen.queryByTestId('company-other-9')).toBeNull();
    expect(screen.getByTestId('company-other-add')).toBeTruthy();
  });
});

describe('Settings › Company — Save and its answers (task 4.5)', () => {
  it('Scenario: Save sends only what changed — { phone, expected_updated_at }, the toast, the saved phone', async () => {
    renderScreen(KYAW_ZIN, {
      [PATCH]: json(200, companyOf({ phone: '09 400 000 111', updated_at: AT_930 })),
    });
    await form();
    type('company-phone', '09 400 000 111');
    save();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Company saved'));
    expect(sentBody()).toStrictEqual({ phone: '09 400 000 111', expected_updated_at: AT_9 });
    expect(input('company-phone').value).toBe('09 400 000 111');
  });

  it('the next save sends the updated_at of the answer; a cleared member is sent as null', async () => {
    let answer = 0;
    renderScreen(KYAW_ZIN, {
      [PATCH]: () => {
        answer += 1;
        return json(
          200,
          answer === 1
            ? companyOf({ email: 'hello@point.test', updated_at: AT_930 })
            : companyOf({ email: null, updated_at: '2026-10-05T09:35:00.000+06:30' }),
        );
      },
    });
    await form();
    type('company-email', 'hello@point.test');
    save();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    type('company-email', '');
    save();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(2));
    expect(sentBody(1)).toStrictEqual({ email: null, expected_updated_at: AT_930 });
  });

  it('a changed link sends every link — social_links is replaced as a whole (P1.CO.02)', async () => {
    renderScreen(KYAW_ZIN, {
      [COMPANY]: json(
        200,
        companyOf({
          social_links: {
            facebook: 'https://www.facebook.com/point.test',
            tiktok: 'https://www.tiktok.com/@point.test',
          },
        }),
      ),
      [PATCH]: json(200, companyOf({ updated_at: AT_930 })),
    });
    await form();
    type('company-link-viber', '09 400 000 111');
    save();
    await waitFor(() => expect(calls('PATCH', '/company')).toHaveLength(1));
    expect(sentBody()).toStrictEqual({
      social_links: {
        facebook: 'https://www.facebook.com/point.test',
        tiktok: 'https://www.tiktok.com/@point.test',
        viber: '09 400 000 111',
      },
      expected_updated_at: AT_9,
    });
  });

  it('a stored other link removed and saved — social_links is sent without it (task 4.4 remove)', async () => {
    renderScreen(KYAW_ZIN, {
      [COMPANY]: json(
        200,
        companyOf({ social_links: { facebook: FACEBOOK, other: [MAP_1, MAP_2] } }),
      ),
      [PATCH]: json(
        200,
        companyOf({ social_links: { facebook: FACEBOOK, other: [MAP_2] }, updated_at: AT_930 }),
      ),
    });
    await form();
    fireEvent.click(screen.getByTestId('company-other-0-remove'));
    save();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Company saved'));
    expect(sentBody()).toStrictEqual({
      social_links: { facebook: FACEBOOK, other: [MAP_2] },
      expected_updated_at: AT_9,
    });
    expect(input('company-other-0-label').value).toBe('Branch map 2');
    expect(screen.queryByTestId('company-other-1')).toBeNull();
  });

  it('the only stored other link removed while the phone is edited — both are sent', async () => {
    renderScreen(KYAW_ZIN, {
      [COMPANY]: json(200, companyOf({ social_links: { other: [MAP_1] } })),
      [PATCH]: json(200, companyOf({ phone: '09 400 000 111', updated_at: AT_930 })),
    });
    await form();
    // The phone first: a later change of a text field would recompute every dirty member.
    type('company-phone', '09 400 000 111');
    fireEvent.click(screen.getByTestId('company-other-0-remove'));
    save();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Company saved'));
    // An empty `other` list is left out (proposal reading 8): no links at all.
    expect(sentBody()).toStrictEqual({
      phone: '09 400 000 111',
      social_links: {},
      expected_updated_at: AT_9,
    });
    expect(screen.queryByTestId('company-other-0')).toBeNull();
  });

  it('an other link added and saved — social_links is sent with it (task 4.4 add)', async () => {
    renderScreen(KYAW_ZIN, {
      [COMPANY]: json(200, companyOf({ social_links: { facebook: FACEBOOK } })),
      [PATCH]: json(
        200,
        companyOf({ social_links: { facebook: FACEBOOK, other: [MAP_1] }, updated_at: AT_930 }),
      ),
    });
    await form();
    fireEvent.click(screen.getByTestId('company-other-add'));
    type('company-other-0-label', MAP_1.label);
    type('company-other-0-url', MAP_1.url);
    save();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Company saved'));
    expect(sentBody()).toStrictEqual({
      social_links: { facebook: FACEBOOK, other: [MAP_1] },
      expected_updated_at: AT_9,
    });
  });

  it('the API refuses fields: each message under its field, the focus on the first (AD-FORM-04)', async () => {
    renderScreen(KYAW_ZIN, {
      [PATCH]: json(
        400,
        problem(400, 'validation', {
          errors: [
            { field: 'phone', code: 'too_big', params: { maximum: 50 } },
            { field: 'social_links.facebook', code: 'invalid_format' },
          ],
        }),
      ),
    });
    await form();
    type('company-phone', '09 400 000 111');
    type('company-link-facebook', 'https://www.facebook.com/point.test');
    save();
    await waitFor(() =>
      expect(messageOf('company-phone')).toBe('This value is too long or too large — maximum 50.'),
    );
    expect(messageOf('company-link-facebook')).toBe("This format isn't valid.");
    await waitFor(() => expect(document.activeElement).toBe(input('company-phone')));
  });

  it('zawgyi_text: the message under the address it names', async () => {
    renderScreen(KYAW_ZIN, {
      [PATCH]: json(
        400,
        problem(400, 'zawgyi_text', { errors: [{ field: 'address_mm', code: 'zawgyi_text' }] }),
      ),
    });
    await form();
    type('company-address-mm', ADDRESS_MM);
    save();
    await waitFor(() =>
      expect(messageOf('company-address-mm')).toBe(
        'This text is in Zawgyi. Please type it in Unicode.',
      ),
    );
  });

  it('Scenario: Someone saved first — the banner with Reload, the typed e-mail kept until Reload', async () => {
    let loads = 0;
    renderScreen(KYAW_ZIN, {
      [COMPANY]: () => {
        loads += 1;
        return json(
          200,
          loads === 1 ? companyOf() : companyOf({ phone: '09 400 000 111', updated_at: AT_930 }),
        );
      },
      [PATCH]: json(409, problem(409, 'conflict')),
    });
    await form();
    type('company-email', 'hello@point.test');
    save();
    const banner = await screen.findByTestId('company-conflict');
    expect(
      within(banner).getByText('Someone saved this just now. Reload to see the latest version.'),
    ).toBeTruthy();
    expect(input('company-email').value).toBe('hello@point.test');
    fireEvent.click(screen.getByTestId('company-reload'));
    await waitFor(() => expect(input('company-phone').value).toBe('09 400 000 111'));
    expect(input('company-email').value).toBe('');
    expect(screen.queryByTestId('company-conflict')).toBeNull();
  });

  it('a 403 after Save — /me is loaded again and the screen shows the values as text', async () => {
    let meLoads = 0;
    renderScreen(KYAW_ZIN, {
      [ME]: () => {
        meLoads += 1;
        return json(200, meLoads === 1 ? KYAW_ZIN : ZAW_VIEWER);
      },
      [PATCH]: json(403, problem(403, 'forbidden', { context: { required: 'company.update' } })),
    });
    await form();
    type('company-phone', '09 400 000 111');
    save();
    await screen.findByTestId('company-read-only');
    expect(meLoads).toBeGreaterThanOrEqual(2);
    expect(screen.queryByTestId('company-save')).toBeNull();
  });

  it('Scenario: Leaving with unsaved edits — Back asks "Discard changes?" with Keep editing and Discard', async () => {
    renderScreen(KYAW_ZIN);
    await form();
    type('company-address-en', 'No. 12, Test Street, Yangon');
    fireEvent.click(screen.getByTestId('company-back'));
    const dialog = await screen.findByRole('alertdialog', { name: 'Discard changes?' });
    expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('Back without edits goes back at once', async () => {
    renderScreen(KYAW_ZIN);
    await form();
    fireEvent.click(screen.getByTestId('company-back'));
    expect(back).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('Settings › Company — layout and languages (tasks 4.6 / 4.7)', () => {
  it('the form is at most 720 px wide; the action bar sticks at the bottom, above the bottom navigation on a phone', async () => {
    renderScreen(KYAW_ZIN);
    const company = await form();
    expect(company.className).toContain('max-w-180');
    const bar = screen.getByTestId('company-actions');
    expect(bar.className).toContain('sticky');
    expect(bar.className).toContain('md:bottom-0');
  });

  it('Myanmar: the title, the sections and Save from the my files', async () => {
    renderScreen({ ...KYAW_ZIN, user: { ...KYAW_ZIN.user, ui_language: 1 } }, {}, 'my');
    const company = await form();
    expect(document.title).toBe('ကုမ္ပဏီ');
    expect(within(company).getByRole('heading', { name: 'ဆက်သွယ်ရန်' })).toBeTruthy();
    expect(screen.getByTestId('company-save').textContent).toBe('သိမ်းမည်');
  });
});
