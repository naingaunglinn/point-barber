import { describe, expect, it } from 'vitest';

import {
  REDACTED,
  REDACTED_KEYS,
  redactSignedUrls,
  redactText,
  scrubEvent,
  withoutQuery,
} from './scrub.js';

// add-staging-deploy tasks 3.4 / 4.1 — the `beforeSend` of the API and the web app (design D9 / D10 ·
// CG-OBS-03): spec "No secret or personal data reaches Sentry".

describe('scrubEvent (task 3.4)', () => {
  const event = {
    message: 'send failed for aung@point.test, code 48213907',
    request: {
      url: 'https://app.point.test/api/v1/_fixtures/boom?email=aung@point.test&code=48213907',
      method: 'GET',
      cookies: { point_session: 'tok' },
      headers: { cookie: 'point_session=tok', 'x-internal-key': 'k' },
      data: '{"email":"aung@point.test"}',
      query_string: 'email=aung@point.test',
      env: { REMOTE_ADDR: '203.0.113.7' },
    },
    exception: { values: [{ type: 'Error', value: 'send failed for aung@point.test' }] },
    user: { ip_address: '203.0.113.7' },
    extra: { token: 't', params: 'p', kept: 1 },
    contexts: { cookie: 'c', runtime: { name: 'node' } },
    breadcrumbs: [{ message: 'GET /x?code=1' }],
    tags: { request_id: 'r' },
  };

  it('keeps the URL without its query string and the method only', () => {
    expect(scrubEvent(event).request).toStrictEqual({
      url: 'https://app.point.test/api/v1/_fixtures/boom',
      method: 'GET',
    });
  });

  it('replaces e-mail addresses and runs of 8 or more digits', () => {
    const scrubbed = scrubEvent(event);
    expect(scrubbed.message).toBe(`send failed for ${REDACTED}, code ${REDACTED}`);
    expect(scrubbed.exception?.values?.[0]?.value).toBe(`send failed for ${REDACTED}`);
  });

  it('drops the user, the breadcrumbs and every key of the redaction list', () => {
    const scrubbed = scrubEvent(event);
    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.breadcrumbs).toBeUndefined();
    expect(scrubbed.extra).toStrictEqual({ kept: 1 });
    expect(scrubbed.contexts).toStrictEqual({ runtime: { name: 'node' } });
    expect(scrubbed.tags).toStrictEqual({ request_id: 'r' });
  });

  it('leaves nothing of the secrets anywhere in the event', () => {
    const text = JSON.stringify(scrubEvent(event));
    for (const secret of [
      'aung@point.test',
      '48213907',
      'point_session',
      'x-internal-key',
      '203.0.113.7',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it.each([
    ['09 7712 3456', 'customer 09 7712 3456 not found'],
    ['09-7712-3456', 'customer 09-7712-3456 not found'],
    ['+95 9 7712 3456', 'customer +95 9 7712 3456 not found'],
    ['+959771234567', 'customer +959771234567 not found'],
    ['0977123456', 'customer 0977123456 not found'],
  ])('replaces a Myanmar mobile number written as %s', (phone, text) => {
    const redacted = redactText(text);
    expect(redacted).toBe(`customer ${REDACTED} not found`);
    expect(redacted).not.toContain(phone);
  });

  it('keeps a date and a time readable', () => {
    expect(redactText('closed on 2026-10-05 at 21:05')).toBe('closed on 2026-10-05 at 21:05');
  });

  it('keeps a short number (an id, a status) readable', () => {
    expect(redactText('status 500 at step 1234567')).toBe('status 500 at step 1234567');
    expect(withoutQuery('/a#b')).toBe('/a');
  });

  it('drops a form value sent as the request body', () => {
    const scrubbed = scrubEvent({ request: { url: 'https://app.point.test/login', data: 'x' } });
    expect(scrubbed.request).toStrictEqual({ url: 'https://app.point.test/login' });
  });
});

// add-attachments-upload task 3.10 — "Links, keys and file contents never reach a log or an audit row"
// (CG-SEC-10 · design D9): a presigned link in a message or a log field loses its signature.
describe('redactSignedUrls (add-attachments-upload task 3.10)', () => {
  const LINK =
    'http://localhost:9000/point/att/2026/10/x/original.png?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
    '&X-Amz-Credential=minio%2F20261005%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Expires=300' +
    '&X-Amz-Security-Token=tok123&X-Amz-Signature=abcdef0123456789&x-amz-signedheaders=host';

  it('drops the signature, the credential and the token, and keeps the rest of the link', () => {
    const text = redactSignedUrls(`failed ${LINK} again`);
    for (const secret of ['abcdef0123456789', 'minio%2F2026', 'tok123'])
      expect(text).not.toContain(secret);
    expect(text).toContain('X-Amz-Expires=300');
    expect(text).toContain('X-Amz-Signature=[redacted]');
    expect(text.endsWith(' again')).toBe(true);
  });

  it('is applied to an error message by scrubEvent', () => {
    const event = scrubEvent({ exception: { values: [{ value: `GET ${LINK} timed out` }] } });
    expect(event.exception?.values?.[0]?.value).not.toContain('abcdef0123456789');
  });

  it('puts the three members on the redaction list of keys', () => {
    expect(REDACTED_KEYS).toEqual(
      expect.arrayContaining(['x-amz-signature', 'x-amz-credential', 'x-amz-security-token']),
    );
  });
});
