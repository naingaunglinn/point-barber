// Settings kept per user on this device (design D10 · AD-LIST-06 · AD-NAV-04): column choices under
// `point.columns.<storageKey>.<userId>`, the branch under `point.branch.<userId>`. Storage can be
// missing or full (private mode, quota): reading then gives `undefined` and writing does nothing — the
// screen falls back to its defaults, which is all a lost preference costs.

export function readStored<T>(key: string, accept: (value: unknown) => value is T): T | undefined {
  try {
    const text = window.localStorage.getItem(key);
    if (text === null) return undefined;
    const value: unknown = JSON.parse(text);
    return accept(value) ? value : undefined;
  } catch {
    return undefined; // no storage, or a value written by an older version
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or private mode: the preference is not kept; the defaults apply next time.
  }
}

export const columnsKey = (storageKey: string, userId: string) =>
  `point.columns.${storageKey}.${userId}`;
export const branchKey = (userId: string) => `point.branch.${userId}`;
