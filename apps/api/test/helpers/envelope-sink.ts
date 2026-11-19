import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gunzipSync } from 'node:zlib';

// A local stand-in for Sentry's ingest (add-staging-deploy design D9 · D17): the API's SDK posts its
// envelopes here when SENTRY_DSN_API is the sink's `dsn`, so no test talks to sentry.io. An envelope
// is newline-delimited JSON: a header line, then an item header and its payload per item.

export interface SentEvent {
  readonly tags?: Record<string, string>;
  readonly release?: string;
  readonly environment?: string;
  readonly request?: Record<string, unknown>;
  readonly user?: unknown;
}

export interface EnvelopeSink {
  /** `http://public@127.0.0.1:<port>/1` */
  readonly dsn: string;
  /** Every request body as received (decompressed) — for "appears nowhere" checks. */
  readonly bodies: string[];
  /** The `event` items of every envelope, in arrival order. */
  readonly events: SentEvent[];
  /** Resolves once `count` events arrived; rejects after `ms`. */
  waitFor(count: number, ms?: number): Promise<void>;
  close(): Promise<void>;
}

function eventsOf(body: string): SentEvent[] {
  const lines = body.split('\n').filter((line) => line.length > 0);
  const events: SentEvent[] = [];
  for (let i = 1; i + 1 < lines.length; i += 2) {
    const item = JSON.parse(lines[i] ?? '{}') as { type?: string };
    if (item.type === 'event') events.push(JSON.parse(lines[i + 1] ?? '{}') as SentEvent);
  }
  return events;
}

export async function startEnvelopeSink(): Promise<EnvelopeSink> {
  const bodies: string[] = [];
  const events: SentEvent[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const body = (req.headers['content-encoding'] === 'gzip' ? gunzipSync(raw) : raw).toString(
        'utf8',
      );
      bodies.push(body);
      events.push(...eventsOf(body));
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
    });
  });
  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
  const { port } = server.address() as AddressInfo;
  return {
    dsn: `http://public@127.0.0.1:${port}/1`,
    bodies,
    events,
    async waitFor(count, ms = 10_000) {
      const end = Date.now() + ms;
      while (events.length < count) {
        if (Date.now() > end) throw new Error(`${events.length} of ${count} events arrived`);
        await new Promise((done) => setTimeout(done, 50));
      }
    },
    close: () => new Promise<void>((closed) => server.close(() => closed())),
  };
}

/** A local port nothing listens on — a mail server that is down. */
export async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((closed) => server.close(() => closed()));
  return port;
}
