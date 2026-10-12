'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { moneyToWire, type BusinessDate, type Instant, type Slot } from '@point/shared';

import { Button } from '../../components/Button/Button';
import {
  OptionPicker,
  type OptionGroup,
  type SoldCell,
} from '../../components/OptionPicker/OptionPicker';
import {
  PriceGridEditor,
  type GridLocation,
  type PriceCell,
} from '../../components/PriceGridEditor/PriceGridEditor';
import { TimeSlotPicker } from '../../components/TimeSlotPicker/TimeSlotPicker';
import { DemoToggle, HandlerLog } from '../demo-frame';
import { BRANCHES, HAIR_COLOUR_GRID, SERVICES } from '../fixtures';

// Picker demos (task 9.11 · AD-BKG-01 · AD-POS-05 · AD-CMP-13 · D-SVC-05..08 · design D12): the start times
// of 05/Oct/2026, the Hair colour picker and price grid at B3 (Brown · Long not sold), and the Home tab of
// Haircut at B2 that inherits the shop price. Values are fixture data; nothing is saved.

const slot = (start: string, end: string): Slot => ({
  starts_at: `2026-10-05T${start}:00+06:30`,
  ends_at: `2026-10-05T${end}:00+06:30`,
});
const SLOTS: readonly Slot[] = [
  slot('10:00', '10:30'),
  slot('10:15', '10:45'),
  slot('10:45', '11:15'),
];

export function TimeSlotDemo() {
  const t = useTranslations('devui.pickers');
  const log = useTranslations('devui.log');
  const [empty, setEmpty] = useState(false);
  const [value, setValue] = useState<Instant | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <DemoToggle label={t('noTimesLeft')} checked={empty} onChange={setEmpty} />
      <TimeSlotPicker
        aria-label={t('startTime')}
        slots={empty ? [] : SLOTS}
        value={value}
        onChange={setValue}
      />
      <HandlerLog label={log('reported')} value={value ?? ''} />
    </div>
  );
}

/** Colour × length of the fixture grid as option groups (the fixture names are English master data). */
function useHairColour() {
  const t = useTranslations('devui.pickers');
  const named = (value: string) => ({ id: value.toLowerCase(), name: { mm: value, en: value } });
  const groups: readonly [OptionGroup, OptionGroup] = [
    {
      id: 'colour',
      name: { mm: t('colour'), en: t('colour') },
      values: HAIR_COLOUR_GRID.colours.map(named),
    },
    {
      id: 'length',
      name: { mm: t('length'), en: t('length') },
      values: HAIR_COLOUR_GRID.lengths.map(named),
    },
  ];
  const sold: SoldCell[] = HAIR_COLOUR_GRID.cells.flatMap((cell) =>
    cell.price === null || cell.minutes === null
      ? []
      : [
          {
            valueIds: [cell.colour.toLowerCase(), cell.length.toLowerCase()],
            price_amount: cell.price,
            duration_minutes: cell.minutes,
          },
        ],
  );
  const grid: PriceCell[] = HAIR_COLOUR_GRID.cells.map((cell) => ({
    valueIds: [cell.colour.toLowerCase(), cell.length.toLowerCase()],
    price_amount: cell.price,
    duration_minutes: cell.minutes,
  }));
  return { groups, sold, grid };
}

const serviceName = (service: { readonly name_mm: string; readonly name_en: string | null }) => ({
  mm: service.name_mm,
  en: service.name_en,
});

export function OptionPickerDemo() {
  const t = useTranslations('devui.pickers');
  const log = useTranslations('devui.log');
  const { groups, sold } = useHairColour();
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <OptionPicker
        open={open}
        onOpenChange={setOpen}
        serviceName={serviceName(SERVICES.hairColour)}
        groups={groups}
        cells={sold}
        onAdd={(cell) => {
          setAdded(
            log('added', {
              cell: JSON.stringify({ ...cell, price_amount: moneyToWire(cell.price_amount) }),
            }),
          );
          setOpen(false);
        }}
      >
        <Button onClick={() => setOpen(true)}>{t('chooseOptions')}</Button>
      </OptionPicker>
      <HandlerLog label={log('label')} value={added} />
    </div>
  );
}

const GRID_BRANCHES = BRANCHES.map((branch) => ({ id: branch.code, ...branch }));

export function PriceGridDemo() {
  const log = useTranslations('devui.log');
  const { groups, grid } = useHairColour();
  const [shopCells, setShopCells] = useState<readonly PriceCell[]>(grid);
  const [homeCells, setHomeCells] = useState<readonly PriceCell[]>([]);
  const [location, setLocation] = useState<GridLocation>('shop');
  const [from, setFrom] = useState<BusinessDate | null>(null);
  const cells = location === 'shop' ? shopCells : homeCells;
  return (
    <div className="flex flex-col gap-2">
      <PriceGridEditor
        mode="options"
        groups={groups}
        branches={GRID_BRANCHES}
        branchId="B3"
        location={location}
        cells={cells}
        shopCells={shopCells}
        defaultDurationMinutes={90}
        effectiveFrom={from ?? undefined}
        onChange={location === 'shop' ? setShopCells : setHomeCells}
        onLocationChange={setLocation}
        onEffectiveFromChange={setFrom}
        onCopyFromBranch={() => undefined}
      />
      <HandlerLog
        label={log('reported')}
        value={JSON.stringify(
          cells.map((cell) => ({
            ...cell,
            price_amount: cell.price_amount === null ? null : moneyToWire(cell.price_amount),
          })),
        )}
      />
    </div>
  );
}

/** Haircut at B2: the shop price 7,000 and no home price — the Home cell inherits it. */
export function PriceGridHomeDemo() {
  const [cells, setCells] = useState<readonly PriceCell[]>([]);
  const shop: readonly PriceCell[] = [
    {
      valueIds: [],
      price_amount: SERVICES.haircut.prices.B2,
      duration_minutes: SERVICES.haircut.minutes,
    },
  ];
  return (
    <PriceGridEditor
      mode="simple"
      groups={[]}
      branches={GRID_BRANCHES}
      branchId="B2"
      location="home"
      cells={cells}
      shopCells={shop}
      defaultDurationMinutes={SERVICES.haircut.minutes}
      onChange={setCells}
    />
  );
}
