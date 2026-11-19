import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderIntl } from '../../test/intl';
import { LanguageSwitch } from './LanguageSwitch';

// ui-foundation "Switching the language changes every string without a page load" (AD-L10N-06 ·
// AD-NAV-07 · D-PLT-03 · design D6 / D10): the cookie, router.refresh() and onChange; the page's
// client state stays.
const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const TYPED = '8,000';
const AMOUNT = 'amount';

function Page({ onChange }: { onChange?: (locale: 'my' | 'en') => void }) {
  const [locale, setLocale] = useState<'my' | 'en'>('my');
  return (
    <>
      <input aria-label={AMOUNT} defaultValue="" />
      <LanguageSwitch
        value={locale}
        onChange={(next) => {
          setLocale(next);
          onChange?.(next);
        }}
      />
    </>
  );
}

beforeEach(() => {
  refresh.mockClear();
  document.cookie = 'point_locale=; Max-Age=0; Path=/';
});

describe('LanguageSwitch', () => {
  it('shows MM and EN, named by the language, with the current one pressed', () => {
    renderIntl(<LanguageSwitch value="my" />, { locale: 'en' });
    const mm = screen.getByRole('button', { name: 'Myanmar' });
    const en = screen.getByRole('button', { name: 'English' });
    expect([mm.textContent, en.textContent]).toEqual(['MM', 'EN']);
    expect(mm.getAttribute('aria-pressed')).toBe('true');
    expect(en.getAttribute('aria-pressed')).toBe('false');
  });

  it('Scenario: Switching to English keeps the page state — cookie en, refresh, onChange; typed value kept', () => {
    const onChange = vi.fn();
    renderIntl(<Page onChange={onChange} />);
    const amount = screen.getByRole('textbox', { name: AMOUNT });
    fireEvent.change(amount, { target: { value: TYPED } });
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(document.cookie).toContain('point_locale=en');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('en');
    expect(screen.getByRole('textbox', { name: AMOUNT })).toBe(amount);
    expect((amount as HTMLInputElement).value).toBe(TYPED);
    expect(screen.getByRole('button', { name: 'English' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('does nothing when the current language is chosen again', () => {
    const onChange = vi.fn();
    renderIntl(<LanguageSwitch value="en" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('names the options in the UI language', () => {
    renderIntl(<LanguageSwitch value="my" />, { locale: 'my' });
    expect(screen.getByRole('button', { name: 'မြန်မာ' }).getAttribute('lang')).toBe('my');
    expect(screen.getByRole('button', { name: 'English' })).toBeDefined();
  });
});
