import { describe, expect, it } from 'vitest';

import { parseRawResponse } from './raw-request.js';

// Unit tests of the raw-request helper's parser (task 8.1). The helper itself talks to the stack and
// is exercised by edge.spec.ts.
describe('parseRawResponse', () => {
  it('reads the status, lower-cased headers and a Content-Length body', () => {
    const res = parseRawResponse(
      'HTTP/1.1 404 Not Found\r\nContent-Type: application/problem+json\r\nX-Request-Id: abc\r\nContent-Length: 2\r\n\r\n{}',
    );
    expect(res).toStrictEqual({
      status: 404,
      headers: {
        'content-type': 'application/problem+json',
        'x-request-id': 'abc',
        'content-length': '2',
      },
      body: '{}',
    });
  });

  it('reads an empty edge 404', () => {
    const res = parseRawResponse(
      'HTTP/1.1 404 Not Found\r\nServer: Caddy\r\nContent-Length: 0\r\n\r\n',
    );
    expect(res.status).toBe(404);
    expect(res.body).toBe('');
    expect(res.headers).not.toHaveProperty('x-request-id');
  });

  it('decodes a chunked body', () => {
    const res = parseRawResponse(
      'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n',
    );
    expect(res.body).toBe('hello world');
  });

  it('keeps repeated headers, joined as one value', () => {
    const res = parseRawResponse('HTTP/1.1 200 OK\r\nSet-Cookie: a=1\r\nSet-Cookie: b=2\r\n\r\n');
    expect(res.headers['set-cookie']).toBe('a=1, b=2');
  });

  it('refuses something that is not an HTTP response', () => {
    expect(() => parseRawResponse('garbage')).toThrow(/not an HTTP response/);
  });
});
