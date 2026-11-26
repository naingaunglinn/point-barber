import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { BYTES_PER_MB } from '@point/shared';
import type { Request, Response } from 'express';
import { afterEach, describe, expect, it } from 'vitest';

import { ProblemException } from '../../../common/http/problem.exception.js';
import { BufferedFile, readUpload } from './multipart.js';

// add-attachments-upload task 3.6 — design D3 · API-SHAPE-05 · API-LIM-03 · CG-SEC-08: the multipart reader
// stops at the limit before the body is buffered, keeps the file name as received, reads the first `file`
// part and drops every other part without an error.

let server: Server | undefined;
afterEach(() => {
  server?.close();
  server = undefined;
});

interface Answer {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

/** A server that runs `readUpload` for a limit of `maxMb`; `storage` shows what was held in memory. */
async function post(form: FormData, maxMb: number, storage = new BufferedFile()): Promise<Answer> {
  server = createServer((req, res) => {
    readUpload(req as Request, res as unknown as Response, maxMb, storage).then(
      (form) =>
        res.end(
          JSON.stringify({
            name: form.file?.name,
            size: form.file?.bytes.length,
            purpose: form.purpose,
          }),
        ),
      (error: unknown) => {
        const problem = error as ProblemException;
        res.statusCode = problem.status;
        res.end(JSON.stringify({ code: problem.code, context: problem.options.context }));
      },
    );
  });
  await new Promise<void>((done) => server?.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/`, { method: 'POST', body: form });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const file = (size: number, name = 'a.jpg'): FormData => {
  const form = new FormData();
  form.append('purpose', 'image');
  form.append('file', new Blob([Buffer.alloc(size, 1)]), name);
  return form;
};

describe('readUpload', () => {
  it('reads the file and the purpose; the name is kept as received — a path, and Myanmar text', async () => {
    for (const name of ['..\\..\\evil.png', 'ဘောင်ချာ ၁.png']) {
      const answer = await post(file(10, name), 10);
      expect(answer.body).toStrictEqual({ name, size: 10, purpose: 'image' });
    }
  });

  it('Scenario: a file of exactly the limit is read completely, one byte more is file_too_large', async () => {
    const limit = BYTES_PER_MB;
    expect((await post(file(limit), 1)).body).toMatchObject({ size: limit });
    const over = await post(file(limit + 1), 1);
    expect([over.status, over.body]).toStrictEqual([
      422,
      { code: 'file_too_large', context: { max_mb: 1 } },
    ]);
  });

  it('the stop comes before the body is buffered: a 5 MB file under a 1 MB limit holds at most one byte past it', async () => {
    const storage = new BufferedFile();
    const answer = await post(file(5 * BYTES_PER_MB), 1, storage);
    expect(answer.status).toBe(422);
    expect(storage.buffered).toBeLessThanOrEqual(BYTES_PER_MB + 1);
  });

  it('a second file part and other text parts are dropped, and no parser error reaches the client', async () => {
    const form = file(10, 'first.jpg');
    form.append('file', new Blob([Buffer.alloc(20, 2)]), 'second.jpg');
    form.append('note', 'ignored');
    form.append('other', new Blob([Buffer.alloc(30, 3)]), 'other.jpg');
    const answer = await post(form, 10);
    expect([answer.status, answer.body]).toStrictEqual([
      200,
      { name: 'first.jpg', size: 10, purpose: 'image' },
    ]);
  });

  it('a request with no file part gives no file, and the purpose as sent', async () => {
    const form = new FormData();
    form.append('purpose', 'video');
    expect((await post(form, 10)).body).toStrictEqual({ purpose: 'video' });
  });

  it('too many parts, or a long text part, is a body that cannot be read — 400, nothing held', async () => {
    const many = file(10);
    for (let i = 0; i < 12; i += 1) many.append(`note${i}`, 'x');
    expect((await post(many, 10)).status).toBe(400);
    const long = file(10);
    long.append('purpose', 'x'.repeat(2_000));
    expect((await post(long, 10)).status).toBe(400);
  });
});
