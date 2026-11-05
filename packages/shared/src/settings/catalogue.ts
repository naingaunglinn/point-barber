import { SETTING_ENTRIES } from './settings.generated.js';
import { type MaintenanceSetting, type TextMmEn, valueSchema } from './values.js';

// The setting catalogue (D-PLT-16 "typo = build error" · add-settings-store design D2). API and web
// code name a key only through SettingKey, so a key that is not in definitions/settings.json fails
// `pnpm typecheck`.

type Entry = (typeof SETTING_ENTRIES)[number];

export type SettingKey = Entry['key'];

type EntryOf<K extends SettingKey> = Extract<Entry, { readonly key: K }>;

type ValueOf<E> = E extends { readonly type: 'number' }
  ? number
  : E extends {
        readonly type: 'choice';
        readonly validation: { readonly choices: readonly (infer C)[] };
      }
    ? C
    : E extends { readonly type: 'boolean' }
      ? boolean
      : E extends { readonly type: 'text_mm_en' }
        ? TextMmEn | null
        : E extends { readonly key: 'system.maintenance' }
          ? MaintenanceSetting
          : never;

/** number / choice → the number (a choice: one of its choices), boolean, `{ mm, en } | null`, the maintenance value. */
export type SettingValue<K extends SettingKey> = ValueOf<EntryOf<K>>;

/** The keys whose effective values any signed-in staff member reads (P1.SET.02 · `/me.settings`). */
export type ClientReadableSettingKey = Extract<Entry, { readonly client_readable: true }>['key'];

/** The values of a set of keys, keyed by key. */
export type SettingValues<K extends SettingKey> = { readonly [P in K]: SettingValue<P> };

/** Every entry, in file order (AD-SET-01 group order, by key inside a module). */
export const SETTINGS: readonly Entry[] = SETTING_ENTRIES;

/** Every key, in file order. */
export const SETTING_KEYS: readonly SettingKey[] = SETTINGS.map((entry) => entry.key);

const BY_KEY: ReadonlyMap<string, Entry> = new Map(SETTINGS.map((entry) => [entry.key, entry]));

/** The key is defined in settings.json. */
export function isSettingKey(key: string): key is SettingKey {
  return BY_KEY.has(key);
}

/** True when `value` passes the value schema of the entry (a default always does: definitions.test.ts). */
const isValueOf = <K extends SettingKey>(
  value: unknown,
  entry: EntryOf<K>,
): value is SettingValue<K> => valueSchema(entry).safeParse(value).success;

const isEntryOf = <K extends SettingKey>(entry: Entry, key: K): entry is EntryOf<K> =>
  entry.key === key;

/** The entry of a key. */
export function settingEntry<K extends SettingKey>(key: K): EntryOf<K> {
  const entry = BY_KEY.get(key);
  if (entry === undefined || !isEntryOf(entry, key)) throw new Error(`unknown setting ${key}`);
  return entry;
}

/** The default of a key — its effective value while no row exists (P1-RULE-08); a copy. */
export function settingDefault<K extends SettingKey>(key: K): SettingValue<K> {
  const entry = settingEntry(key);
  // The defaults are plain JSON (settings.json), so a JSON round trip is a full copy.
  const copy: unknown = JSON.parse(JSON.stringify(entry.default));
  if (!isValueOf<K>(copy, entry)) throw new Error(`the default of ${key} fails its own schema`);
  return copy;
}
