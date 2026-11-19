// The session's device label (API-AUD-02 · design D6): the body's `device_label` when sent, else
// `<platform> · <browser>` from the User-Agent (e.g. `Android · Chrome`); a shell's `X-Client` is
// kept in the label so the devices list tells the app from the browser.

const PLATFORMS: readonly [RegExp, string][] = [
  [/Android/i, 'Android'],
  [/iPhone|iPad|iPod/i, 'iOS'],
  [/Windows/i, 'Windows'],
  [/Mac OS X|Macintosh/i, 'macOS'],
  [/CrOS/i, 'ChromeOS'],
  [/Linux/i, 'Linux'],
];

// Order matters: Edge and Opera also say Chrome; Chrome also says Safari.
const BROWSERS: readonly [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SHELLS = new Set(['android-shell', 'windows-shell']);

const find = (table: readonly [RegExp, string][], text: string): string | undefined =>
  table.find(([pattern]) => pattern.test(text))?.[1];

export function deviceLabel(
  sent: string | undefined,
  userAgent: string | undefined,
  client: string | undefined,
): string | null {
  const trimmed = sent?.trim();
  if (trimmed !== undefined && trimmed !== '') return trimmed;
  const ua = userAgent ?? '';
  const parts = [find(PLATFORMS, ua), find(BROWSERS, ua)].filter(
    (part): part is string => part !== undefined,
  );
  if (client !== undefined && SHELLS.has(client)) parts.push(client);
  return parts.length === 0 ? null : parts.join(' · ').slice(0, 255);
}
