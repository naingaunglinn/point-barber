'use client';

import { Inbox } from 'lucide-react';

import { Button } from '../Button/Button';
import type { Action } from '../types';

// An empty area (AD-STATE-02 · AD-PERM-02 · design D10): what the area is for and the next step, and
// the action only when the caller marks it allowed — never an action the user cannot take.

export interface EmptyStateProps {
  /** Translated. */
  readonly title: string;
  /** Translated: what the area is for and what to do next. */
  readonly body: string;
  readonly action?: Action;
}

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-4 py-8 text-center"
      data-slot="empty-state"
    >
      <Inbox aria-hidden className="size-8 text-muted-foreground" />
      <p className="font-semibold">{title}</p>
      <p className="max-w-prose text-sm text-muted-foreground">{body}</p>
      {action === undefined || action.allowed === false ? null : (
        <Button variant={action.destructive ? 'destructive' : 'primary'} onClick={action.onPress}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
