import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { formatPercent, moneyFromWire } from '@point/shared';

import { FormatProvider } from '../../providers/format';
import { renderIntl } from '../../test/intl';
import { MoneyText } from '../MoneyText/MoneyText';
import { KpiRow, KpiTile } from './KpiTile';

// ui-foundation "KPI tiles show a value, its comparison and its freshness" (AD-DSH-02 · AD-DSH-03 · design D10).
const SALES_TODAY = 'Sales today';
const VS_YESTERDAY = 'vs yesterday';

describe('KpiTile', () => {
  it('Scenario: KPI tile — 44,000 Ks in text-3xl, ▲ 10% with a label, Updated 10:42 AM', () => {
    // (44,000 − 40,000) ÷ 40,000 = 10 %
    const percent = formatPercent(((44_000 - 40_000) / 40_000) * 100);
    renderIntl(
      <FormatProvider locale="en" profile="app">
        <KpiTile
          label={SALES_TODAY}
          value={<MoneyText amount={moneyFromWire(44_000)} />}
          updatedAt="2026-10-05T10:42:00+06:30"
          comparison={{ direction: 'up', percent, label: VS_YESTERDAY }}
        />
      </FormatProvider>,
    );
    const value = document.querySelector('[data-slot="kpi-value"]');
    expect(value?.textContent).toBe('44,000 Ks');
    expect(value?.className).toContain('text-3xl');
    expect(value?.className).toContain('font-numeric');
    expect(document.querySelector('[data-slot="kpi-comparison"]')?.textContent).toBe(
      `▲10%${VS_YESTERDAY}`,
    );
    expect(screen.getByText('Updated 10:42 AM')).toBeDefined();
  });

  it('Scenario: Six and seven tiles — six per row from 1024 px, the seventh on a new row', () => {
    renderIntl(
      <FormatProvider locale="en" profile="app">
        <KpiRow>
          {Array.from({ length: 7 }, (_, i) => (
            <KpiTile
              key={i}
              label={SALES_TODAY}
              value={String(i)}
              updatedAt="2026-10-05T10:42:00+06:30"
            />
          ))}
        </KpiRow>
      </FormatProvider>,
    );
    const row = document.querySelector('[data-slot="kpi-row"]');
    expect(row?.className).toContain('lg:grid-cols-6');
    expect(row?.children).toHaveLength(7);
  });

  it('links to the report behind it', () => {
    renderIntl(
      <FormatProvider locale="en" profile="app">
        <KpiTile
          label={SALES_TODAY}
          value="1"
          updatedAt="2026-10-05T10:42:00+06:30"
          href="/reports/sales"
        />
      </FormatProvider>,
    );
    expect(screen.getByRole('link').getAttribute('href')).toBe('/reports/sales');
  });
});
