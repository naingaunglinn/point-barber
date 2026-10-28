import { REDACTED_KEYS } from '../../../common/logging/logger.js';

// What may reach Sentry (add-staging-deploy design D9 · CG-OBS-03 · CG-SEC-06): no cookie, header,
// body, query string, user or IP; e-mail addresses and runs of 8 or more digits (codes, phone numbers,
// tokens) in a message or an exception value become `[redacted]`; any `extra` / `contexts` key on the
// logger's redaction list is dropped — the list lives once (REDACTED_KEYS). A pure function, so it is
// unit-tested with built events and used by the web app's rules too.

export const REDACTED = '[redacted]';

const EMAIL = /[^\s@<>()"',;]+@[^\s@<>()"',;]+\.[A-Za-z]{2,}/g;
const LONG_DIGITS = /\d{8,}/g;

/** E-mail addresses and runs of 8+ digits replaced. */
export const redactText = (text: string): string =>
  text.replace(EMAIL, REDACTED).replace(LONG_DIGITS, REDACTED);

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
