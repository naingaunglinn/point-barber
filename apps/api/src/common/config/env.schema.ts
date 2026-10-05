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
  })
  .refine((env) => env.INTERNAL_SSR_KEY !== env.INTERNAL_OPS_KEY, {
    message: 'INTERNAL_SSR_KEY and INTERNAL_OPS_KEY must be different',
    path: ['INTERNAL_OPS_KEY'],
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
