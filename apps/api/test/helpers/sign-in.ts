import type { Response } from 'supertest';

import { AppConfig } from '../../src/common/config/config.js';
import { PrismaService } from '../../src/common/database/prisma.service.js';
import { BackgroundTasks } from '../../src/common/http/background-tasks.js';
import { decryptParams } from '../../src/modules/platform/mail/payload-cipher.js';
import type { TestApp } from './test-app.js';

// The code sign-in as a test drives it: request a code from an IP (the trusted proxy's
// X-Forwarded-For), wait for the issuing work, read the code the `email.send` job carries — decrypted
// with the test key; the job table holds it only encrypted (design D8) — and verify it.

export const OTP_REQUEST = '/api/v1/auth/otp/request';
export const OTP_VERIFY = '/api/v1/auth/otp/verify';

export async function requestCode(
  t: TestApp,
  email: string,
  ip = '203.0.113.50',
): Promise<Response> {
  const res = await t.http.post(OTP_REQUEST).set('X-Forwarded-For', ip).send({ email });
  await t.app.get(BackgroundTasks).drain();
  return res;
}

/** The code of the newest `email.send` job for the address; undefined when none was queued. */
export async function latestCode(t: TestApp, email: string): Promise<string | undefined> {
  const rows = await t.app.get(PrismaService).$queryRaw<{ params_enc: string }[]>`
    SELECT data->>'params_enc' AS params_enc FROM pgboss.job
    WHERE name = 'email.send' AND data->>'to' = ${email}
    ORDER BY created_on DESC, id DESC LIMIT 1`;
  const [row] = rows;
  if (row === undefined) return undefined;
  return decryptParams(row.params_enc, t.app.get(AppConfig).env.MAIL_PAYLOAD_KEY).code;
}

/** How many `email.send` jobs exist for the address. */
export async function codeJobs(t: TestApp, email: string): Promise<number> {
  const rows = await t.app.get(PrismaService).$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM pgboss.job WHERE name = 'email.send' AND data->>'to' = ${email}`;
  return Number(rows[0]?.n ?? 0);
}

export function verify(
  t: TestApp,
  email: string,
  code: string,
  options: { readonly ip?: string; readonly cookie?: string; readonly userAgent?: string } = {},
) {
  let request = t.http
    .post(OTP_VERIFY)
    .set('X-Forwarded-For', options.ip ?? '203.0.113.50')
    .set(
      'User-Agent',
      options.userAgent ??
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
    );
  if (options.cookie !== undefined) request = request.set('Cookie', options.cookie);
  return request.send({ email, code });
}

/** The `point_session` cookie value a response set; undefined when none. */
export function sessionCookieOf(res: { headers: Record<string, unknown> }): string | undefined {
  const cookies = (res.headers['set-cookie'] as string[] | undefined) ?? [];
  const cookie = cookies.find((value) => value.startsWith('point_session='));
  return cookie?.split(';')[0]?.slice('point_session='.length) || undefined;
}
