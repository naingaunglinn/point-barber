import { settingEntrySchema } from './entry.js';
import { valueSchema } from './values.js';

// The checks of definitions/settings.json (D-PLT-16 · P1-RULE-08 · add-settings-store design D2):
// every entry has the entry shape (the key pattern of the DB CHECK, a known scope and type, the text
// keys of its own key), no key is declared twice, and every default passes its own value schema.
// One message per finding, each naming the key (or the position when there is no key).

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

const keyOf = (value: unknown, index: number): string => {
  const key = isRecord(value) ? value.key : undefined;
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
      problems.push(`${entry.key}: ${error instanceof Error ? error.message : String(error)}`);
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

/** A language file's tree: `{ booking: { slot_interval_minutes: { label: '…' } } }`. */
export type MessageTree = { readonly [key: string]: string | MessageTree };

const textAt = (tree: MessageTree, dotted: string): unknown =>
  dotted
    .split('.')
    .reduce<unknown>((node, part) => (isRecord(node) ? node[part] : undefined), tree);

/** An entry as the text check reads it — a settings.json entry or its typed copy. */
export interface TextKeyEntry {
  readonly key: string;
  readonly module: string;
  readonly type: string;
  readonly label_key: string;
  readonly help_key: string | null;
  readonly impact_key: string | null;
  readonly validation: {
    readonly unit?: string;
    readonly choices?: readonly number[];
    readonly [member: string]: unknown;
  };
}

/**
 * The text keys of the entries that a language's `settings` namespace lacks (design D2 / D11): the
 * label, help and impact keys, the group of each module, the unit of each entry and the label of each
 * choice. One message per missing key, prefixed with the language; empty when every key has a text.
 */
export function settingTextProblems(
  entries: readonly TextKeyEntry[],
  messages: Readonly<Record<string, MessageTree>>,
): string[] {
  const problems: string[] = [];
  for (const [language, settings] of Object.entries(messages)) {
    const need = (dotted: string, owner: string) => {
      const text = textAt(settings, dotted.replace(/^settings\./, ''));
      if (typeof text !== 'string' || text.trim() === '') {
        problems.push(`${language}: ${owner}: no text for ${dotted}`);
      }
    };
    for (const entry of entries) {
      need(entry.label_key, entry.key);
      if (entry.help_key !== null) need(entry.help_key, entry.key);
      if (entry.impact_key !== null) need(entry.impact_key, entry.key);
      need(`settings.group.${entry.module}`, entry.key);
      if (entry.validation.unit !== undefined)
        need(`settings.unit.${entry.validation.unit}`, entry.key);
      for (const choice of entry.validation.choices ?? []) {
        need(`settings.choice.${entry.key}.${String(choice)}`, entry.key);
      }
    }
  }
  return problems;
}
