import { z } from 'zod';

// A JSON body is read through a schema, never cast (CG-TS-02 · CG-TS-03). The same two functions as
// @point/shared/testing, which Playwright's loader cannot resolve from source.

/** A JSON object whose members are not described further. */
export const looseObject = z.record(z.string(), z.unknown());

/** `GET /api/v1/me`, as far as the specs read it: the server's clock. */
export const meClock = z.object({ system: z.object({ server_time: z.string() }) });

/** The value the schema parses `value` into; throws an Error that names every failing path. */
export function parseJson<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`The body does not match its schema — ${issues}`);
}

export const parseJsonText = <S extends z.ZodType>(schema: S, text: string): z.output<S> =>
  parseJson(schema, JSON.parse(text));

export async function readJson<S extends z.ZodType>(
  schema: S,
  response: { json(): Promise<unknown> },
): Promise<z.output<S>> {
  return parseJson(schema, await response.json());
}
