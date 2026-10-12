'use client';

import { Button } from '../Button/Button';
import { Skeleton } from '../Skeleton/Skeleton';
import type { CardSpec } from '../types';

// A list as cards on a phone (AD-LIST-02 · AD-LAY-03 · design D10): each row is a card of at most four
// fields — the first one its title — and one inline primary action. Skeleton cards while loading.

export interface CardListProps<T> {
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string;
  readonly card: (row: T) => CardSpec;
  readonly loading?: boolean;
  readonly onRowPress?: (row: T) => void;
}

export function CardList<T>({ rows, rowKey, card, loading = false, onRowPress }: CardListProps<T>) {
  if (loading) return <Skeleton shape="card" count={3} />;
  return (
    <ul className="flex flex-col gap-2" data-slot="card-list">
      {rows.map((row) => {
        const { fields, action } = card(row);
        const [title, ...rest] = fields;
        const body = (
          <div className="flex min-w-0 flex-1 flex-col gap-1 text-start">
            <div className="font-semibold">{title}</div>
            {rest.map((field, index) => (
              <div key={index} className="text-sm">
                {field}
              </div>
            ))}
          </div>
        );
        return (
          <li
            key={rowKey(row)}
            className="flex items-start gap-3 rounded-md border border-border bg-card p-3"
            data-slot="card"
          >
            {onRowPress === undefined ? (
              body
            ) : (
              <button
                type="button"
                className="flex min-w-0 flex-1 text-start"
                onClick={() => onRowPress(row)}
              >
                {body}
              </button>
            )}
            {action === undefined || action.allowed === false ? null : (
              <Button
                variant={action.destructive ? 'destructive' : 'primary'}
                onClick={action.onPress}
              >
                {action.label}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
