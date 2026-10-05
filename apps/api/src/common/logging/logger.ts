import type { LoggerService } from '@nestjs/common';
import { type DestinationStream, type Logger, pino } from 'pino';

// Structured JSON logs on stdout through one injected pino logger (ADR-007 decision 5 · CG-OBS-01).
// The redaction list is the one place CG-OBS-03's "never logged" values are named.
export const LOGGER = Symbol('LOGGER');

export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-internal-key"]',
  'headers.cookie',
  'headers.authorization',
  'headers["x-internal-key"]',
];

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
