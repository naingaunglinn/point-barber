import type { LoggerService } from '@nestjs/common';
import { type DestinationStream, type Logger, pino } from 'pino';

// Structured JSON logs on stdout through one injected pino logger (ADR-007 decision 5 · CG-OBS-01).
// The redaction list is the one place CG-OBS-03's "never logged" values are named.
export const LOGGER = Symbol('LOGGER');

/**
 * Keys whose values never reach a log line (CG-OBS-03 · CG-SEC-06 · add-foundation-auth-access
 * D7 / D8): the mail job's template parameters, the sign-in code, the Google `state`, tokens,
 * cookies and the internal key.
 */
export const REDACTED_KEYS = [
  'params',
  'code',
  'state',
  'token',
  'cookie',
  'set-cookie',
  'authorization',
  'x-internal-key',
] as const;

/** pino paths for each key at the top level and up to three levels deep (`*` = one level). */
export const REDACT_PATHS = REDACTED_KEYS.flatMap((key) => {
  const name = /^[a-z_]+$/.test(key) ? `.${key}` : `["${key}"]`;
  return ['', '*', '*.*', '*.*.*'].map((prefix) =>
    prefix === '' ? name.replace(/^\./, '') : `${prefix}${name}`,
  );
});

export function createLogger(level: string, destination?: DestinationStream): Logger {
  return pino(
    {
      level,
      base: undefined, // no pid / hostname in every line
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
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
