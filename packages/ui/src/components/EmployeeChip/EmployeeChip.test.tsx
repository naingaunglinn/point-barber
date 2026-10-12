import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EmployeeChip } from './EmployeeChip';

// ui-foundation "An employee chip never shows an avatar without the name" (AD-CMP-09 · AD-VIS-12 · design D10).
const KO_AUNG = 'Ko Aung';
const POINT_3 = 'Point 3.0';

describe('EmployeeChip', () => {
  it('Scenario: Employee without a photo — KA, the name and the branch, the name not truncated', () => {
    render(<EmployeeChip name={KO_AUNG} branch={POINT_3} />);
    expect(document.querySelector('[data-slot="initials"]')?.textContent).toBe('KA');
    const name = screen.getByText(KO_AUNG);
    expect(name.closest('[class*="truncate"]')).toBeNull();
    expect(screen.getByText(POINT_3)).toBeDefined();
  });

  it('shows the photo instead of the initials, still with the name', () => {
    render(<EmployeeChip name={KO_AUNG} photoUrl="/fixtures/ko-aung.jpg" />);
    expect(document.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(document.querySelector('[data-slot="initials"]')).toBeNull();
    expect(screen.getByText(KO_AUNG)).toBeDefined();
  });

  it('marks a Myanmar name with lang="my", initials included', () => {
    render(<EmployeeChip name="ကိုအောင်" />);
    expect(screen.getByText('ကိုအောင်').getAttribute('lang')).toBe('my');
    expect(document.querySelector('[data-slot="initials"] [lang="my"]')?.textContent).toBe('ကို');
  });

  it('Scenario: Profile action only when given — plain text, then a button that calls the handler', () => {
    const { unmount } = render(<EmployeeChip name={KO_AUNG} />);
    expect(screen.queryByRole('button')).toBeNull();
    unmount();
    const onOpenProfile = vi.fn();
    render(<EmployeeChip name={KO_AUNG} onOpenProfile={onOpenProfile} />);
    fireEvent.click(screen.getByRole('button', { name: /Ko Aung/ }));
    expect(onOpenProfile).toHaveBeenCalledTimes(1);
  });
});
