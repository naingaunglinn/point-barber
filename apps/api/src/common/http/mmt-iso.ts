// The one serializer for times the API returns (API-DATA-03 · D-PLT-15 · design D9): ISO 8601,
// second precision, fixed offset +06:30 — Myanmar has no daylight saving time.
const MMT_OFFSET_MS = (6 * 60 + 30) * 60 * 1000;

const two = (n: number): string => String(n).padStart(2, '0');

export function toMmtIso(instant: Date): string {
  const local = new Date(instant.getTime() + MMT_OFFSET_MS);
  return (
    `${local.getUTCFullYear()}-${two(local.getUTCMonth() + 1)}-${two(local.getUTCDate())}` +
    `T${two(local.getUTCHours())}:${two(local.getUTCMinutes())}:${two(local.getUTCSeconds())}+06:30`
  );
}
