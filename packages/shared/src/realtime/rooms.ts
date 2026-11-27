// The realtime rooms of API-RT-01 (add-realtime-gateway design D2): `user:<user_id>`, `branch:<branch_id>`
// and `company`. Added here by add-schedule-patterns part A5 because its events carry `rooms` before that
// change's part A1 is on `main` — exactly as D2 defines them, nothing else of its realtime folder.

export type Room = `user:${string}` | `branch:${string}` | 'company';

export const COMPANY_ROOM = 'company';

/** The room of one user — a **user** id, never an employee id (API-RT-01). */
export const userRoom = (userId: string): Room => `user:${userId}`;

/** The room of one branch. */
export const branchRoom = (branchId: string): Room => `branch:${branchId}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `company`, or `user:` / `branch:` followed by a UUID. */
export function isRoom(value: unknown): value is Room {
  if (typeof value !== 'string') return false;
  if (value === COMPANY_ROOM) return true;
  const [kind, id, ...rest] = value.split(':');
  return (kind === 'user' || kind === 'branch') && rest.length === 0 && UUID.test(id ?? '');
}
