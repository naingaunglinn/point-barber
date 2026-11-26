'use client';

import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type DragEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';

import { Button } from '@point/ui';

// The reorder list of the master lists (AD-SET-04): categories and services here, and the cancel reasons,
// leave types and stock adjustment reasons of the changes that import it. Task 7.3 of add-service-catalogue,
// the list only — design D11 and "Shared pieces" name it screen-local, and it is built at its shared path
// because three other changes wait for it.
//
// A drag handle on pointer devices (native HTML5 drag and drop — no new dependency) plus Move up / Move
// down buttons that work by keyboard and touch (AD-A11Y-02; the handle is hidden on a coarse pointer).
// "Save order" shows only while the order differs from the one received, sends the whole id list in the
// new order and is blocked while the save runs. The moved order is dropped when the items change — after a
// save or a refetch — and kept when the same items arrive again. Read-only (no write permission): rows only.

export interface ReorderListProps<T> {
  /** The rows in the order the server holds; every one that may be ordered (an archived row is not). */
  readonly items: readonly T[];
  readonly getId: (item: T) => string;
  /** What a row shows — name, badges, lock icon, actions; the handle and the move buttons wrap it. */
  readonly renderItem: (item: T) => ReactNode;
  /**
   * Every id in the new order. The caller shows a refusal itself: a returned promise only drives the
   * button's spinner, and the moved order stays after a failure so the person can try again.
   */
  readonly onSave: (ids: readonly string[]) => void | Promise<unknown>;
  /** A request of the caller is running (a screen that sends one request per row sets this). */
  readonly saving?: boolean;
  /** No handle, no move buttons, no Save order — the holder may not change the order (AD-PERM-02). */
  readonly readOnly?: boolean;
  /** The name of the list for assistive technology (translated). */
  readonly label: string;
  readonly testId?: string;
}

type Direction = 'up' | 'down';

/** `from` moved to the index `to`; the other rows keep their order. */
function moved(ids: readonly string[], from: number, to: number): readonly string[] {
  const next = [...ids];
  const [id] = next.splice(from, 1);
  if (id === undefined) return ids;
  next.splice(to, 0, id);
  return next;
}

export function ReorderList<T>({
  items,
  getId,
  renderItem,
  onSave,
  saving = false,
  readOnly = false,
  label,
  testId,
}: ReorderListProps<T>) {
  const t = useTranslations('common.action');
  const received = items.map(getId);
  const signature = received.join('\n');
  const [seen, setSeen] = useState(signature);
  const [order, setOrder] = useState<readonly string[] | null>(null);
  if (seen !== signature) {
    setSeen(signature);
    setOrder(null);
  }
  const ids = order ?? received;
  const changed = ids.some((id, index) => id !== received[index]);
  const byId = new Map(items.map((item) => [getId(item), item]));

  const buttons = useRef(new Map<string, Partial<Record<Direction, HTMLButtonElement | null>>>());
  const [focus, setFocus] = useState<{ id: string; direction: Direction } | null>(null);
  const dragging = useRef<string | null>(null);
  const namePrefix = useId();

  useEffect(() => {
    if (focus === null) return;
    const index = ids.indexOf(focus.id);
    const edge = focus.direction === 'up' ? index === 0 : index === ids.length - 1;
    const direction: Direction = edge
      ? focus.direction === 'up'
        ? 'down'
        : 'up'
      : focus.direction;
    buttons.current.get(focus.id)?.[direction]?.focus();
    setFocus(null);
  }, [focus, ids]);

  const move = (id: string, direction: Direction) => {
    const from = ids.indexOf(id);
    const to = direction === 'up' ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= ids.length) return;
    setOrder(moved(ids, from, to));
    setFocus({ id, direction });
  };

  const drop = (event: DragEvent<HTMLLIElement>, target: string) => {
    event.preventDefault();
    const id = dragging.current;
    dragging.current = null;
    if (id === null || id === target) return;
    setOrder(moved(ids, ids.indexOf(id), ids.indexOf(target)));
  };

  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <ul aria-label={label} className="flex flex-col gap-2">
        {ids.map((id, index) => {
          const item = byId.get(id);
          if (item === undefined) return null;
          const nameId = `${namePrefix}-${id}`;
          return (
            <li
              key={id}
              className="flex items-center gap-2 rounded-md border border-border bg-background p-2"
              onDragOver={readOnly ? undefined : (event) => event.preventDefault()}
              onDrop={readOnly ? undefined : (event) => drop(event, id)}
            >
              {readOnly ? null : (
                <span
                  aria-hidden
                  draggable
                  data-testid="reorder-handle"
                  className="flex size-10 shrink-0 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing [@media(pointer:coarse)]:hidden"
                  onDragStart={(event) => {
                    dragging.current = id;
                    // Firefox starts a drag only when the transfer holds some data.
                    event.dataTransfer.setData('text/plain', id);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                >
                  <GripVertical className="size-5" />
                </span>
              )}
              <span id={nameId} className="min-w-0 flex-1">
                {renderItem(item)}
              </span>
              {readOnly ? null : (
                <span className="flex shrink-0 gap-1">
                  <Button
                    iconOnly
                    variant="ghost"
                    icon={<ArrowUp />}
                    aria-label={t('moveUp')}
                    aria-describedby={nameId}
                    disabled={index === 0 || saving}
                    ref={(node) => {
                      buttons.current.set(id, { ...buttons.current.get(id), up: node });
                    }}
                    onClick={() => move(id, 'up')}
                  />
                  <Button
                    iconOnly
                    variant="ghost"
                    icon={<ArrowDown />}
                    aria-label={t('moveDown')}
                    aria-describedby={nameId}
                    disabled={index === ids.length - 1 || saving}
                    ref={(node) => {
                      buttons.current.set(id, { ...buttons.current.get(id), down: node });
                    }}
                    onClick={() => move(id, 'down')}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {readOnly || !changed ? null : (
        <div>
          <Button variant="primary" loading={saving} onClick={() => onSave(ids)}>
            {t('saveOrder')}
          </Button>
        </div>
      )}
    </div>
  );
}
