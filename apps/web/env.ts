// The only reader of process.env in the web app (CG-SEC-05 · design D11). Each variable is read by
// its literal name, so Next.js can inline NEXT_PUBLIC_API_BASE into browser code once a client
// component needs it. Validation runs on first use, not at import: `next build` loads every route
// module and must pass without the runtime environment.
import { z } from 'zod';

const httpUrl = z.url({ protocol: /^https?$/, abort: true });

// Scheme + host (+ port) only — `https://point.test`, never a path or a trailing slash.
// `abort: true` skips this refinement when z.url() has failed, so a variable gets one message;
// URL.canParse keeps the refinement from throwing on its own.
const origin = httpUrl.refine((value) => URL.canParse(value) && new URL(value).origin === value, {
  message: 'must be an origin such as https://point.test (no path, no trailing slash)',
});

const webEnvSchema = z.object({
  SITE_ORIGIN: origin,
  APP_ORIGIN: origin,
  APP_VERSION: z.string().default('0.0.0-dev'),
  // ADR-009 action item 3: the browser calls the API on its own origin (`/api/v1`).
  NEXT_PUBLIC_API_BASE: z.string().regex(/^\/(?!\/)/, 'must be a same-origin path such as /api/v1'),
  // Server-side calls go over the Docker network (`http://api:3001/api/v1`).
  API_INTERNAL_BASE: httpUrl,
});

export type WebEnv = z.infer<typeof webEnvSchema>;
export type RawWebEnv = Readonly<Record<keyof WebEnv, string | undefined>>;

/** Validates a raw environment; throws one error that names every missing or malformed variable. */
export function parseWebEnv(raw: RawWebEnv): WebEnv {
  // An empty value (`APP_VERSION=` in an env file) counts as not set.
  const cleaned: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(raw).map(([name, value]) => [name, value === '' ? undefined : value]),
  );
  const result = webEnvSchema.safeParse(cleaned);
  if (result.success) return result.data;
  // Values are never printed — later variables hold secrets (CG-OBS-03).
  const problems = result.error.issues.map((issue) => {
    const name = String(issue.path[0]);
    return cleaned[name] === undefined ? `${name} is required` : `${name} ${issue.message}`;
  });
  throw new Error(`Invalid web app environment: ${problems.join('; ')}`);
}

let cached: WebEnv | undefined;

/** The validated environment, read once on first use. */
export function getEnv(): WebEnv {
  cached ??= parseWebEnv({
    SITE_ORIGIN: process.env.SITE_ORIGIN,
    APP_ORIGIN: process.env.APP_ORIGIN,
    APP_VERSION: process.env.APP_VERSION,
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE,
    API_INTERNAL_BASE: process.env.API_INTERNAL_BASE,
  });
  return cached;
}

/**
 * The development catalogue `/dev/ui` (AD-IMPL-06 · design D12). `NEXT_PUBLIC_DEV_CATALOGUE=1` is set
 * only by the `dev` and `build:catalogue` scripts of apps/web and inlined at build time, so every
 * other build — the production image included — answers 404 on `/dev/ui`, whatever the runtime
 * environment says. Not part of the schema above: the flag is never in `.env.example` or an env file.
 */
export const DEV_CATALOGUE = process.env.NEXT_PUBLIC_DEV_CATALOGUE === '1';
