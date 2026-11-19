'use client';

import { EllipsisVertical } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../primitives/dropdown-menu';
import { Button } from '../Button/Button';
import type { Action } from '../types';

// The kebab (AD-LAY-04 · AD-LAY-05 · AD-LIST-04 · design D10): the rare and the destructive actions of a
// view behind one icon-only trigger named "More" (`common.action.more`). Items keep the caller's order;
// `allowed: false` hides one, and with nothing allowed there is no trigger. A destructive item is drawn
// in --destructive and its `onPress` opens the screen's confirm or reason dialog — the menu asks nothing.
// Items are 44 px high and 8 px apart (AD-A11Y-05 · AD-VIS-07); a long label wraps (AD-L10N-04). The
// keyboard is Radix's: Enter / Space / ArrowDown open on the first item, arrows move, Esc returns to the
// trigger (AD-A11Y-02).

export interface ActionMenuItem extends Action {
  /** Set on the item, for the screen's tests. */
  readonly testId?: string;
}

export interface ActionMenuProps {
  readonly actions: readonly ActionMenuItem[];
  /** Set on the trigger, for the screen's tests. */
  readonly 'data-testid'?: string;
}

export function ActionMenu({ actions, 'data-testid': testId }: ActionMenuProps) {
  const t = useTranslations('common.action');
  const shown = actions.filter((action) => action.allowed !== false);
  if (shown.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          iconOnly
          icon={<EllipsisVertical />}
          aria-label={t('more')}
          data-testid={testId}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="flex min-w-48 flex-col gap-2">
        {shown.map((action) => (
          <DropdownMenuItem
            key={action.label}
            variant={action.destructive ? 'destructive' : 'default'}
            className="min-h-11 text-base"
            onSelect={() => void action.onPress()}
            data-testid={action.testId}
          >
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
