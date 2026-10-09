import { connect } from 'node:tls';

import { EDGE_ADDRESS } from '../hosts.js';

// Sends one request line exactly as written, over TLS to the edge (task 8.1 · design D12 · D18).
// Browsers and HTTP clients clean `..` and `%2e%2e` out of a path before sending it, which would
// hide the dot-segment cases of edge.spec.ts; this helper does not.

export interface RawResponse {
  readonly status: number;
  /** Lower-cased names; a repeated header is joined with ", ". */
  readonly headers: Record<string, string>;
  readonly body: string;
}

export interface RawRequest {
  /** Host header and TLS server name, e.g. "point.test". */
  readonly host: string;
  /** Sent as is — no normalisation, no encoding. */
  readonly path: string;
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

function dechunk(body: string): string {
  let out = '';
  let rest = body;
  for (;;) {
    const lineEnd = rest.indexOf('\r\n');
    if (lineEnd === -1) return out;
    const size = Number.parseInt(rest.slice(0, lineEnd), 16);
    if (!Number.isInteger(size) || size === 0) return out;
    out += rest.slice(lineEnd + 2, lineEnd + 2 + size);
    rest = rest.slice(lineEnd + 2 + size + 2);
  }
}

/** Parses a complete HTTP/1.1 response as received on the socket. */
export function parseRawResponse(text: string): RawResponse {
  const status = /^HTTP\/1\.[01] (\d{3})/.exec(text);
  if (!status) throw new Error(`not an HTTP response: ${JSON.stringify(text.slice(0, 40))}`);
  const split = text.indexOf('\r\n\r\n');
  const head = split === -1 ? text : text.slice(0, split);
  const rawBody = split === -1 ? '' : text.slice(split + 4);
  const headers: Record<string, string> = {};
  for (const line of head.split('\r\n').slice(1)) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    headers[name] = name in headers ? `${headers[name]}, ${value}` : value;
  }
  const chunked = /\bchunked\b/i.test(headers['transfer-encoding'] ?? '');
  return { status: Number(status[1]), headers, body: chunked ? dechunk(rawBody) : rawBody };
}

/** One raw request to the edge on port 443; resolves when the server closes the connection. */
export function rawRequest({
  host,
  path,
  method = 'GET',
  headers = {},
}: RawRequest): Promise<RawResponse> {
  const lines = [`${method} ${path} HTTP/1.1`, `Host: ${host}`, 'Connection: close'];
  for (const [name, value] of Object.entries(headers)) lines.push(`${name}: ${value}`);
  const request = `${lines.join('\r\n')}\r\n\r\n`;

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    // The local Caddy certificate is not trusted by Node; the request goes to a known address.
    const socket = connect(
      { host: EDGE_ADDRESS, port: 443, servername: host, rejectUnauthorized: false },
      () => {
        socket.end(request);
      },
    );
    socket.setTimeout(15_000, () =>
      socket.destroy(new Error(`raw request to ${host}${path} timed out`)),
    );
    socket.on('data', (chunk: Buffer) => chunks.push(chunk));
    socket.on('error', reject);
    socket.on('close', () => {
      try {
        resolve(parseRawResponse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}
