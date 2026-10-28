import type {
  APIRequestContext,
  Browser,
  BrowserContext,
  Locator,
  Page,
  PlaywrightWorkerArgs,
} from '@playwright/test';

import { APP_ORIGIN } from '../hosts.js';
import { APP_HEADERS, signInWithCode } from './sign-in.js';
import { sql } from './stack.js';

// add-walkin-visit-checkout tasks 14.1 / 14.2 — the walk-in flows' test base:
// - one sign-in per person for the whole file (code request + verify through Mailpit), reused through
//   storageState, so a file stays inside the rate limit of e2e/README.md;
// - each person's open visits closed through the API before a flow (payments voided, then INCOMPLETE),
//   so a run never starts blocked by an unpaid visit of an earlier run;
// - the receipt number a FINISH will get, built from the server's month (`system.server_time` of /me)
//   and the last number of that month at the branch — the real clock runs, so nothing is assumed.

export type Session = Awaited<ReturnType<APIRequestContext['storageState']>>;

export const PEOPLE = {
  aung: 'aung@point.test',
  min: 'min@point.test',
  hnin: 'hnin@point.test',
} as const;

export const MOBILE = { width: 360, height: 800 } as const;
export const DESKTOP = { width: 1280, height: 800 } as const;

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Signs the address in through the API and returns its session for later contexts. */
export async function sessionOf(
  playwright: PlaywrightWorkerArgs['playwright'],
  email: string,
): Promise<Session> {
  const request = await playwright.request.newContext({
    baseURL: APP_ORIGIN,
    ignoreHTTPSErrors: true,
  });
  try {
    await signInWithCode(request, email);
    return await request.storageState();
  } finally {
    await request.dispose();
  }
}

/** The account's interface language: 1 Myanmar, 2 English (users.ui_language). */
export function setLanguage(email: string, language: 'my' | 'en'): void {
  sql(`UPDATE users SET ui_language = ${language === 'my' ? 1 : 2} WHERE email = '${email}';`);
}

export async function pageAs(
  browser: Browser,
  session: Session,
  viewport: { width: number; height: number } = MOBILE,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL: APP_ORIGIN,
    ignoreHTTPSErrors: true,
    storageState: session,
    viewport,
  });
  return { context, page: await context.newPage() };
}

export async function apiAs(
  playwright: PlaywrightWorkerArgs['playwright'],
  session: Session,
): Promise<APIRequestContext> {
  return playwright.request.newContext({
    baseURL: APP_ORIGIN,
    ignoreHTTPSErrors: true,
    storageState: session,
  });
}

interface OpenVisit {
  readonly id: string;
  readonly sale: {
    readonly payments: readonly { readonly id: string; readonly voided_at: string | null }[];
  };
}

/** Closes the caller's open visits: every live payment voided, then the visit INCOMPLETE. */
export async function clearOpenVisits(api: APIRequestContext): Promise<void> {
  const res = await api.get('/api/v1/me/visits?status=1&status=2');
  if (res.status() !== 200) throw new Error(`my visits answered ${res.status()}`);
  const { items } = (await res.json()) as { items: OpenVisit[] };
  for (const visit of items) {
    for (const payment of visit.sale.payments.filter((item) => item.voided_at === null)) {
      await api.post(`/api/v1/payments/${payment.id}/void`, {
        headers: APP_HEADERS,
        data: { reason: 'e2e reset' },
      });
    }
    const closed = await api.post(`/api/v1/visits/${visit.id}/incomplete`, {
      headers: APP_HEADERS,
      data: { reason: 'e2e reset' },
    });
    if (closed.status() !== 200) throw new Error(`incomplete answered ${closed.status()}`);
  }
}

/** The number the next FINISH at the branch takes (D-PAY-06): `B3-2026-OCT-00004`, `B3-RF-…`. */
export async function nextReceipt(
  api: APIRequestContext,
  kind: 'sale' | 'refund',
  branchCode = 'B3',
): Promise<string> {
  const me = (await (await api.get('/api/v1/me')).json()) as { system: { server_time: string } };
  // server_time is written in +06:30, so its date part is the Myanmar calendar date (D-PLT-15).
  const [year, month] = me.system.server_time.slice(0, 7).split('-').map(Number) as [
    number,
    number,
  ];
  const table = kind === 'sale' ? 'sales' : 'refunds';
  const last = Number(
    sql(
      `SELECT coalesce(max(t.receipt_seq), 0) FROM ${table} t JOIN branches b ON b.id = t.branch_id
       WHERE b.code = '${branchCode}' AND t.receipt_year = ${year} AND t.receipt_month = ${month};`,
    ).trim(),
  );
  const prefix = kind === 'sale' ? branchCode : `${branchCode}-RF`;
  return `${prefix}-${year}-${MONTHS[month - 1]}-${String(last + 1).padStart(5, '0')}`;
}

/** Rows a flow wrote: the performer's visits, the payments of their sales. */
export function countOf(what: 'visits' | 'payments', email: string): number {
  const visits = `SELECT v.id FROM visits v JOIN employees e ON e.id = v.performed_by_employee_id
                  JOIN users u ON u.id = e.user_id WHERE u.email = '${email}'`;
  const query =
    what === 'visits'
      ? `SELECT count(*) FROM (${visits}) x;`
      : `SELECT count(*) FROM payments p JOIN sales s ON s.id = p.sale_id WHERE s.visit_id IN (${visits});`;
  return Number(sql(query).trim());
}

/** A tap the AD-GOAL-01 counter counts. */
export function tapCounter() {
  let taps = 0;
  return {
    tap: async (target: Locator) => {
      taps += 1;
      await target.click();
    },
    get count() {
      return taps;
    },
  };
}

/** The shared reason dialog: type the reason, confirm with its last button. */
export async function giveReason(page: Page, reason: string): Promise<void> {
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('textbox').fill(reason);
  await dialog.getByRole('button').last().click();
}
