import { Injectable } from '@nestjs/common';

// Where a defect is reported (add-staging-deploy design D9 · ADR-007 decision 3 · CG-OBS-04): the
// problem filter for an answer with status ≥ 500, the jobs worker for a job that failed its last retry.
// Nothing here knows Sentry — `modules/platform/observability` plugs its sink in at start-up when
// SENTRY_DSN_API is set; without a sink a report goes nowhere (development, CI).

/** The request an event belongs to: its URL and its method. */
export interface ReportedRequest {
  readonly url: string;
  readonly method: string;
}

export interface ErrorSink {
  capture(error: unknown, tags: Readonly<Record<string, string>>, request?: ReportedRequest): void;
  close(timeoutMs: number): Promise<boolean>;
}

/** Only a defect is reported: an expected problem answer (400–499) never is (CG-OBS-04). */
export const isReported = (status: number): boolean => status >= 500;

@Injectable()
export class ErrorReporter {
  private sink: ErrorSink | undefined;

  /** Called once by the observability module. */
  use(sink: ErrorSink): void {
    this.sink = sink;
  }

  /** A sink is set — the SDK was started because SENTRY_DSN_API is set. */
  get enabled(): boolean {
    return this.sink !== undefined;
  }

  capture(error: unknown, tags: Readonly<Record<string, string>>, request?: ReportedRequest): void {
    this.sink?.capture(error, tags, request);
  }

  /** Sends what is queued and stops the sink — at shutdown. */
  async close(timeoutMs = 2000): Promise<void> {
    const sink = this.sink;
    this.sink = undefined;
    await sink?.close(timeoutMs);
  }
}
