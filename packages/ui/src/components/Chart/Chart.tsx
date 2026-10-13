'use client';

import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart as RechartsLineChart,
  XAxis,
  YAxis,
} from 'recharts';

import { formatPercent, groupDigits, moneyFromWire } from '@point/shared';

import { TABLET, useMinWidth } from '../../hooks/use-min-width';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '../../primitives/chart';
import { Button } from '../Button/Button';
import { DataText } from '../DataText/DataText';

// Simple charts (AD-CHART-01 · AD-A11Y-07 · design D10 / D11) on Recharts through the shadcn/ui chart
// part: bar charts compare, line charts show a trend; at most 6 series in --chart-1 … --chart-6 (a 7th
// is a programming error and throws); bars carry their values; a money axis groups thousands and its
// title carries the unit; "Show as table" gives the same numbers as a table with column headers. Below
// 768 px a bar chart is a ranked list with inline bars.

export interface ChartSeries {
  readonly key: string;
  /** Translated. */
  readonly label: string;
  readonly points: readonly { readonly x: string; readonly y: number }[];
}

export type ChartValueKind = 'money' | 'count' | 'percent';

export interface ChartProps {
  readonly series: readonly ChartSeries[];
  /** Translated axis titles; a money axis title carries the unit ("Amount (Ks)"). */
  readonly xLabel: string;
  readonly yLabel: string;
  readonly yKind: ChartValueKind;
}

export const MAX_SERIES = 6;

/**
 * The size Recharts draws at before it measures its container. The primitive's default (320 px wide)
 * overflows a narrower phone layout for a moment, so the chart starts 1 px wide and takes the container's
 * width on its first measurement.
 */
const FIRST_DRAW = { width: 1, height: 256 } as const;

function checkSeries(series: readonly ChartSeries[]): void {
  if (series.length > MAX_SERIES) {
    throw new RangeError(
      `AD-CHART-01: a chart draws at most ${MAX_SERIES} series, got ${series.length}`,
    );
  }
}

/** A value as the chart writes it: money in whole kyats with separators, counts, percentages. */
export function formatChartValue(kind: ChartValueKind, value: number): string {
  if (kind === 'money') return groupDigits(moneyFromWire(value));
  if (kind === 'percent') return formatPercent(value);
  return groupDigits(moneyFromWire(value)); // a count: a whole number, grouped the same way
}

function rowsOf(series: readonly ChartSeries[]): Record<string, string | number>[] {
  const byX = new Map<string, Record<string, string | number>>();
  for (const s of series) {
    for (const point of s.points) {
      const row = byX.get(point.x) ?? { x: point.x };
      row[s.key] = point.y;
      byX.set(point.x, row);
    }
  }
  return [...byX.values()];
}

/** Several series are named in a legend, so a line or bar is never told by its colour alone (AD-A11Y-03). */
function legendOf(series: readonly ChartSeries[]): ReactNode {
  return series.length < 2 ? null : (
    // Above the plot: below it, the legend would cover the x-axis title.
    <ChartLegend
      verticalAlign="top"
      content={<ChartLegendContent verticalAlign="top" className="flex-wrap gap-x-4 gap-y-1" />}
    />
  );
}

function configOf(series: readonly ChartSeries[]): ChartConfig {
  return Object.fromEntries(
    series.map((s, i) => [s.key, { label: s.label, color: `var(--chart-${i + 1})` }]),
  );
}

function ChartTable({ series, xLabel, yLabel, yKind }: ChartProps) {
  const rows = rowsOf(series);
  return (
    // A wide table scrolls sideways on a phone: the region takes the keyboard focus so the arrow keys
    // scroll it (WCAG 2.1.1, axe scrollable-region-focusable), named like the chart.
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={yLabel}>
      <table className="w-full text-sm" data-slot="chart-table">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="h-12 px-3 text-start">
              {xLabel}
            </th>
            {series.map((s) => (
              <th key={s.key} scope="col" className="h-12 px-3 text-end">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row.x)} className="h-12 border-b border-border">
              <td className="px-3">
                <DataText>{String(row.x)}</DataText>
              </td>
              {series.map((s) => (
                <td key={s.key} className="px-3 text-end font-numeric">
                  {typeof row[s.key] === 'number'
                    ? formatChartValue(yKind, row[s.key] as number)
                    : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A bar chart below 768 px: the first series ranked, each value with an inline bar. */
function RankedList({ series, yKind }: Pick<ChartProps, 'series' | 'yKind'>) {
  const first = series[0];
  if (first === undefined) return null;
  const ranked = [...first.points].sort((a, b) => b.y - a.y);
  const max = Math.max(1, ...ranked.map((p) => p.y));
  return (
    <ol className="flex flex-col gap-3" data-slot="ranked-list">
      {ranked.map((point) => (
        <li key={point.x} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <DataText>{point.x}</DataText>
            <span className="font-numeric font-semibold">{formatChartValue(yKind, point.y)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-chart-1"
              style={{ width: `${(point.y / max) * 100}%` }}
              data-slot="inline-bar"
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Frame({
  props,
  chart,
  mobile,
}: {
  readonly props: ChartProps;
  readonly chart: ReactNode;
  readonly mobile: ReactNode | null;
}) {
  const t = useTranslations('common.action');
  const tablet = useMinWidth(TABLET);
  const [asTable, setAsTable] = useState(false);
  if (!tablet && mobile !== null) return <>{mobile}</>;
  return (
    <div className="flex flex-col gap-2" data-slot="chart-frame">
      <div className="flex justify-end">
        <Button variant="ghost" onClick={() => setAsTable((value) => !value)}>
          {asTable ? t('showAsChart') : t('showAsTable')}
        </Button>
      </div>
      {asTable ? (
        <ChartTable
          series={props.series}
          xLabel={props.xLabel}
          yLabel={props.yLabel}
          yKind={props.yKind}
        />
      ) : (
        chart
      )}
    </div>
  );
}

export function BarChart(props: ChartProps) {
  checkSeries(props.series);
  const { series, xLabel, yLabel, yKind } = props;
  const format = (value: unknown) => formatChartValue(yKind, Number(value));
  const chart = (
    <ChartContainer
      config={configOf(series)}
      className="min-h-64 w-full"
      aria-label={yLabel}
      role="img"
      initialDimension={FIRST_DRAW}
    >
      <RechartsBarChart data={rowsOf(series)} margin={{ top: 24, right: 8, left: 8, bottom: 24 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="x"
          tickLine={false}
          label={{ value: xLabel, position: 'insideBottom', offset: -16 }}
        />
        <YAxis
          tickFormatter={format}
          width={80}
          label={{ value: yLabel, angle: -90, position: 'insideLeft' }}
        />
        {series.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={`var(--color-${s.key})`}
            radius={4}
            isAnimationActive={false}
          >
            <LabelList
              dataKey={s.key}
              position="top"
              formatter={format}
              className="fill-foreground font-numeric"
            />
          </Bar>
        ))}
        {legendOf(series)}
      </RechartsBarChart>
    </ChartContainer>
  );
  return (
    <Frame
      props={props}
      chart={chart}
      mobile={series.length === 1 ? <RankedList series={series} yKind={yKind} /> : null}
    />
  );
}

export function LineChart(props: ChartProps) {
  checkSeries(props.series);
  const { series, xLabel, yLabel, yKind } = props;
  const format = (value: unknown) => formatChartValue(yKind, Number(value));
  const chart = (
    <ChartContainer
      config={configOf(series)}
      className="min-h-64 w-full"
      aria-label={yLabel}
      role="img"
      initialDimension={FIRST_DRAW}
    >
      <RechartsLineChart data={rowsOf(series)} margin={{ top: 24, right: 16, left: 8, bottom: 24 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="x"
          tickLine={false}
          label={{ value: xLabel, position: 'insideBottom', offset: -16 }}
        />
        <YAxis
          tickFormatter={format}
          width={80}
          label={{ value: yLabel, angle: -90, position: 'insideLeft' }}
        />
        {series.map((s) => (
          <Line
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stroke={`var(--color-${s.key})`}
            strokeWidth={2}
            isAnimationActive={false}
          />
        ))}
        {legendOf(series)}
      </RechartsLineChart>
    </ChartContainer>
  );
  return <Frame props={props} chart={chart} mobile={null} />;
}
