import type { LoggerService } from '@nestjs/common';
import { REDACTED_KEYS, redactSignedUrls } from '@point/shared';
import { type DestinationStream, type Logger, pino } from 'pino';

// Structured JSON logs on stdout through one injected pino logger (ADR-007 decision 5 · CG-OBS-01).
// The redaction list is the one place CG-OBS-03's "never logged" values are named: REDACTED_KEYS of
// packages/shared, which the error reports of add-staging-deploy drop too.
export const LOGGER = Symbol('LOGGER');

/**
 * The sign-in code and the Google `state` by the paths they travel — a request body or query. Their
 * names are common (an error's `code`, a job's `state`), so they are not redacted everywhere.
 */
const REDACTED_REQUEST_FIELDS = ['code', 'state'] as const;

/** pino paths for each key at the top level and up to three levels deep (`*` = one level). */
export const REDACT_PATHS = [
  ...REDACTED_KEYS.flatMap((key) => {
    const name = /^[a-z_]+$/.test(key) ? `.${key}` : `["${key}"]`;
    return ['', '*', '*.*', '*.*.*'].map((prefix) =>
      prefix === '' ? name.replace(/^\./, '') : `${prefix}${name}`,
    );
  }),
  ...REDACTED_REQUEST_FIELDS.flatMap((field) =>
    ['body', 'query', 'req.body', 'req.query', '*.body', '*.query'].map(
      (path) => `${path}.${field}`,
    ),
  ),
];

const SCRUB_DEPTH = 5;

/**
 * A presigned link anywhere in a log call — the message or a field, up to five levels deep — loses its
 * signature, credential and token (CG-SEC-10 · add-attachments-upload design D9). Key-based redaction
 * cannot see a link inside a URL string. Errors keep their own serializer and are scrubbed as text.
 */
export function scrubSignedUrls(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return value.includes('X-Amz-') ? redactSignedUrls(value) : value;
  if (value instanceof Error) {
    value.message = redactSignedUrls(value.message);
    if (value.stack !== undefined) value.stack = redactSignedUrls(value.stack);
    return value;
  }
  if (depth >= SCRUB_DEPTH || typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return value.map((item) => scrubSignedUrls(item, depth + 1));
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, scrubSignedUrls(item, depth + 1)]),
  );
}

export function createLogger(level: string, destination?: DestinationStream): Logger {
  return pino(
    {
      level,
      base: undefined, // no pid / hostname in every line
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      hooks: {
        logMethod(args, method) {
          method.apply(this, args.map((arg) => scrubSignedUrls(arg)) as typeof args);
        },
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  );
}

/** NestJS's own messages (start-up, routes) through the same logger. */
export class PinoNestLogger implements LoggerService {
  constructor(private readonly pino: Logger) {}

  log(message: unknown, context?: string): void {
    this.pino.info({ context }, String(message));
  }
  error(message: unknown, trace?: string, context?: string): void {
    this.pino.error({ context, trace }, String(message));
  }
  warn(message: unknown, context?: string): void {
    this.pino.warn({ context }, String(message));
  }
  debug(message: unknown, context?: string): void {
    this.pino.debug({ context }, String(message));
  }
  verbose(message: unknown, context?: string): void {
    this.pino.trace({ context }, String(message));
  }
}
