import { describe, expect, it } from 'vitest';

import { parseApiEnv } from './env.schema.js';

const key32 = Buffer.alloc(32, 7).toString('base64');
const valid = {
  DATABASE_URL: 'postgresql://point_app:pw@localhost:5432/point',
  SITE_ORIGIN: 'https://point.test',
  APP_ORIGIN: 'https://app.point.test',
  API_PORT: '3001',
  LOG_LEVEL: 'info',
  INTERNAL_SSR_KEY: 's'.repeat(16),
  INTERNAL_OPS_KEY: 'o'.repeat(16),
  // add-foundation-auth-access — design D18.
  APP_ENV: 'development',
  OTP_HMAC_SECRET: 'h'.repeat(32),
  AUDIT_HASH_SECRET: 'a'.repeat(32),
  MAIL_PAYLOAD_KEY: key32,
  MAIL_TRANSPORT: 'mailpit',
  MAIL_FROM: 'Point Barbershop <no-reply@point.test>',
  SMTP_HOST: 'mailpit',
  GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'google-secret',
  COMPANY_NAME_MM: 'ပွိုင့် ဘာဘာရှော့',
  // add-walkin-visit-checkout — the bucket (ADR-014 · task 3.5).
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET_APP: 'point-app',
  S3_ACCESS_KEY_ID: 'minio-dev',
  S3_SECRET_ACCESS_KEY: 'minio-dev-only',
};

function messageOf(raw: Record<string, string | undefined>): string {
  try {
    parseApiEnv(raw);
  } catch (error) {
    return (error as Error).message;
  }
  return '';
}

// API-SHAPE-02 · CG-SEC-05 · design D5 / D9 — the API reads its environment once, through this schema.
describe('API environment schema', () => {
  it('reads a complete environment', () => {
    expect(parseApiEnv(valid)).toMatchObject({ API_PORT: 3001, SITE_ORIGIN: 'https://point.test' });
  });

  it('stops the start when DATABASE_URL is missing, naming it', () => {
    const rest: Record<string, string> = { ...valid };
    delete rest.DATABASE_URL;
    expect(() => parseApiEnv(rest)).toThrow(/DATABASE_URL is required/);
  });

  it('stops the start when INTERNAL_SSR_KEY equals INTERNAL_OPS_KEY', () => {
    expect(() => parseApiEnv({ ...valid, INTERNAL_OPS_KEY: valid.INTERNAL_SSR_KEY })).toThrow(
      /INTERNAL_SSR_KEY and INTERNAL_OPS_KEY must be different/,
    );
  });

  // A failed URL check stops the origin refinement, so the variable gets one message (PR #5 review).
  it.each(['SITE_ORIGIN', 'APP_ORIGIN'])(
    'gives one message when %s is not a URL at all',
    (name) => {
      expect(() => parseApiEnv({ ...valid, [name]: 'point.test' })).toThrow(
        new Error(`Invalid API environment: ${name} Invalid URL`),
      );
    },
  );

  it('defaults APP_VERSION to 0.0.0-dev when it is not set', () => {
    expect(parseApiEnv(valid).APP_VERSION).toBe('0.0.0-dev');
    expect(parseApiEnv({ ...valid, APP_VERSION: '' }).APP_VERSION).toBe('0.0.0-dev');
    expect(parseApiEnv({ ...valid, APP_VERSION: '0.1.0' }).APP_VERSION).toBe('0.1.0');
  });

  it('names every failing variable in one error and never prints a value', () => {
    const message = messageOf({ ...valid, SITE_ORIGIN: 'not a url', API_PORT: 'abc' });
    expect(message).toMatch(/SITE_ORIGIN/);
    expect(message).toMatch(/API_PORT/);
    expect(message).not.toMatch(/ssr-key|ops-key|point_app:pw/);
  });
});

// add-foundation-auth-access task 1.7 — the 18 variables of design D18 and their start-up checks
// (API-AUTH-01 · ADR-005 action item 2 · ADR-007 · ADR-002).
describe('API environment schema · sign-in, mail, jobs (design D18)', () => {
  it('reads the variables with their defaults', () => {
    expect(parseApiEnv(valid)).toMatchObject({
      APP_ENV: 'development',
      SESSION_COOKIE_SECURE: true,
      MAIL_TRANSPORT: 'mailpit',
      SMTP_HOST: 'mailpit',
      SMTP_PORT: 1025,
      MAIL_ALLOW_REAL: false,
      GOOGLE_ISSUER: 'https://accounts.google.com',
      TRUSTED_PROXY_HOPS: 1,
      COMPANY_NAME_MM: 'ပွိုင့် ဘာဘာရှော့',
      JOBS_IN_API: true,
    });
    expect(parseApiEnv(valid).COMPANY_NAME_EN).toBeUndefined();
  });

  it('reads JOBS_IN_API=false and SESSION_COOKIE_SECURE=false in development', () => {
    expect(
      parseApiEnv({ ...valid, JOBS_IN_API: 'false', SESSION_COOKIE_SECURE: 'false' }),
    ).toMatchObject({ JOBS_IN_API: false, SESSION_COOKIE_SECURE: false });
  });

  it.each([
    'APP_ENV',
    'OTP_HMAC_SECRET',
    'AUDIT_HASH_SECRET',
    'MAIL_PAYLOAD_KEY',
    'MAIL_TRANSPORT',
  ])('stops the start when %s is missing', (name) => {
    expect(messageOf({ ...valid, [name]: undefined })).toMatch(new RegExp(`${name} is required`));
  });

  it('refuses an unknown APP_ENV', () => {
    expect(messageOf({ ...valid, APP_ENV: 'prod' })).toMatch(/APP_ENV/);
  });

  it.each(['OTP_HMAC_SECRET', 'AUDIT_HASH_SECRET'])(
    'refuses %s shorter than 32 bytes and never prints it',
    (name) => {
      const message = messageOf({
        ...valid,
        [name]: 'short-secret-31-bytes-xxxxxxxxxx'.slice(0, 31),
      });
      expect(message).toMatch(new RegExp(`${name} must be at least 32 bytes`));
      expect(message).not.toMatch(/short-secret/);
    },
  );

  it('counts bytes, not characters', () => {
    // 11 Myanmar letters = 33 bytes in UTF-8.
    expect(parseApiEnv({ ...valid, OTP_HMAC_SECRET: 'က'.repeat(11) }).OTP_HMAC_SECRET).toBe(
      'က'.repeat(11),
    );
  });

  it.each([
    ['16 bytes', Buffer.alloc(16, 1).toString('base64')],
    ['not base64', 'x'.repeat(44)],
  ])('refuses a MAIL_PAYLOAD_KEY of %s', (_, value) => {
    expect(messageOf({ ...valid, MAIL_PAYLOAD_KEY: value })).toMatch(
      /MAIL_PAYLOAD_KEY must be 32 bytes, base64/,
    );
  });

  it('refuses mailpit in production', () => {
    expect(messageOf({ ...valid, APP_ENV: 'production' })).toMatch(
      /MAIL_TRANSPORT must be resend when APP_ENV is production/,
    );
  });

  it('accepts resend in production', () => {
    expect(
      parseApiEnv({
        ...valid,
        APP_ENV: 'production',
        MAIL_TRANSPORT: 'resend',
        RESEND_API_KEY: 're_x',
      }),
    ).toMatchObject({ MAIL_TRANSPORT: 'resend' });
  });

  it.each(['development', 'test', 'staging'])(
    'refuses resend in %s unless MAIL_ALLOW_REAL=true',
    (appEnv) => {
      const env = { ...valid, APP_ENV: appEnv, MAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_x' };
      expect(messageOf(env)).toMatch(
        /MAIL_TRANSPORT resend outside production needs MAIL_ALLOW_REAL=true/,
      );
      expect(parseApiEnv({ ...env, MAIL_ALLOW_REAL: 'true' }).MAIL_TRANSPORT).toBe('resend');
    },
  );

  it('needs RESEND_API_KEY with resend and SMTP_HOST with mailpit', () => {
    expect(
      messageOf({
        ...valid,
        APP_ENV: 'production',
        MAIL_TRANSPORT: 'resend',
        SMTP_HOST: undefined,
      }),
    ).toMatch(/RESEND_API_KEY is required/);
    expect(messageOf({ ...valid, SMTP_HOST: undefined })).toMatch(/SMTP_HOST is required/);
  });

  it.each(['development', 'test'])('allows SESSION_COOKIE_SECURE=false in %s', (appEnv) => {
    expect(
      parseApiEnv({ ...valid, APP_ENV: appEnv, SESSION_COOKIE_SECURE: 'false' })
        .SESSION_COOKIE_SECURE,
    ).toBe(false);
  });

  it.each(['staging', 'production'])('refuses SESSION_COOKIE_SECURE=false in %s', (appEnv) => {
    const env = {
      ...valid,
      APP_ENV: appEnv,
      MAIL_TRANSPORT: 'resend',
      RESEND_API_KEY: 're_x',
      MAIL_ALLOW_REAL: 'true',
      SESSION_COOKIE_SECURE: 'false',
    };
    expect(messageOf(env)).toMatch(
      /SESSION_COOKIE_SECURE may be false only when APP_ENV is development or test/,
    );
  });

  it.each(['SESSION_COOKIE_SECURE', 'MAIL_ALLOW_REAL', 'JOBS_IN_API'])(
    'refuses a %s that is not true or false',
    (name) => {
      expect(messageOf({ ...valid, [name]: 'yes' })).toMatch(new RegExp(name));
    },
  );

  // add-walkin-visit-checkout task 3.5 — the bucket of generated documents (ADR-014).
  it.each([
    'S3_ENDPOINT',
    'S3_REGION',
    'S3_BUCKET_APP',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
  ])('stops the start when %s is missing, naming it', (name) => {
    const rest: Record<string, string> = { ...valid };
    delete rest[name];
    expect(() => parseApiEnv(rest)).toThrow(new RegExp(`${name} is required`));
  });

  it('refuses an S3_ENDPOINT that is not an http(s) URL', () => {
    expect(messageOf({ ...valid, S3_ENDPOINT: 'localhost:9000' })).toMatch(/S3_ENDPOINT/);
  });
});
