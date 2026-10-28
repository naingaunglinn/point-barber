import { describe, expect, it } from 'vitest';

import { REDACTED, redactText, scrubEvent, withoutQuery } from './scrub.js';

// add-staging-deploy task 3.4 — the API `beforeSend` (design D9 · CG-OBS-03): spec "No secret or
// personal data reaches Sentry".

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

  it('keeps a short number (an id, a status) readable', () => {
    expect(redactText('status 500 at step 1234567')).toBe('status 500 at step 1234567');
    expect(withoutQuery('/a#b')).toBe('/a');
  });
});
