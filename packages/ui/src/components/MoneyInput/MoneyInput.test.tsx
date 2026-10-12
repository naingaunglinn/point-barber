import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { moneyFromWire, type Mmk } from '@point/shared';

import { FormatProvider } from '../../providers/format';
import { renderIntl } from '../../test/intl';
import { MoneyInput } from './MoneyInput';

// ui-foundation "MoneyInput accepts only whole MMK and formats while typing" (D-PLT-04 · AD-FORM-11 ·
// AD-FMT-10 · AD-FMT-01 · design D10).
const LABEL = 'Amount';

function Demo({
  locale = 'en',
  profile = 'app',
  max,
  readOnly,
  initial = null,
  onValue,
}: {
  locale?: 'my' | 'en';
  profile?: 'app' | 'site';
  max?: Mmk;
  readOnly?: boolean;
  initial?: Mmk | null;
  onValue?: (value: Mmk | null) => void;
}) {
  const [value, setValue] = useState<Mmk | null>(initial);
  return (
    <FormatProvider locale={locale} profile={profile}>
      <MoneyInput
        aria-label={LABEL}
        value={value}
        max={max}
        readOnly={readOnly}
        onChange={(next) => {
          setValue(next);
          onValue?.(next);
        }}
      />
    </FormatProvider>
  );
}

const field = () => screen.getByRole('textbox', { name: LABEL }) as HTMLInputElement;
const type = (...steps: string[]) => {
  for (const step of steps)
    fireEvent.change(field(), { target: { value: `${field().value}${step}` } });
};
const ks = (n: number) => moneyFromWire(n);

describe('MoneyInput', () => {
  it('is a numeric keypad field in 16 px', () => {
    renderIntl(<Demo />);
    expect(field().getAttribute('inputmode')).toBe('numeric');
    expect(field().className).toContain('text-base');
  });

  it('Scenario: Typing an amount — 7,000 with Ks in English and ကျပ် in Myanmar, reported 7000', () => {
    const onValue = vi.fn();
    const { unmount } = renderIntl(<Demo onValue={onValue} />);
    type('7', '0', '0', '0');
    expect(field().value).toBe('7,000');
    expect(screen.getByText('Ks')).toBeDefined();
    expect(onValue).toHaveBeenLastCalledWith(7000n);
    unmount();
    renderIntl(<Demo locale="my" />, { locale: 'my' });
    type('7000');
    expect(field().value).toBe('7,000');
    expect(screen.getByText('ကျပ်')).toBeDefined();
  });

  it('shows Ks on the website profile in Myanmar too', () => {
    renderIntl(<Demo locale="my" profile="site" />, { locale: 'my' });
    expect(screen.getByText('Ks')).toBeDefined();
  });

  it('Scenario: Myanmar digits — ၇၀၀၀ shows 7,000 and reports 7000', () => {
    const onValue = vi.fn();
    renderIntl(<Demo onValue={onValue} />);
    type('၇၀၀၀');
    expect(field().value).toBe('7,000');
    expect(onValue).toHaveBeenLastCalledWith(7000n);
  });

  it('Scenario: Decimal point and minus are ignored', () => {
    renderIntl(<Demo />);
    type('7000', '.', '-');
    expect(field().value).toBe('7,000');
  });

  it('Scenario: Digits typed after an ignored decimal point — 700,050', () => {
    const onValue = vi.fn();
    renderIntl(<Demo onValue={onValue} />);
    type('7000', '.', '5', '0');
    expect(field().value).toBe('700,050');
    expect(onValue).toHaveBeenLastCalledWith(700050n);
  });

  it.each(['7,000', '7000', '7 000'])('accepts the pasted %s', (text) => {
    const onValue = vi.fn();
    renderIntl(<Demo onValue={onValue} />);
    fireEvent.paste(field(), { clipboardData: { getData: () => text } });
    fireEvent.change(field(), { target: { value: text } });
    expect(field().value).toBe('7,000');
    expect(onValue).toHaveBeenLastCalledWith(7000n);
  });

  it('Scenario: Pasting a decimal amount — null and error.amount_invalid under the field', () => {
    const onValue = vi.fn();
    renderIntl(<Demo onValue={onValue} />);
    const event = fireEvent.paste(field(), { clipboardData: { getData: () => '7000.50' } });
    expect(event).toBe(false); // the paste is cancelled
    expect(field().value).toBe('');
    expect(onValue).not.toHaveBeenCalled();
    const message = screen.getByText('Enter a whole amount in kyats.');
    expect(field().getAttribute('aria-invalid')).toBe('true');
    expect(field().getAttribute('aria-describedby')).toContain(message.id);
    type('5');
    expect(screen.queryByText('Enter a whole amount in kyats.')).toBeNull();
  });

  it('Scenario: Zero is a value, empty is not', () => {
    const onValue = vi.fn();
    renderIntl(<Demo onValue={onValue} />);
    type('0');
    expect(onValue).toHaveBeenLastCalledWith(0n);
    fireEvent.change(field(), { target: { value: '' } });
    expect(onValue).toHaveBeenLastCalledWith(null);
    expect(field().value).toBe('');
  });

  it('Scenario: The သိန်း helper and its boundary — none below 100,000; 1 and 22.5 သိန်း; none in English', () => {
    const { unmount } = renderIntl(<Demo locale="my" initial={ks(99_999)} />, { locale: 'my' });
    expect(document.querySelector('[data-slot="lakh-helper"]')).toBeNull();
    fireEvent.change(field(), { target: { value: '100000' } });
    expect(document.querySelector('[data-slot="lakh-helper"]')?.textContent).toBe('1 သိန်း');
    fireEvent.change(field(), { target: { value: '2250000' } });
    expect(document.querySelector('[data-slot="lakh-helper"]')?.textContent).toBe('22.5 သိန်း');
    unmount();
    renderIntl(<Demo initial={ks(2_250_000)} />);
    expect(document.querySelector('[data-slot="lakh-helper"]')).toBeNull();
  });

  it('refuses a digit that would pass max', () => {
    const onValue = vi.fn();
    renderIntl(<Demo max={ks(10_000)} onValue={onValue} />);
    type('1000', '0');
    expect(field().value).toBe('10,000');
    type('0');
    expect(field().value).toBe('10,000');
    expect(onValue).toHaveBeenLastCalledWith(10000n);
  });

  it('is read-only on request', () => {
    renderIntl(<Demo readOnly initial={ks(8_000)} />);
    expect(field().readOnly).toBe(true);
    expect(field().value).toBe('8,000');
  });

  it('keeps big amounts exact', () => {
    const onValue = vi.fn();
    renderIntl(<Demo onValue={onValue} />);
    type('9007199254740993');
    expect(field().value).toBe('9,007,199,254,740,993');
    expect(onValue).toHaveBeenLastCalledWith(9007199254740993n);
  });

  it('A plain number is not money', () => {
    // @ts-expect-error -- the value is `Mmk`, not a JavaScript number (D-PLT-04).
    const wrong = <MoneyInput value={7000} onChange={() => {}} />;
    expect(wrong).toBeDefined();
  });
});
