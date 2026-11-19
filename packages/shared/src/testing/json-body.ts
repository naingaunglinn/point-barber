import type { z } from 'zod';

// Test support (CG-TS-02 · CG-TEST-03): a JSON body is read through its schema, never cast. The body
// preview is short because a failing test prints it.
const PREVIEW_LENGTH = 200;

/** The first characters of the body as JSON; a bigint or a circular body is not JSON. */
function preview(body: unknown): string {
  try {
    return String(JSON.stringify(body)).slice(0, PREVIEW_LENGTH);
  } catch {
    return '(not JSON)';
  }
}

/** The value `schema` parses `body` into; throws an Error that names every failing path. */
export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues
    .map((issue) => {
      const where = issue.path.map(String).join('.');
      return `${where === '' ? '(body)' : where}: ${issue.message}`;
    })
    .join('; ');
  throw new Error(`The body does not match its schema — ${issues}. Body: ${preview(body)}`);
}

/** `response.json()` read as `unknown` and parsed by `schema`. */
export async function readJsonBody<S extends z.ZodType>(
  schema: S,
  response: { json(): Promise<unknown> },
): Promise<z.output<S>> {
  return parseBody(schema, await response.json());
}
