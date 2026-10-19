import { ServicePricingMode, type ServiceListItemDto } from '@point/shared';
import { describe, expect, it } from 'vitest';

import { START_CHIP_COUNT, startChips } from './start-chips';

// add-walkin-visit-checkout task 10.6 — visits spec "The START sheet offers the first six simple services
// in catalogue order" (AD-POS-03 · AD-POS-05 · P2.SVC.01): the list as `GET /v1/services?branch_id=&
// pricing_mode=1` returns it, in catalogue order; the first 6 simple services are chips.
let n = 0;
const service = (
  name_en: string,
  pricing_mode: number = ServicePricingMode.SIMPLE,
): ServiceListItemDto => {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    category_id: '00000000-0000-4000-8000-000000000999',
    name_mm: name_en,
    name_en,
    pricing_mode: pricing_mode as ServiceListItemDto['pricing_mode'],
    buffer_minutes: 0,
    status: 1,
    show_on_website: true,
    sort_order: n,
    branch_ids: [],
    duration_range: { min: 30, max: 30 },
    archived_at: null,
    updated_at: '2026-10-05T10:42:00+06:30',
  };
};

describe('startChips (task 10.6)', () => {
  it('Scenario: Three services at B3 — Haircut, Shave, Hair wash, in that order', () => {
    const list = [service('Haircut'), service('Shave'), service('Hair wash')];
    expect(startChips(list).map((chip) => chip.name_en)).toStrictEqual([
      'Haircut',
      'Shave',
      'Hair wash',
    ]);
  });

  it('Scenario: Seven services, six chips — the first six; the seventh only in the picker', () => {
    const list = Array.from({ length: 7 }, (_, i) => service(`Service ${i + 1}`));
    expect(START_CHIP_COUNT).toBe(6);
    expect(startChips(list).map((chip) => chip.name_en)).toStrictEqual(
      list.slice(0, 6).map((item) => item.name_en),
    );
  });

  it('Scenario: An option service is not a chip — and the next simple one moves up', () => {
    const list = [
      service('Colour', ServicePricingMode.OPTIONS),
      ...Array.from({ length: 6 }, (_, i) => service(`Simple ${i + 1}`)),
    ];
    const chips = startChips(list);
    expect(chips.map((chip) => chip.name_en)).not.toContain('Colour');
    expect(chips).toHaveLength(6);
  });

  it('no service → no chip', () => {
    expect(startChips([])).toStrictEqual([]);
  });
});
