import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { checkManifest, checkSibling, loadOrder, textHash } from '../lib/source.mjs';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'db-source-'));
  writeFileSync(join(dir, 'a.sql'), 'CREATE TABLE a (id int);\n');
  writeFileSync(join(dir, 'b-test.sql'), 'SELECT 1;\n');
  const manifest = {
    files: [
      { name: 'a.sql', kind: 'ddl', load_order: 1, sha256: textHash(join(dir, 'a.sql')) },
      { name: 'b-test.sql', kind: 'test', sha256: textHash(join(dir, 'b-test.sql')) },
    ],
  };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  return dir;
}

describe('db/source manifest (D4.1 · D4.11)', () => {
  it('passes when every file matches its hash', () => {
    expect(checkManifest(fixture())).toEqual([]);
  });

  it('fails when a file was edited in point-barber', () => {
    const dir = fixture();
    writeFileSync(join(dir, 'a.sql'), 'CREATE TABLE a (id bigint);\n');
    expect(checkManifest(dir)).toEqual(['a.sql: hash differs from manifest.json']);
  });

  it('fails when a file is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'db-source-'));
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({ files: [{ name: 'x.sql', sha256: '0' }] }),
    );
    expect(checkManifest(dir)).toEqual(['x.sql: missing from db/source']);
  });

  // Review #3 — D4.11: every file in db/source/ is covered by the manifest.
  it('fails on a file the manifest does not list', () => {
    const dir = fixture();
    writeFileSync(join(dir, 'part9-test.sql'), 'SELECT 1;\n');
    expect(checkManifest(dir)).toEqual(['part9-test.sql: in db/source but not in manifest.json']);
  });

  it('treats CRLF and LF as the same text', () => {
    const dir = mkdtempSync(join(tmpdir(), 'db-source-'));
    writeFileSync(join(dir, 'lf.sql'), 'a\nb\n');
    writeFileSync(join(dir, 'crlf.sql'), 'a\r\nb\r\n');
    expect(textHash(join(dir, 'crlf.sql'))).toBe(textHash(join(dir, 'lf.sql')));
  });

  it('compares with the sibling point-sdd folder', () => {
    const dir = fixture();
    const sibling = mkdtempSync(join(tmpdir(), 'sdd-db-'));
    writeFileSync(join(sibling, 'a.sql'), 'CREATE TABLE a (id int);\n');
    expect(checkSibling(dir, sibling)).toEqual([
      'b-test.sql: not in ' + sibling + ' (renamed or new version?)',
    ]);
    mkdirSync(join(sibling, 'x'), { recursive: true });
    writeFileSync(join(sibling, 'b-test.sql'), 'SELECT 2;\n');
    expect(checkSibling(dir, sibling)).toEqual([`b-test.sql: differs from ${sibling}`]);
  });

  it('returns the baseline files in load order', () => {
    const order = loadOrder({
      files: [
        { name: 'c', kind: 'constraints', load_order: 3 },
        { name: 't', kind: 'test' },
        { name: 'd', kind: 'ddl', load_order: 1 },
        { name: 'b', kind: 'constraints', load_order: 2 },
      ],
    });
    expect(order.map((f) => f.name)).toEqual(['d', 'b', 'c']);
  });
});
