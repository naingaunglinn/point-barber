// One JSON log line per request (ADR-007 decision 5 · design D5). The path is logged without its
// query string: token-bearing queries arrive with later changes (the Google callback's code and
// state, booking manage tokens — CG-SEC-06 · CG-OBS-03).

export interface RequestFacts {
  readonly request_id: string;
  readonly method: string;
  readonly originalUrl: string;
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
  return {
    request_id: facts.request_id,
    method: facts.method,
    path: queryAt === -1 ? facts.originalUrl : facts.originalUrl.slice(0, queryAt),
    status: facts.status,
    duration_ms: Math.round(facts.duration_ms),
    client_ip: facts.client_ip,
  };
}
