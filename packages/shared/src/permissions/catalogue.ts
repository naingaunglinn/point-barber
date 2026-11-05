import { createCan } from './can.js';
import { PERMISSION_ENTRIES } from './permissions.generated.js';
import type { PermissionEntry, PermissionLevel } from './schema.js';

// The permission catalogue (D-ROLE-08 · ADR-011 · ADR-012 · design D10). API and web code name a
// code only through PermissionCode, so a code that is not in definitions/permissions.json fails
// `pnpm typecheck`.

export type PermissionCode = (typeof PERMISSION_ENTRIES)[number]['code'];

export const PERMISSIONS: readonly (PermissionEntry & { readonly code: PermissionCode })[] =
  PERMISSION_ENTRIES;

const LEVELS: ReadonlyMap<PermissionCode, PermissionLevel> = new Map(
  PERMISSIONS.map((entry) => [entry.code, entry.level]),
);

/** The data level of a code: how far a grant of it reaches (ADR-012 · API-PERM-07). */
export function permissionLevel(code: PermissionCode): PermissionLevel {
  const level = LEVELS.get(code);
  if (level === undefined) throw new Error(`unknown permission code ${code}`);
  return level;
}

type Entry = (typeof PERMISSION_ENTRIES)[number];

/**
 * The catalogue in the shape createCan / createGrants take: `{ [code]: { level } }`, codes kept as
 * literals (the web app binds its GrantsProvider with it).
 */
type LevelByCode = { readonly [E in Entry as E['code']]: { readonly level: E['level'] } };

/** True when `map` holds exactly the level of every code of the catalogue. */
function isLevelByCode(
  map: Readonly<Record<string, { readonly level: PermissionLevel }>>,
): map is LevelByCode {
  return PERMISSIONS.every((entry) => map[entry.code]?.level === entry.level);
}

const levelByCode = Object.fromEntries(
  PERMISSIONS.map((entry) => [entry.code, { level: entry.level }]),
);
if (!isLevelByCode(levelByCode)) throw new Error('LEVEL_BY_CODE does not match the catalogue');
export const LEVEL_BY_CODE = levelByCode;

/**
 * `can(me)(code, options)` — the UI mirror of the API's access decision (add-shared-ui-components
 * design D7). A code that is not in permissions.json does not compile; the API decides again.
 */
export const can = createCan(LEVEL_BY_CODE);
