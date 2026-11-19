'use client';

import type { ReactNode } from 'react';

import { ActionMenu } from '../ActionMenu/ActionMenu';
import { Button } from '../Button/Button';
import type { Action } from '../types';

// The head of every page (AD-LAY-05 · AD-LAY-04 · design D10): the title (the page's one `h1`), an
// optional subtitle or scope ("Point 3.0 · 05/Oct/2026"), one primary action — last, on the right —
// and at most two visible secondary actions; the rest sit in the "More" menu (`ActionMenu`). A
// destructive secondary action never sits next to the primary: it always goes into the menu, after the
// plain ones (its own confirm dialog asks).
// A list page puts its FilterBar in `filterBar`, under the header.

export interface PageHeaderProps {
  /** Translated. */
  readonly title: string;
  readonly subtitle?: ReactNode;
  readonly primary?: Action;
  readonly secondary?: readonly Action[];
  readonly filterBar?: ReactNode;
}

/** Secondary actions shown as buttons (AD-LAY-05). */
const VISIBLE_SECONDARY = 2;

export function PageHeader({
  title,
  subtitle,
  primary,
  secondary = [],
  filterBar,
}: PageHeaderProps) {
  const allowed = secondary.filter((action) => action.allowed !== false);
  const plain = allowed.filter((action) => !action.destructive);
  const visible = plain.slice(0, VISIBLE_SECONDARY);
  const menu = [
    ...plain.slice(VISIBLE_SECONDARY),
    ...allowed.filter((action) => action.destructive),
  ];
  const showPrimary = primary !== undefined && primary.allowed !== false;

  return (
    <div className="flex flex-col gap-4" data-slot="page-header">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-bold break-words">{title}</h1>
          {subtitle === undefined ? null : (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {visible.length === 0 && menu.length === 0 && !showPrimary ? null : (
          <div className="flex flex-wrap items-center gap-2" data-slot="page-actions">
            <ActionMenu actions={menu} />
            {visible.map((action) => (
              <Button
                key={action.label}
                variant="secondary"
                onClick={action.onPress}
                data-testid={action.testId}
              >
                {action.label}
              </Button>
            ))}
            {showPrimary ? (
              <Button variant="primary" onClick={primary.onPress} data-testid={primary.testId}>
                {primary.label}
              </Button>
            ) : null}
          </div>
        )}
      </div>
      {filterBar}
    </div>
  );
}
