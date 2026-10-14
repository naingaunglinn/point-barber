import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { localized } from '@point/shared';

import { DataText } from './DataText';

// ui-foundation "Myanmar-script data carries lang="my" whatever the UI language is" (AD-L10N-04 ·
// AD-A11Y-06 · AD-VIS-06 · D-DB-04 · design D10). The 28 px / 24 px line-heights are read in the
// browser by the catalogue cases; here the attribute that selects them.
const SHAVE = { name_mm: 'မုတ်ဆိတ်ရိတ်', name_en: null };
const MA_SU = 'Ma Su';
const MIXED = 'Point 3.0 · ပွိုင့်';
const EMPTY = '';

describe('DataText', () => {
  it('Scenario: Myanmar fallback value in the English UI — the element has lang="my"', () => {
    const { container } = render(<DataText>{localized(SHAVE, 'name', 'en')}</DataText>);
    const element = container.firstElementChild;
    expect(element?.textContent).toBe('မုတ်ဆိတ်ရိတ်');
    expect(element?.getAttribute('lang')).toBe('my');
  });

  it('Scenario: Latin value gets no attribute — Ma Su', () => {
    const { container } = render(<DataText>{MA_SU}</DataText>);
    expect(container.firstElementChild?.hasAttribute('lang')).toBe(false);
  });

  it('marks a mixed value that holds one Myanmar character', () => {
    const { container } = render(<DataText>{MIXED}</DataText>);
    expect(container.firstElementChild?.getAttribute('lang')).toBe('my');
  });

  it('renders an empty value as an empty element without lang', () => {
    const { container } = render(<DataText>{EMPTY}</DataText>);
    expect(container.firstElementChild?.hasAttribute('lang')).toBe(false);
  });
});
