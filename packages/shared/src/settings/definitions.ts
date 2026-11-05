import { settingEntrySchema } from './entry.js';
import { valueSchema } from './values.js';

// The checks of definitions/settings.json (D-PLT-16 · P1-RULE-08 · add-settings-store design D2):
// every entry has the entry shape (the key pattern of the DB CHECK, a known scope and type, the text
// keys of its own key), no key is declared twice, and every default passes its own value schema.
// One message per finding, each naming the key (or the position when there is no key).

const keyOf = (value: unknown, index: number): string => {
  const key =
    value !== null && typeof value === 'object'
      ? (value as Record<string, unknown>).key
      : undefined;
  return typeof key === 'string' ? key : `entry ${index}`;
};

/** The problems of a settings.json content; empty when the file is valid. */
export function settingDefinitionProblems(json: unknown): string[] {
  if (!Array.isArray(json)) return ['settings.json: not an array of entries'];
  const problems: string[] = [];
  const seen = new Set<string>();
  json.forEach((value: unknown, index) => {
    const name = keyOf(value, index);
    const parsed = settingEntrySchema.safeParse(value);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const at = issue.path.length === 0 ? '' : ` at ${issue.path.join('.')}`;
        problems.push(`${name}: ${issue.message}${at}`);
      }
      return;
    }
    const entry = parsed.data;
    if (seen.has(entry.key)) problems.push(`${entry.key}: declared twice`);
    seen.add(entry.key);
    let defaultPasses: boolean;
    try {
      defaultPasses = valueSchema(entry).safeParse(entry.default).success;
    } catch (error) {
      problems.push(`${entry.key}: ${(error as Error).message}`);
      return;
    }
    if (!defaultPasses) {
      problems.push(
        `${entry.key}: the default ${JSON.stringify(entry.default)} fails its validation`,
      );
    }
  });
  return problems;
}
