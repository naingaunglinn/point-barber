import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderIntl } from '../../test/intl';
import { SearchInput } from './SearchInput';

// The search box with its magnifier button (AD-LIST-01 · AD-NAV-05 · owner review 12/Oct/2026).
const PLACEHOLDER = 'Receipt no.';

function Demo({ onSearch }: { onSearch: (value: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <SearchInput value={value} onChange={setValue} onSearch={onSearch} placeholder={PLACEHOLDER} />
  );
}

describe('SearchInput', () => {
  it('is a search landmark whose field is named by its placeholder, with a named magnifier button', () => {
    renderIntl(<Demo onSearch={vi.fn()} />);
    expect(screen.getByRole('search')).toBeDefined();
    const field = screen.getByRole('searchbox', { name: PLACEHOLDER });
    expect(field.getAttribute('enterkeyhint')).toBe('search');
    expect(screen.getByRole('button', { name: 'Search' }).querySelector('svg')).not.toBeNull();
  });

  it('the magnifier and Enter report the text and close the keyboard', () => {
    const onSearch = vi.fn();
    renderIntl(<Demo onSearch={onSearch} />);
    const field = screen.getByRole('searchbox', { name: PLACEHOLDER });
    field.focus();
    fireEvent.change(field, { target: { value: 'B3-2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSearch).toHaveBeenLastCalledWith('B3-2026');
    field.focus();
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSearch).toHaveBeenCalledTimes(2);
    expect(document.activeElement).not.toBe(field);
  });
});
