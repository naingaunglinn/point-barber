import { type ApiEnv, parseApiEnv } from './env.schema.js';

// The only reader of process.env in the API (CG-SEC-05 · design D5 / D19). Values are read by name,
// validated once and passed on as AppConfig; nothing else touches the environment.
export abstract class AppConfig {
  abstract readonly env: ApiEnv;
}

/**
 * A command (db:seed, admin:create) starts the application without job workers: it runs its own
 * steps and leaves the queues to the API (design D10). Called before the application is created.
 */
export function withoutJobWorkers(): void {
  process.env.JOBS_IN_API = 'false';
}

export function loadAppConfig(): AppConfig {
  const env = parseApiEnv({
    DATABASE_URL: process.env.DATABASE_URL,
    SITE_ORIGIN: process.env.SITE_ORIGIN,
    APP_ORIGIN: process.env.APP_ORIGIN,
    API_PORT: process.env.API_PORT,
    LOG_LEVEL: process.env.LOG_LEVEL,
    INTERNAL_SSR_KEY: process.env.INTERNAL_SSR_KEY,
    INTERNAL_OPS_KEY: process.env.INTERNAL_OPS_KEY,
    APP_VERSION: process.env.APP_VERSION,
    APP_ENV: process.env.APP_ENV,
    SESSION_COOKIE_SECURE: process.env.SESSION_COOKIE_SECURE,
    OTP_HMAC_SECRET: process.env.OTP_HMAC_SECRET,
    AUDIT_HASH_SECRET: process.env.AUDIT_HASH_SECRET,
    MAIL_PAYLOAD_KEY: process.env.MAIL_PAYLOAD_KEY,
    MAIL_TRANSPORT: process.env.MAIL_TRANSPORT,
    MAIL_FROM: process.env.MAIL_FROM,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    MAIL_ALLOW_REAL: process.env.MAIL_ALLOW_REAL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_ISSUER: process.env.GOOGLE_ISSUER,
    TRUSTED_PROXY_HOPS: process.env.TRUSTED_PROXY_HOPS,
    COMPANY_NAME_MM: process.env.COMPANY_NAME_MM,
    COMPANY_NAME_EN: process.env.COMPANY_NAME_EN,
    JOBS_IN_API: process.env.JOBS_IN_API,
    SENTRY_DSN_API: process.env.SENTRY_DSN_API,
  });
  return { env };
}
