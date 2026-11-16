import { z } from 'zod';

// A JSON body is read through a schema, never cast (CG-TS-02 · CG-TS-03). A copy of
// @point/shared/testing (add-ci-lint-rules D10), which Playwright's loader cannot resolve from source.

const PREVIEW_LENGTH = 200;

/** The first characters of the body as JSON; a bigint or a circular body is not JSON. */
function preview(body: unknown): string {
  try {
    return String(JSON.stringify(body)).slice(0, PREVIEW_LENGTH);
  } catch {
    return '(not JSON)';
  }
}

/** A JSON object whose members are not described further. */
export const looseObject = z.record(z.string(), z.unknown());

/** `GET /api/v1/me`, as far as the specs read it: the server's clock. */
export const meClock = z.object({ system: z.object({ server_time: z.string() }) });

/** The value the schema parses `value` into; throws an Error that names every failing path. */
export function parseJson<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues
    .map((issue) => {
      const where = issue.path.map(String).join('.');
      return `${where === '' ? '(body)' : where}: ${issue.message}`;
    })
    .join('; ');
  throw new Error(`The body does not match its schema — ${issues}. Body: ${preview(value)}`);
}

export const parseJsonText = <S extends z.ZodType>(schema: S, text: string): z.output<S> =>
  parseJson(schema, JSON.parse(text));

export async function readJson<S extends z.ZodType>(
  schema: S,
  response: { json(): Promise<unknown> },
): Promise<z.output<S>> {
  return parseJson(schema, await response.json());
}
