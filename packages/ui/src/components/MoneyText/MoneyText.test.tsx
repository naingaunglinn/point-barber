import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { moneyFromWire, type Mmk } from '@point/shared';

import { FormatProvider } from '../../providers/format';
import { renderIntl } from '../../test/intl';
import { MoneyText } from './MoneyText';

// ui-foundation "Money is displayed through one formatter with the app and site profiles" (D-PLT-04 ·
// AD-FMT-00 · AD-FMT-01 · FE-FMT-01 · design D10).
const ks = (n: number): Mmk => moneyFromWire(n);

function show(amount: Mmk, locale: 'my' | 'en', profile: 'app' | 'site', unit?: boolean) {
  return renderIntl(
    <FormatProvider locale={locale} profile={profile}>
      <MoneyText amount={amount} {...(unit === undefined ? {} : { unit })} />
    </FormatProvider>,
    { locale },
  );
}

describe('MoneyText', () => {
  it('Scenario: Refund amount — −6000 with profile app in en shows -6,000 Ks', () => {
    show(ks(-6_000), 'en', 'app');
    expect(screen.getByText('-6,000 Ks')).toBeDefined();
  });

  it('writes ကျပ် in the staff app in Myanmar and Ks on the website in both languages', () => {
    show(ks(7_000), 'my', 'app');
    expect(screen.getByText('7,000 ကျပ်')).toBeDefined();
    show(ks(7_000), 'my', 'site');
    show(ks(7_000), 'en', 'site');
    expect(screen.getAllByText('7,000 Ks')).toHaveLength(2);
  });

  it('leaves the unit out for a table cell whose header carries it', () => {
    show(ks(8_000), 'en', 'app', false);
    expect(screen.getByText('8,000')).toBeDefined();
  });

  it('takes the profile from its prop before the provider', () => {
    renderIntl(
      <FormatProvider locale="my" profile="app">
        <MoneyText amount={ks(7_000)} profile="site" />
      </FormatProvider>,
      { locale: 'my' },
    );
    expect(screen.getByText('7,000 Ks')).toBeDefined();
  });

  it('uses tabular figures and does not wrap', () => {
    show(ks(1_250_000), 'en', 'app');
    expect(screen.getByText('1,250,000 Ks').className.split(' ')).toEqual(
      expect.arrayContaining(['font-numeric', 'whitespace-nowrap']),
    );
  });

  it('Scenario: A plain number is not money', () => {
    // @ts-expect-error -- a JavaScript number is not `Mmk` (D-PLT-04): `pnpm typecheck` fails here.
    const plain = <MoneyText amount={7000} />;
    expect(plain).toBeDefined();
  });

  it('needs a FormatProvider', () => {
    expect(() => renderIntl(<MoneyText amount={ks(1)} />)).toThrow(
      'MoneyText needs a FormatProvider',
    );
  });
});
