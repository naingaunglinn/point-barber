'use client';

import { cn } from 'cn';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { formatTime, type Instant } from '@point/shared';

import { useFormat } from '../../providers/format';

// A KPI tile (AD-DSH-02 · AD-DSH-03 · design D10): the label, the value in text-3xl tabular figures, the
// comparison with the previous period as arrow + percentage + text, and when it was computed — never a
// number without its time. A row holds at most 6 tiles; a seventh starts a new row.

export interface KpiComparison {
  readonly direction: 'up' | 'down';
  /** Formatted by formatPercent ("10%"). */
  readonly percent: string;
  /** Translated ("vs yesterday"). */
  readonly label: string;
}

export interface KpiTileProps {
  /** Translated. */
  readonly label: string;
  /** Formatted (MoneyText, formatQty …). */
  readonly value: ReactNode;
  readonly updatedAt: Instant;
  readonly comparison?: KpiComparison;
  /** The report behind the tile. */
  readonly href?: string;
}

const ARROW = { up: '▲', down: '▼' } as const;

export function KpiTile({ label, value, updatedAt, comparison, href }: KpiTileProps) {
  const t = useTranslations('common.kpi');
  const { locale } = useFormat('KpiTile');
  const body = (
    <>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-numeric text-3xl font-bold" data-slot="kpi-value">
        {value}
      </span>
      {comparison === undefined ? null : (
        <span
          className={cn(
            'flex flex-wrap items-center gap-1 text-sm',
            comparison.direction === 'up' ? 'text-success' : 'text-destructive',
          )}
          data-slot="kpi-comparison"
        >
          <span aria-hidden>{ARROW[comparison.direction]}</span>
          <span className="font-numeric font-semibold">{comparison.percent}</span>
          <span>{comparison.label}</span>
        </span>
      )}
      <span className="text-xs text-muted-foreground">
        {t('updated', { time: formatTime(updatedAt, { locale }) })}
      </span>
    </>
  );
  const classes = 'flex flex-col gap-1 rounded-lg border border-border bg-card p-4';
  return href === undefined ? (
    <div className={classes} data-slot="kpi-tile">
      {body}
    </div>
  ) : (
    <a href={href} className={cn(classes, 'hover:bg-muted')} data-slot="kpi-tile">
      {body}
    </a>
  );
}

/** At most 6 tiles per row from 1024 px (AD-DSH-02); fewer columns on smaller screens. */
export function KpiRow({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6"
      data-slot="kpi-row"
    >
      {children}
    </div>
  );
}
