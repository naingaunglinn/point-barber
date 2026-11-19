import { describe, expect, it } from 'vitest';

import { clientIp } from './client-ip.js';

// add-foundation-auth-access task 2.7 — design D5: the client address is the one the trusted proxy
// (Caddy, TRUSTED_PROXY_HOPS = 1) added; an entry the client wrote itself cannot change it.
describe('clientIp', () => {
  const CADDY = '172.18.0.5';

  it('is the entry Caddy appended', () => {
    expect(clientIp(CADDY, '203.0.113.10', 1)).toBe('203.0.113.10');
  });

  it('a spoofed X-Forwarded-For entry before the proxy hop does not change it', () => {
    expect(clientIp(CADDY, '198.51.100.1, 203.0.113.10', 1)).toBe('203.0.113.10');
    expect(clientIp(CADDY, '1.1.1.1, 2.2.2.2, 203.0.113.10', 1)).toBe('203.0.113.10');
  });

  it('with no header, is the socket address', () => {
    expect(clientIp('203.0.113.10', undefined, 1)).toBe('203.0.113.10');
  });

  it('with no trusted hop, is the socket address whatever the header says', () => {
    expect(clientIp('203.0.113.10', '198.51.100.1', 0)).toBe('203.0.113.10');
  });

  it('with two trusted hops, skips both proxies', () => {
    expect(clientIp('10.0.0.1', '198.51.100.1, 203.0.113.10, 10.0.0.2', 2)).toBe('203.0.113.10');
  });

  it('drops the IPv4-mapped IPv6 prefix', () => {
    expect(clientIp('::ffff:203.0.113.10', undefined, 1)).toBe('203.0.113.10');
  });
});
