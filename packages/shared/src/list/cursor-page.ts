// One page of a cursor-paginated list (API-DATA-08): `next_cursor` null = no next page; `total` is
// given only when it is cheap.
export interface CursorPage<T> {
  readonly items: readonly T[];
  readonly next_cursor: string | null;
  readonly total: number | null;
}
