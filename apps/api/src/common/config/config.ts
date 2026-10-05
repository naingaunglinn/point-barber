import { type ApiEnv, parseApiEnv } from './env.schema.js';

// The only reader of process.env in the API (CG-SEC-05 · design D5 / D19). Values are read by name,
// validated once and passed on as AppConfig; nothing else touches the environment.
export abstract class AppConfig {
  abstract readonly env: ApiEnv;
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
  });
  return { env };
}
