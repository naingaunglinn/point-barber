import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { moneyToWire } from '@point/shared';

import { BRANCHES, REVENUE_BY_BRANCH } from '../../catalogue/fixtures';
import { renderIntl } from '../../test/intl';
import { mockViewport } from '../../test/viewport';
import { BarChart, formatChartValue, LineChart, type ChartSeries } from './Chart';

// ui-foundation "Charts are simple, labelled and have a table view" (AD-CHART-01 · AD-A11Y-07 · design
// D10), on the revenue by branch of spec-fixtures.md §8.
const REVENUE: ChartSeries = {
  key: 'revenue',
  label: 'Revenue',
  points: REVENUE_BY_BRANCH.map((r) => ({
    x: BRANCHES.find((b) => b.code === r.branch)?.name_en ?? r.branch,
    y: moneyToWire(r.amount),
  })),
};
const BRANCH = 'Branch';
const AMOUNT = 'Amount (Ks)';

/** jsdom lays nothing out: give the chart container a size, as a browser at 1280 px would. */
function giveChartsASize() {
  const size = {
    width: 800,
    height: 400,
    top: 0,
    left: 0,
    right: 800,
    bottom: 400,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  };
  // The legend is one line high, as in a browser; with the container's size it would take the whole plot.
  const legend = { ...size, height: 24, bottom: 24 };
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return (this.classList.contains('recharts-legend-wrapper') ? legend : size) as DOMRect;
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(400);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [{ target, contentRect: size } as unknown as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    },
  );
}

beforeEach(() => giveChartsASize());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('BarChart', () => {
  it('Scenario: Bar chart and its table — three labelled bars, the axis title, the same rows in a table', () => {
    mockViewport(1280);
    renderIntl(<BarChart series={[REVENUE]} xLabel={BRANCH} yLabel={AMOUNT} yKind="money" />);
    const svg = document.querySelector('[data-slot="chart"] svg');
    expect(svg).not.toBeNull();
    const labels = [
      ...document.querySelectorAll('.recharts-label-list text, .recharts-label-list tspan'),
    ]
      .map((node) => node.textContent)
      .filter((text) => text !== '');
    expect([...new Set(labels)]).toEqual(['60,000', '70,000', '44,000']);
    expect(document.body.textContent).toContain(AMOUNT);
    fireEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    const table = document.querySelector('[data-slot="chart-table"]');
    expect(
      [...(table?.querySelectorAll('th') ?? [])].map((th) => [
        th.textContent,
        th.getAttribute('scope'),
      ]),
    ).toEqual([
      [BRANCH, 'col'],
      ['Revenue', 'col'],
    ]);
    expect([...(table?.querySelectorAll('tbody tr') ?? [])].map((tr) => tr.textContent)).toEqual([
      'Point 1.060,000',
      'Point 2.070,000',
      'Point 3.044,000',
    ]);
    expect(screen.getByRole('button', { name: 'Show as chart' })).toBeDefined();
  });

  it('Scenario: Chart on a phone — a ranked list Point 2.0, Point 1.0, Point 3.0 with inline bars', () => {
    mockViewport(320);
    renderIntl(<BarChart series={[REVENUE]} xLabel={BRANCH} yLabel={AMOUNT} yKind="money" />);
    expect(document.querySelector('svg')).toBeNull();
    const items = [...document.querySelectorAll('[data-slot="ranked-list"] li')];
    expect(items.map((li) => li.textContent)).toEqual([
      'Point 2.070,000',
      'Point 1.060,000',
      'Point 3.044,000',
    ]);
    expect(
      items.map((li) => (li.querySelector('[data-slot="inline-bar"]') as HTMLElement).style.width),
    ).toEqual(['100%', `${(60_000 / 70_000) * 100}%`, `${(44_000 / 70_000) * 100}%`]);
  });

  it('Scenario: Six and seven series — six drawn in --chart-1 … --chart-6, seven refused naming the limit', () => {
    mockViewport(1280);
    const many = (n: number): ChartSeries[] =>
      Array.from({ length: n }, (_, i) => ({
        key: `s${i}`,
        label: `S${i}`,
        points: [{ x: 'B3', y: 1000 * (i + 1) }],
      }));
    renderIntl(<BarChart series={many(6)} xLabel={BRANCH} yLabel={AMOUNT} yKind="money" />);
    const fills = [
      ...document.querySelectorAll('.recharts-bar-rectangle path, .recharts-rectangle'),
    ]
      .map((node) => node.getAttribute('fill'))
      .filter(Boolean);
    expect([...new Set(fills)]).toEqual([
      'var(--color-s0)',
      'var(--color-s1)',
      'var(--color-s2)',
      'var(--color-s3)',
      'var(--color-s4)',
      'var(--color-s5)',
    ]);
    const style = document.querySelector('[data-slot="chart"] style')?.textContent ?? '';
    for (let i = 1; i <= 6; i += 1) expect(style).toContain(`var(--chart-${i})`);
    // Several series are named in a legend, never told by colour alone (AD-A11Y-03).
    const legend = document.querySelector('.recharts-legend-wrapper');
    expect(legend?.textContent).toBe('S0S1S2S3S4S5');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      renderIntl(<BarChart series={many(7)} xLabel={BRANCH} yLabel={AMOUNT} yKind="money" />),
    ).toThrow('at most 6 series');
  });
});

describe('LineChart', () => {
  it('draws the trend and offers the table view', () => {
    mockViewport(1280);
    renderIntl(<LineChart series={[REVENUE]} xLabel={BRANCH} yLabel={AMOUNT} yKind="money" />);
    expect(document.querySelector('.recharts-line')).not.toBeNull();
    // One series needs no legend: the value axis names it.
    expect(document.querySelector('.recharts-legend-wrapper')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    expect(document.querySelectorAll('[data-slot="chart-table"] tbody tr')).toHaveLength(3);
  });

  it('Scenario: Table view on a phone — a card per day with every series, no table', () => {
    mockViewport(320);
    const two: ChartSeries[] = [
      {
        key: 'a',
        label: 'Series 1',
        points: [
          { x: '04/Oct/2026', y: 20000 },
          { x: '05/Oct/2026', y: 24000 },
        ],
      },
      {
        key: 'b',
        label: 'Series 2',
        points: [
          { x: '04/Oct/2026', y: 28000 },
          { x: '05/Oct/2026', y: 32000 },
        ],
      },
    ];
    renderIntl(<LineChart series={two} xLabel="Day" yLabel={AMOUNT} yKind="money" />);
    fireEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    expect(document.querySelector('table')).toBeNull();
    const cards = [...document.querySelectorAll('[data-slot="chart-cards"] > li')];
    expect(cards.map((card) => card.textContent)).toEqual([
      '04/Oct/2026Series 120,000Series 228,000',
      '05/Oct/2026Series 124,000Series 232,000',
    ]);
  });
});

describe('formatChartValue', () => {
  it('groups money and counts, and writes percentages with at most two decimals', () => {
    expect(formatChartValue('money', 1_250_000)).toBe('1,250,000');
    expect(formatChartValue('count', 56)).toBe('56');
    expect(formatChartValue('percent', 12.345)).toBe('12.35%');
  });
});
