// The paths of an access declaration (design D11): where AccessGuard finds the target branch, and
// what an `orSelf` path compares with the caller. Pure functions over the parts of the request.

/** The parts of the request a path may read. The guard runs before the pipes: the body is raw. */
export interface RequestParts {
  readonly body: unknown;
  readonly query: unknown;
  readonly params: unknown;
}

export type PathSource = 'body' | 'query' | 'params';

export type BranchPath =
  /** `body.branch_id`, `query.branch_id?`, `params.branch_id`. */
  | {
      readonly kind: 'field';
      readonly source: PathSource;
      readonly field: string;
      readonly optional: boolean;
    }
  /** `body.items[].branch_id` — every element of the list. */
  | {
      readonly kind: 'list';
      readonly source: PathSource;
      readonly list: string;
      readonly field: string;
      readonly optional: boolean;
    }
  /** `params.id→entity.branch_id` — the branches of the entity the route's loader returns. */
  | {
      readonly kind: 'entity';
      readonly param: string;
      readonly field: string;
      readonly optional: boolean;
    };

const SOURCES: readonly string[] = ['body', 'query', 'params'];
const NAME = '[A-Za-z_][A-Za-z0-9_]*';
const FIELD = new RegExp(`^(${SOURCES.join('|')})\\.(${NAME})$`);
const LIST = new RegExp(`^(${SOURCES.join('|')})\\.(${NAME})\\[\\]\\.(${NAME})$`);
const ENTITY = new RegExp(`^params\\.(${NAME})(?:→|->)entity\\.(${NAME})$`);

/** Parses a branch path; throws on a malformed one, which is a programming error of the route. */
export function parseBranchPath(path: string): BranchPath {
  const optional = path.endsWith('?');
  const body = optional ? path.slice(0, -1) : path;
  const field = FIELD.exec(body);
  if (field !== null) {
    return { kind: 'field', source: field[1] as PathSource, field: field[2] ?? '', optional };
  }
  const list = LIST.exec(body);
  if (list !== null) {
    return {
      kind: 'list',
      source: list[1] as PathSource,
      list: list[2] ?? '',
      field: list[3] ?? '',
      optional,
    };
  }
  const entity = ENTITY.exec(body);
  if (entity !== null) {
    return { kind: 'entity', param: entity[1] ?? '', field: entity[2] ?? '', optional };
  }
  throw new Error(`malformed access path ${path}`);
}

const member = (value: unknown, key: string): unknown =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;

const isBlank = (value: unknown): boolean => value === undefined || value === null || value === '';

/**
 * The branch ids a request path names: `empty` when an optional path has no value; otherwise the
 * ids, where a value that is missing or not a string is left out and makes the list incomplete — an
 * incomplete list covers nothing, so only company scope passes it on to the validation pipe.
 */
export function branchIdsAt(
  path: Exclude<BranchPath, { kind: 'entity' }>,
  parts: RequestParts,
): { readonly empty: true } | { readonly empty: false; readonly ids: readonly string[] } {
  const root = parts[path.source];
  if (path.kind === 'field') {
    const value = member(root, path.field);
    if (isBlank(value)) return path.optional ? { empty: true } : { empty: false, ids: [] };
    return { empty: false, ids: typeof value === 'string' ? [value] : [] };
  }
  const list = member(root, path.list);
  if (isBlank(list) && path.optional) return { empty: true };
  if (!Array.isArray(list)) return { empty: false, ids: [] };
  const values = list.map((item) => member(item, path.field));
  if (!values.every((value): value is string => typeof value === 'string' && value !== '')) {
    return { empty: false, ids: [] };
  }
  return { empty: false, ids: values };
}

/** The value an `orSelf` path names in the request, or undefined when it is not a request path. */
export function requestValueAt(
  path: string,
  parts: RequestParts,
): { found: boolean; value?: unknown } {
  const field = FIELD.exec(path);
  if (field === null) return { found: false };
  return { found: true, value: member(parts[field[1] as PathSource], field[2] ?? '') };
}

/** `entity.<field>` or `employee.<field>` — read from the loaded target. */
export function targetFieldAt(path: string): string | undefined {
  const match = new RegExp(`^(?:entity|employee)\\.(${NAME})$`).exec(path);
  return match?.[1];
}

/** A route parameter, as a string. */
export function paramAt(parts: RequestParts, name: string): string | undefined {
  const value = member(parts.params, name);
  return typeof value === 'string' ? value : undefined;
}
