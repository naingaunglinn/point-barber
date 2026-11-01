// What may reach Sentry from the API and from the web app (add-staging-deploy design D9 / D10 ·
// CG-OBS-03 · CG-SEC-06): no cookie, header, body, query string, user or IP; e-mail addresses and runs
// of 8 or more digits (codes, phone numbers, tokens) in a message or an exception value become
// `[redacted]`; any `extra` / `contexts` key on the redaction list is dropped. The list lives once
// (CG-OBS-03): the API's logger redacts the same keys. Pure functions, unit-tested with built events.

/**
 * Keys whose values never reach a log line or an error report, wherever they appear (CG-OBS-03 ·
 * CG-SEC-06 · add-foundation-auth-access D7 / D8): the mail job's template parameters, tokens,
 * cookies and the internal key.
 */
export const REDACTED_KEYS = [
  'params',
  'token',
  'cookie',
  'set-cookie',
  'authorization',
  'x-internal-key',
] as const;

export const REDACTED = '[redacted]';

const EMAIL = /[^\s@<>()"',;]+@[^\s@<>()"',;]+\.[A-Za-z]{2,}/g;
const LONG_DIGITS = /\d{8,}/g;
// A Myanmar mobile number as people write it: 09 or +95 9, then 6 to 9 digits with spaces or dashes.
const MM_PHONE = /(?:\+95[\s-]?|\b0)9(?:[\s-]?\d){6,9}\b/g;

/** E-mail addresses, Myanmar mobile numbers in any spacing and runs of 8+ digits replaced. */
export const redactText = (text: string): string =>
  text.replace(EMAIL, REDACTED).replace(MM_PHONE, REDACTED).replace(LONG_DIGITS, REDACTED);

const DENIED = new Set<string>(REDACTED_KEYS);

const withoutDenied = (record: object) =>
  Object.fromEntries(Object.entries(record).filter(([key]) => !DENIED.has(key.toLowerCase())));

/** The URL without its query string or fragment. */
export function withoutQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/** The parts of a Sentry event this scrubber reads (structurally typed — no SDK import here). */
export interface ScrubbableEvent {
  message?: string | undefined;
  request?: { url?: string | undefined; method?: string | undefined } | undefined;
  exception?: { values?: { value?: string | undefined }[] | undefined } | undefined;
  extra?: object | undefined;
  contexts?: object | undefined;
}

/** `beforeSend`: a copy of the event with nothing of the list above in it. */
export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  const { request, exception, extra, contexts } = event;
  const scrubbed: Record<string, unknown> = { ...(event as Record<string, unknown>) };
  if (event.message !== undefined) scrubbed.message = redactText(event.message);
  if (request !== undefined) {
    scrubbed.request = {
      ...(request.url === undefined ? {} : { url: withoutQuery(request.url) }),
      ...(request.method === undefined ? {} : { method: request.method }),
    };
  }
  if (exception?.values !== undefined) {
    scrubbed.exception = {
      ...exception,
      values: exception.values.map((value) =>
        value.value === undefined ? value : { ...value, value: redactText(value.value) },
      ),
    };
  }
  if (extra !== undefined) scrubbed.extra = withoutDenied(extra);
  if (contexts !== undefined) scrubbed.contexts = withoutDenied(contexts);
  delete scrubbed.user;
  delete scrubbed.breadcrumbs;
  return scrubbed as E;
}
