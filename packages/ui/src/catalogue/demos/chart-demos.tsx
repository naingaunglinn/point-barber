'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { formatDate, localized, moneyToWire, moneyUnit, type BusinessDate } from '@point/shared';

import { BarChart, LineChart, type ChartSeries } from '../../components/Chart/Chart';
import { KpiRow, KpiTile } from '../../components/KpiTile/KpiTile';
import { MoneyText } from '../../components/MoneyText/MoneyText';
import { Stepper, type Step } from '../../components/Stepper/Stepper';
import { useFormat } from '../../providers/format';
import { HandlerLog } from '../demo-frame';
import { BRANCHES, DATES, DEMO_SALES_TOTAL, REVENUE_BY_BRANCH } from '../fixtures';

// Charts, KPI and stepper demos (task 9.10 · AD-CHART-01 · AD-DSH-02 · AD-DSH-03 · AD-CMP-12 · AD-WIZ-01 ·
// design D12): the checkout's four steps on step 2, the KPI row with 6 and 7 tiles, revenue by branch as
// bars, and lines with 3 and 6 series.

const STEP_KEYS = ['services', 'payment', 'review', 'finish'] as const;

export function StepperDemo() {
  const t = useTranslations('devui.stepper');
  const log = useTranslations('devui.log');
  const [pressed, setPressed] = useState('');
  const steps: Step[] = STEP_KEYS.map((key, index) => ({
    key,
    label: t(key),
    state: index < 1 ? 'done' : index === 1 ? 'current' : 'todo',
  }));
  return (
    <div className="flex flex-col gap-2">
      <Stepper steps={steps} onStepPress={(key) => setPressed(log('step', { key }))} />
      <HandlerLog label={log('label')} value={pressed} />
    </div>
  );
}

/** The comparison of the spec: (44,000 − 40,000) ÷ 40,000 = 10 %. */
function useTiles(count: number) {
  const t = useTranslations('devui.kpi');
  const labels = [
    'salesToday',
    'visits',
    'customers',
    'averageSale',
    'discounts',
    'refunds',
    'expenses',
  ] as const;
  return labels
    .slice(0, count)
    .map((key, index) => (
      <KpiTile
        key={key}
        label={t(key)}
        value={index === 0 ? <MoneyText amount={DEMO_SALES_TOTAL} /> : String(index + 3)}
        updatedAt={DATES.finish}
        comparison={
          index === 0 ? { direction: 'up', percent: '10%', label: t('vsLastMonday') } : undefined
        }
      />
    ));
}

export function KpiSixDemo() {
  return <KpiRow>{useTiles(6)}</KpiRow>;
}

export function KpiSevenDemo() {
  return <KpiRow>{useTiles(7)}</KpiRow>;
}

function useRevenue(): ChartSeries {
  const t = useTranslations('devui.charts');
  const { locale } = useFormat('BarChart demo');
  return {
    key: 'revenue',
    label: t('revenue'),
    points: REVENUE_BY_BRANCH.map(({ branch, amount }) => {
      const named = BRANCHES.find((item) => item.code === branch);
      return {
        x: named === undefined ? branch : localized(named, 'name', locale),
        y: moneyToWire(amount),
      };
    }),
  };
}

function useAxis() {
  const t = useTranslations('devui.charts');
  const common = useTranslations('common');
  const { locale, profile } = useFormat('chart demo');
  return { x: t('branch'), y: common('amountHeader', { unit: moneyUnit(locale, profile) }) };
}

export function RevenueBarDemo() {
  const axis = useAxis();
  return <BarChart series={[useRevenue()]} xLabel={axis.x} yLabel={axis.y} yKind="money" />;
}

/** The week up to the catalogue's today (business dates). */
const DAYS: readonly BusinessDate[] = [
  '2026-09-29',
  '2026-09-30',
  '2026-10-01',
  '2026-10-02',
  '2026-10-03',
  '2026-10-04',
  '2026-10-05',
];

/** Demo daily sales in whole kyats: a base per series and a repeating weekly wave. */
function useLines(count: number): ChartSeries[] {
  const t = useTranslations('devui.charts');
  const { locale } = useFormat('LineChart demo');
  return Array.from({ length: count }, (_, index) => ({
    key: `s${index + 1}`,
    label: t('series', { n: index + 1 }),
    points: DAYS.map((day, dayIndex) => ({
      x: formatDate(day, { locale }),
      y: 20_000 + index * 8_000 + ((dayIndex * 7 + index * 3) % 5) * 4_000,
    })),
  }));
}

export function LineThreeDemo() {
  const t = useTranslations('devui.charts');
  const axis = useAxis();
  return <LineChart series={useLines(3)} xLabel={t('day')} yLabel={axis.y} yKind="money" />;
}

export function LineSixDemo() {
  const t = useTranslations('devui.charts');
  const axis = useAxis();
  return <LineChart series={useLines(6)} xLabel={t('day')} yLabel={axis.y} yKind="money" />;
}
