// db/source/ manifest helpers (design D4.1, D4.11).
// A file's hash is the SHA-256 of its text with CRLF normalised to LF, so a Windows checkout
// (core.autocrlf) and CI compute the same value.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function textHash(path) {
  const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function readManifest(sourceDir) {
  return JSON.parse(readFileSync(join(sourceDir, 'manifest.json'), 'utf8'));
}

/** Files of the baseline in README load order (generated DDL + nine constraint files). */
export function loadOrder(manifest) {
  return manifest.files
    .filter((f) => f.kind === 'ddl' || f.kind === 'constraints')
    .sort((a, b) => a.load_order - b.load_order);
}

/** Every db/source file matches its manifest hash, and every file is listed. Returns problems (empty = ok). */
export function checkManifest(sourceDir) {
  const manifest = readManifest(sourceDir);
  const problems = [];
  const listed = new Set(manifest.files.map((f) => f.name));
  for (const name of readdirSync(sourceDir).sort()) {
    if (name !== 'manifest.json' && !listed.has(name)) {
      problems.push(`${name}: in db/source but not in manifest.json`);
    }
  }
  for (const f of manifest.files) {
    const path = join(sourceDir, f.name);
    if (!existsSync(path)) problems.push(`${f.name}: missing from db/source`);
    else if (textHash(path) !== f.sha256)
      problems.push(`${f.name}: hash differs from manifest.json`);
  }
  return problems;
}

/** Each manifest file equals the same file in the sibling point-sdd docs/db. */
export function checkSibling(sourceDir, siblingDir) {
  const manifest = readManifest(sourceDir);
  const problems = [];
  for (const f of manifest.files) {
    const path = join(siblingDir, f.name);
    if (!existsSync(path))
      problems.push(`${f.name}: not in ${siblingDir} (renamed or new version?)`);
    else if (textHash(path) !== f.sha256) problems.push(`${f.name}: differs from ${siblingDir}`);
  }
  return problems;
}
