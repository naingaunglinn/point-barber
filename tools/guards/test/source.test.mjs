import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { lineOf, report, rootFromArgs, stripComments, walk } from '../lib/source.mjs';

// Technical guarantee, no spec scenario: design D2 · §24 preamble · CG-TEST-04.
describe('tools/guards/lib/source.mjs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('stripComments', () => {
    it('blanks both comment forms and keeps the length and the line breaks', () => {
      const text = 'a(); // b\nc(/* d\ne */ f);\n';
      const out = stripComments(text);
      expect(out).toBe('a();     \nc(    \n     f);\n');
      expect(out).toHaveLength(text.length);
    });

    it('keeps a // inside a string and inside a template', () => {
      const text = 'const a = "http://point.test"; const b = `x // ${c} y`; // gone\n';
      expect(stripComments(text)).toBe(
        'const a = "http://point.test"; const b = `x // ${c} y`;        \n',
      );
    });

    it('blanks a block comment inside ${…} and reads the code there', () => {
      expect(stripComments('`a ${b /* c */ + d} e` // f')).toBe(
        `\`a \${b${' '.repeat(9)}+ d} e\`${' '.repeat(5)}`,
      );
    });

    it('keeps an escaped quote inside a string and a quote inside a regular expression', () => {
      expect(stripComments('s = "a\\" // b"; // c')).toBe('s = "a\\" // b";     ');
      expect(stripComments("r = /'x/; // c")).toBe("r = /'x/;     ");
    });

    it('keeps the line of a hit after a comment', () => {
      const out = stripComments('/* one\ntwo */\nhit');
      expect(lineOf(out, out.indexOf('hit'))).toBe(3);
    });
  });

  describe('lineOf', () => {
    it('counts lines from 1', () => {
      const text = 'a\nb\n\nc';
      expect([0, 2, 4, 5].map((index) => lineOf(text, index))).toStrictEqual([1, 2, 3, 4]);
    });
  });

  describe('report', () => {
    it('prints one line per hit to standard error and returns 1', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      const status = report(
        'check-x',
        [
          { path: 'a/b.ts', line: 7, message: 'bad', cg: 'CG-TEST-04' },
          { path: 'c/d.ts', message: 'worse', cg: 'CG-AI-06' },
        ],
        'fine',
      );
      expect(status).toBe(1);
      expect(error.mock.calls).toStrictEqual([
        ['check-x: a/b.ts:7 — bad (CG-TEST-04)'],
        ['check-x: c/d.ts — worse (CG-AI-06)'],
      ]);
      expect(log).not.toHaveBeenCalled();
    });

    it('prints the ok line to standard output and returns 0 when there is no hit', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      expect(report('check-x', [], 'nothing found')).toBe(0);
      expect(log.mock.calls).toStrictEqual([['check-x: ok — nothing found']]);
      expect(error).not.toHaveBeenCalled();
    });
  });

  describe('walk', () => {
    const roots = [];
    afterEach(() => {
      for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
    });

    it('lists scoped files with the extensions, sorted, and skips the folders of the library', () => {
      const root = mkdtempSync(join(tmpdir(), 'source-walk-'));
      roots.push(root);
      for (const path of [
        'apps/b.ts',
        'apps/a.tsx',
        'apps/c.md',
        'apps/node_modules/x.ts',
        'apps/generated/x.ts',
        'apps/fixtures/x.ts',
        'tools/guards/test/x.ts',
        'other/x.ts',
      ]) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), '');
      }
      const options = { scopes: ['apps', 'tools', 'missing'], extensions: ['.ts', '.tsx'] };
      expect(walk(root, options)).toStrictEqual(['apps/a.tsx', 'apps/b.ts']);
      expect(walk(root, { ...options, fixtures: true })).toContain('apps/fixtures/x.ts');
    });
  });
});

describe('rootFromArgs', () => {
  const argv = process.argv;
  afterEach(() => {
    process.argv = argv;
  });

  it('is the repository root, two folders above the guard file, without --root', () => {
    process.argv = ['node', 'guard.mjs'];
    const guard = pathToFileURL(join(resolve('/repo'), 'tools', 'guards', 'check-x.mjs')).href;
    expect(rootFromArgs(guard)).toBe(resolve('/repo'));
  });

  it('is the --root folder when it is given', () => {
    process.argv = ['node', 'guard.mjs', '--root=some/tree'];
    expect(rootFromArgs('file:///repo/tools/guards/check-x.mjs')).toBe(resolve('some/tree'));
  });
});
