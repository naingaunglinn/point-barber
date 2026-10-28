import { z } from 'zod';

// The API's environment (CG-SEC-05 · API-SHAPE-02 · design D5 / D9). src/common/config/ is the only
// place in the API that reads process.env; a missing or malformed variable stops the start with
// the variable's name — never its value.

// `abort: true` skips the refinement once the url check has failed, so a variable gets one message;
// URL.canParse keeps the refinement from throwing on its own.
const origin = z
  .url({ protocol: /^https?$/, abort: true })
  .refine((value) => URL.canParse(value) && new URL(value).origin === value, {
    message: 'must be an origin such as https://point.test (no path, no trailing slash)',
  });
const secret = z.string().min(16, 'must be at least 16 characters');
// The generated secrets of add-foundation-auth-access (design D18): at least 32 bytes.
const secret32 = z
  .string()
  .refine((value) => Buffer.byteLength(value, 'utf8') >= 32, 'must be at least 32 bytes');
// The AES-256-GCM key of the mail payload (design D8): exactly 32 bytes, base64.
const aesKey = z
  .string()
  .refine(
    (value) => /^[A-Za-z0-9+/]+={0,2}$/.test(value) && Buffer.from(value, 'base64').length === 32,
    'must be 32 bytes, base64',
  );
// `true` or `false`, nothing else.
const flag = (fallback: boolean) =>
  z
    .enum(['true', 'false'])
    .default(fallback ? 'true' : 'false')
    .transform((value) => value === 'true');

export const apiEnvSchema = z
  .object({
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    SITE_ORIGIN: origin,
    APP_ORIGIN: origin,
    API_PORT: z.coerce.number().int().min(1).max(65535),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
    // Present and different from the start; no code uses them yet (ADR-009).
    INTERNAL_SSR_KEY: secret,
    INTERNAL_OPS_KEY: secret,
    APP_VERSION: z.string().default('0.0.0-dev'),
    // add-foundation-auth-access — design D18.
    APP_ENV: z.enum(['development', 'test', 'staging', 'production']),
    SESSION_COOKIE_SECURE: flag(true),
    OTP_HMAC_SECRET: secret32,
    AUDIT_HASH_SECRET: secret32,
    MAIL_PAYLOAD_KEY: aesKey,
    MAIL_TRANSPORT: z.enum(['mailpit', 'resend']),
    MAIL_FROM: z.string().min(1),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    RESEND_API_KEY: z.string().min(1).optional(),
    MAIL_ALLOW_REAL: flag(false),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    GOOGLE_ISSUER: z.url({ protocol: /^https?$/ }).default('https://accounts.google.com'),
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
    COMPANY_NAME_MM: z.string().min(1),
    COMPANY_NAME_EN: z.string().min(1).optional(),
    JOBS_IN_API: flag(true),
    // add-staging-deploy — design D9 / D13: error reporting only when set.
    SENTRY_DSN_API: z.url({ protocol: /^https?$/ }).optional(),
  })
  .refine((env) => env.INTERNAL_SSR_KEY !== env.INTERNAL_OPS_KEY, {
    message: 'INTERNAL_SSR_KEY and INTERNAL_OPS_KEY must be different',
    path: ['INTERNAL_OPS_KEY'],
  })
  // The start-up checks of design D6 / D8: no secure-cookie switch-off outside development and
  // test (API-AUTH-01), real mail only in production or by an explicit switch (ADR-007).
  .superRefine((env, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (env.APP_ENV === 'production' && env.MAIL_TRANSPORT !== 'resend')
      issue('MAIL_TRANSPORT', 'must be resend when APP_ENV is production');
    if (env.APP_ENV !== 'production' && env.MAIL_TRANSPORT === 'resend' && !env.MAIL_ALLOW_REAL)
      issue('MAIL_TRANSPORT', 'resend outside production needs MAIL_ALLOW_REAL=true');
    if (env.MAIL_TRANSPORT === 'resend' && env.RESEND_API_KEY === undefined)
      issue('RESEND_API_KEY', 'is required');
    if (env.MAIL_TRANSPORT === 'mailpit' && env.SMTP_HOST === undefined)
      issue('SMTP_HOST', 'is required');
    if (!env.SESSION_COOKIE_SECURE && env.APP_ENV !== 'development' && env.APP_ENV !== 'test')
      issue('SESSION_COOKIE_SECURE', 'may be false only when APP_ENV is development or test');
  });

export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** Validates a raw environment; throws one error naming every missing or malformed variable. */
export function parseApiEnv(raw: Readonly<Record<string, string | undefined>>): ApiEnv {
  // An empty value (`APP_VERSION=` in an env file) counts as not set.
  const cleaned = Object.fromEntries(
    Object.entries(raw).map(([name, value]) => [name, value === '' ? undefined : value]),
  );
  const result = apiEnvSchema.safeParse(cleaned);
  if (result.success) return result.data;
  const problems = result.error.issues.map((issue) => {
    const name = String(issue.path[0] ?? '');
    if (issue.message.includes('must be different')) return issue.message;
    return cleaned[name] === undefined ? `${name} is required` : `${name} ${issue.message}`;
  });
  throw new Error(`Invalid API environment: ${problems.join('; ')}`);
}
