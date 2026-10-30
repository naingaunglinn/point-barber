// One JSON log line per request (ADR-007 decision 5 · design D5). The path is the matched route
// pattern (`/api/v1/me/sessions/:id`), so no id or token in the path is logged; an unmatched request
// logs its path without the query string. Neither the Google callback's code and state nor a booking
// manage token reaches the log (CG-SEC-06 · CG-OBS-03 · add-foundation-auth-access D7).

export interface RequestFacts {
  readonly request_id: string;
  readonly method: string;
  readonly originalUrl: string;
  /** The matched route pattern; undefined when no route matched. */
  readonly route: string | undefined;
  readonly status: number;
  readonly duration_ms: number;
  readonly client_ip: string | undefined;
}

export interface RequestLogLine {
  readonly request_id: string;
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly duration_ms: number;
  readonly client_ip: string | undefined;
}

export function requestLogLine(facts: RequestFacts): RequestLogLine {
  const queryAt = facts.originalUrl.indexOf('?');
  const bare = queryAt === -1 ? facts.originalUrl : facts.originalUrl.slice(0, queryAt);
  return {
    request_id: facts.request_id,
    method: facts.method,
    path: facts.route ?? bare,
    status: facts.status,
    duration_ms: Math.round(facts.duration_ms),
    client_ip: facts.client_ip,
  };
}
