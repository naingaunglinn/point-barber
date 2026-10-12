import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EmployeeChip } from './EmployeeChip';

// ui-foundation "An employee chip never shows an avatar without the name" (AD-CMP-09 · AD-VIS-12 · design D10).
const KO_AUNG = 'Ko Aung';
const POINT_3 = 'Point 3.0';

describe('EmployeeChip', () => {
  it('Scenario: Employee without a photo — the name and the branch, no avatar, the name not truncated', () => {
    render(<EmployeeChip name={KO_AUNG} branch={POINT_3} />);
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('[data-slot="initials"]')).toBeNull();
    const name = screen.getByText(KO_AUNG);
    expect(name.closest('[class*="truncate"]')).toBeNull();
    expect(screen.getByText(POINT_3)).toBeDefined();
  });

  it('Scenario: Employee with a photo — the photo, decorative, next to the name', () => {
    render(<EmployeeChip name={KO_AUNG} photoUrl="/fixtures/ko-aung.jpg" />);
    expect(document.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(document.querySelector('[data-slot="initials"]')).toBeNull();
    expect(screen.getByText(KO_AUNG)).toBeDefined();
  });

  it('marks a Myanmar name with lang="my" and shows no honorific circle', () => {
    render(<EmployeeChip name="ကိုအောင်" />);
    expect(screen.getByText('ကိုအောင်').getAttribute('lang')).toBe('my');
    expect(document.querySelector('[data-slot="employee-chip"]')?.textContent).toBe('ကိုအောင်');
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
