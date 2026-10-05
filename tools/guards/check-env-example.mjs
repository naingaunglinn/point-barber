// .env.example = the compose files = the Caddyfiles = the environment schemas (CG-SEC-05 · design
// D13 · D19). Fails when
// - a ${VAR} of a docker-compose*.yml or a {$VAR} of infra/caddy/Caddyfile or infra/caddy/dev/*.caddy
//   is not in .env.example;
// - a key of the API's environment schema or of apps/web/env.ts is not in .env.example;
// - a key of .env.example is used by none of them and is not under a `# reserved:` line, which must
//   name the change that will read it (the block runs to the next blank line);
// - an entry of .env.example has no comment line right above it.
// `$${VAR}` and `$$VAR` in a compose file are escapes for the container's shell, not variables.
// Checks the repository it lives in; `--root=<dir>` checks another tree (tests).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCHEMAS = ['apps/api/src/common/config/env.schema.ts', 'apps/web/env.ts'];
const CHANGE_ID = /\b(?:add|change|remove|fix)-[a-z0-9-]+/;

// ${VAR}, ${VAR:-default} … and the unbraced $VAR, which Compose interpolates too.
const COMPOSE_VAR =
  /(?<!\$)\$(?:\{([A-Za-z_][A-Za-z0-9_]*)(?:[:?+-][^}]*)?\}|([A-Za-z_][A-Za-z0-9_]*))/g;
const CADDY_VAR = /\{\$([A-Za-z_][A-Za-z0-9_]*)(?::[^}]*)?\}/g;
// A key of a z.object({ … }) literal: an indented `NAME:` line.
const SCHEMA_KEY = /^\s+([A-Z][A-Z0-9_]*)\s*:/gm;

const names = (text, pattern) => [...text.matchAll(pattern)].map((m) => m[1] ?? m[2]);

/** The files that use variables, as { path, names }; paths are repository-relative. */
function users(root) {
  const read = (path) => readFileSync(join(root, path), 'utf8');
  const found = [];
  for (const file of readdirSync(root)
    .filter((f) => /^docker-compose.*\.ya?ml$/.test(f))
    .sort()) {
    found.push({ path: file, names: names(read(file), COMPOSE_VAR) });
  }
  const caddy = ['infra/caddy/Caddyfile'];
  if (existsSync(join(root, 'infra/caddy/dev'))) {
    for (const f of readdirSync(join(root, 'infra/caddy/dev')).sort()) {
      if (f.endsWith('.caddy')) caddy.push(`infra/caddy/dev/${f}`);
    }
  }
  for (const path of caddy.filter((p) => existsSync(join(root, p)))) {
    found.push({ path, names: names(read(path), CADDY_VAR) });
  }
  for (const path of SCHEMAS.filter((p) => existsSync(join(root, p)))) {
    found.push({ path, names: names(read(path), SCHEMA_KEY) });
  }
  return found;
}

/** The entries of .env.example: { key, line, reserved, commented }, plus problems of the file itself. */
export function parseEnvExample(text) {
  const entries = [];
  const problems = [];
  let reserved = false;
  let previous = '';
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (line === '') {
      reserved = false;
    } else if (line.startsWith('#')) {
      if (/^#\s*reserved:/i.test(line)) {
        reserved = true;
        if (!CHANGE_ID.test(line)) {
          problems.push(
            `.env.example:${index + 1}: a # reserved: line must name the change that will read the block (CG-SEC-05)`,
          );
        }
      }
    } else {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
      if (match) {
        entries.push({
          key: match[1],
          line: index + 1,
          reserved,
          commented: previous.startsWith('#'),
        });
      }
    }
    previous = line;
  });
  return { entries, problems };
}

/** Returns the list of problems; empty when the lists agree. */
export function checkEnvExample(root) {
  const { entries, problems } = parseEnvExample(readFileSync(join(root, '.env.example'), 'utf8'));
  const declared = new Set(entries.map((e) => e.key));
  const used = new Set();

  for (const { path, names: list } of users(root)) {
    for (const name of new Set(list)) {
      used.add(name);
      if (!declared.has(name)) {
        problems.push(`${name}: used by ${path} but missing from .env.example (CG-SEC-05)`);
      }
    }
  }
  for (const entry of entries) {
    if (!entry.commented) {
      problems.push(`.env.example:${entry.line}: ${entry.key} has no comment line above it (D13)`);
    }
    if (!used.has(entry.key) && !entry.reserved) {
      problems.push(
        `.env.example:${entry.line}: ${entry.key} is used by no compose file, Caddyfile or environment schema — remove it or put it under a # reserved: line naming its change (CG-SEC-05)`,
      );
    }
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = process.argv.find((a) => a.startsWith('--root='));
  const root = arg
    ? resolve(arg.slice('--root='.length))
    : resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const problems = checkEnvExample(root);
  for (const p of problems) console.error(`check-env-example: ${p}`);
  if (problems.length === 0) {
    console.log(
      'check-env-example: ok — .env.example matches the compose files, Caddyfiles and schemas',
    );
  }
  process.exit(problems.length === 0 ? 0 : 1);
}
