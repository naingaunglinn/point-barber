import authEn from '@point/i18n/messages/en/auth.json' with { type: 'json' };
import authMy from '@point/i18n/messages/my/auth.json' with { type: 'json' };
import { ErrorCode, LocationType, UiLanguage } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { ProblemException } from '../src/common/http/problem.exception.js';
import { PriceQuote, toQuoteDto } from '../src/modules/catalog/index.js';
import { EmailSendJob, type EmailSendData } from '../src/modules/platform/mail/email-send.job.js';
import { type MailMessage, MailTransport } from '../src/modules/platform/mail/mail-transport.js';
import {
  DocumentRenderer,
  InMemoryDocumentRenderer,
  InMemoryStorageService,
  RateLimiter,
  StorageService,
} from '../src/modules/platform/index.js';
import { ReceiptFiles, ReceiptViews } from '../src/modules/sales/index.js';
import { checkout } from './helpers/checkout.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { storeSetting } from './helpers/settings.js';
import { requestCode } from './helpers/sign-in.js';
import { KO_AUNG, KO_HTET, KO_MIN } from './helpers/walkin.js';

// add-settings-store tasks 2.6 – 2.9 — the API's own reads use the effective values (P1-RULE-08 ·
// P1-RULE-06 · P2-RULE-10 · P2.PRC.06 · P4-RULE-18 · AD-RCPT-01 · AD-L10N-06): the receipt render, the
// price quote, `/me` and the code e-mail read the store; with no row every answer is today's. The
// fixture day: Monday 05/Oct/2026. Values are stored as P1.SET.03 stores them (helpers/settings.ts).
const { branches, services } = FIXTURE_IDS;
const { B1, B3 } = branches;
const mmt = (local: string) => new Date(`${local}+06:30`);

const storage = new InMemoryStorageService();
const renderer = new InMemoryDocumentRenderer();
const mail: MailMessage[] = [];
const transport: MailTransport = {
  send: (message) => {
    mail.push(message);
    return Promise.resolve();
  },
};

let s: SeededApp;
let prisma: PrismaService;

beforeAll(async () => {
  s = await seededApp(mmt('2026-10-05T09:00:00'), {
    overrides: [
      { provide: StorageService, useValue: storage },
      { provide: DocumentRenderer, useValue: renderer },
      { provide: MailTransport, useValue: transport },
    ],
  });
  prisma = s.app.get(PrismaService);
}, 60_000);
afterAll(() => s.close());

const at = (local: string) => s.clock?.set(mmt(local));

/** A cash walk-in of one Haircut, finished — its sale id. */
async function finishedSale(who: typeof KO_MIN, amount: number): Promise<string> {
  const walkin = checkout(s.app);
  const cash = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'CASH' } })).id;
  const sale = await walkin.start(who, [services.HAIRCUT]);
  await walkin.pay(who, sale.saleId, { payment_method_id: cash, amount });
  await walkin.complete(who, sale.visitId);
  await walkin.finish(who, sale.saleId, { expected_total_amount: amount });
  return sale.saleId;
}

const receiptOf = async (saleId: string) => {
  const source = await s.app.get(ReceiptViews).ofSale(prisma, saleId);
  if (source === null) throw new Error('no receipt');
  return source.view;
};

describe("add-settings-store · settings · The API's own reads use the effective values", () => {
  beforeEach(() => {
    renderer.calls.length = 0;
  });

  it('Scenario: Printer width per branch — B3 at 80 renders a 576 px PNG, B1 keeps 384 px', async () => {
    at('2026-10-05T09:30:00');
    await storeSetting(s, 'receipt.printer_width_mm', 80, { branchId: B3, by: 'E002' });
    at('2026-10-05T10:50:00');
    const files = s.app.get(ReceiptFiles);
    const views = s.app.get(ReceiptViews);
    for (const [who, amount] of [
      [KO_MIN, 8000],
      [KO_HTET, 6000],
    ] as const) {
      const entity = { entity_type: 'sales' as const, entity_id: await finishedSale(who, amount) };
      await files.ensure(entity, 'background', () => views.document(entity));
    }
    expect(renderer.calls.map(({ kind, width }) => [kind, width])).toStrictEqual([
      ['pdf', 80],
      ['png', 576],
      ['pdf', 58],
      ['png', 384],
    ]);
  });

  it('Scenario: Transport fee in the quote — company 2,000, B3 override 3,000', async () => {
    at('2026-10-05T09:10:00');
    await storeSetting(s, 'home_service.transport_fee_amount', 2000);
    at('2026-10-05T09:20:00');
    await storeSetting(s, 'home_service.transport_fee_amount', 3000, { branchId: B3, by: 'E002' });
    const quotes = s.app.get(PriceQuote);
    const home = (branchId: string, employeeId: string) =>
      quotes.quote(prisma, {
        branch_id: branchId,
        location_type: LocationType.HOME,
        date: '2026-10-05',
        employee_id: employeeId,
        items: [{ service_id: services.HAIRCUT }],
      });
    expect(toQuoteDto(await home(B3, FIXTURE_IDS.employees.E005))).toMatchObject({
      transport_fee_amount: 3000,
    });
    expect(toQuoteDto(await home(B1, FIXTURE_IDS.employees.E006))).toMatchObject({
      transport_fee_amount: 2000,
    });
  });

  it('Scenario: Advance window in the quote — 7 days: 12/Oct passes, 13/Oct is outside_window', async () => {
    at('2026-10-05T09:00:00');
    await storeSetting(s, 'booking.advance_window_days', 7);
    const quotes = s.app.get(PriceQuote);
    await expect(quotes.assertQuotable(prisma, B3, '2026-10-12')).resolves.toBeUndefined();
    const refused = await quotes.assertQuotable(prisma, B3, '2026-10-13').catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(ProblemException);
    expect([
      (refused as ProblemException).code,
      (refused as ProblemException).status,
    ]).toStrictEqual([ErrorCode.OUTSIDE_WINDOW, 422]);
  });
});

describe('add-settings-store · settings · The receipt thank-you text', () => {
  it('Scenario: No text by default — footer.thank_you is null', async () => {
    at('2026-10-05T10:42:00');
    const view = await receiptOf(await finishedSale(KO_AUNG, 10000));
    expect(view.footer.thank_you).toBeNull();
  });

  it('Scenario: The English text is printed', async () => {
    at('2026-10-05T09:00:00');
    await storeSetting(s, 'receipt.thank_you_text', { mm: 'ကျေးဇူးတင်ပါတယ်', en: 'Thank you!' });
    at('2026-10-05T10:50:00');
    const view = await receiptOf(await finishedSale(KO_MIN, 8000));
    expect(view.footer.thank_you).toBe('Thank you!');
  });

  it('Scenario: Myanmar only prints no line', async () => {
    await storeSetting(s, 'receipt.thank_you_text', { mm: 'ကျေးဇူးတင်ပါတယ်', en: null });
    const view = await receiptOf(await finishedSale(KO_MIN, 8000));
    expect(view.footer.thank_you).toBeNull();
  });
});

describe("add-settings-store · auth · The code e-mail uses the user's language and is delivered to Mailpit outside production", () => {
  /** Requests a code for `email` and runs its `email.send` job — the message the transport got. */
  async function codeMail(email: string): Promise<MailMessage> {
    s.app.get(RateLimiter).reset();
    mail.length = 0;
    const res = await requestCode(s, email);
    expect(res.status).toBe(202);
    const [job] = await prisma.$queryRaw<{ data: EmailSendData }[]>`
      SELECT data FROM pgboss.job WHERE name = 'email.send' AND data->>'to' = ${email}
      ORDER BY created_on DESC, id DESC LIMIT 1`;
    if (job === undefined) throw new Error(`no email.send job for ${email}`);
    await s.app.get(EmailSendJob, { strict: false }).handle(job.data);
    const [message] = mail;
    if (message === undefined) throw new Error('nothing sent');
    return message;
  }

  it('Scenario: Default language is Myanmar', async () => {
    expect(await prisma.settings.count({ where: { key: 'system.default_language' } })).toBe(0);
    at('2026-10-05T09:00:00');
    const message = await codeMail('aung@point.test');
    expect(message.subject).toBe(authMy.email.otp.subject);
    expect(message.text.split('\n').filter((line) => /^[0-9]{8}$/.test(line))).toHaveLength(1);
  });

  it('Scenario: The system default changed to English', async () => {
    await storeSetting(s, 'system.default_language', UiLanguage.EN);
    const message = await codeMail('aung@point.test');
    expect(message.subject).toBe(authEn.email.otp.subject);
  });

  it('Scenario: English for a user who chose English — whatever the system default', async () => {
    await prisma.users.update({
      where: { id: FIXTURE_IDS.users.E001 },
      data: { ui_language: UiLanguage.EN },
    });
    expect((await codeMail('kyawzin@point.test')).subject).toBe(authEn.email.otp.subject);
    await storeSetting(s, 'system.default_language', UiLanguage.MY);
    expect((await codeMail('kyawzin@point.test')).subject).toBe(authEn.email.otp.subject);
  });
});

describe('add-settings-store · settings · /me reads its settings from the store, as company values', () => {
  const me = async (who: 'E002' | 'E004' | 'E005') =>
    s.http.get('/api/v1/me').set('Cookie', (await s.signIn(who)).cookie);

  it('Scenario: Company values, not overrides — the transport fee is 2,000 while B3 has 3,000', async () => {
    const res = await me('E002');
    expect(res.status).toBe(200);
    expect(res.body.settings['home_service.transport_fee_amount']).toBe(2000);
    expect(Object.keys(res.body.settings as object)).toHaveLength(10);
  });

  it('Scenario: The own-earnings switch', async () => {
    await prisma.employees.update({
      where: { id: FIXTURE_IDS.employees.E005 },
      data: { show_own_earnings: false },
    });
    at('2026-10-05T09:40:00');
    await storeSetting(s, 'dashboard.show_own_earnings_all', true);
    expect((await me('E004')).body.effective).toStrictEqual({ show_own_earnings: true });
    expect((await me('E005')).body.effective).toStrictEqual({ show_own_earnings: false });
  });

  it('Scenario: System language', async () => {
    await storeSetting(s, 'system.default_language', UiLanguage.EN);
    const { body } = await me('E004');
    expect(body.system.default_language).toBe(2);
    expect(body.settings['system.default_language']).toBe(2);
  });
});
