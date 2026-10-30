// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderStaff } from '../../test/render';
import { SavedCheck } from './SavedCheck';

// Tasks 10.9 / 12.8 — the texts of the saved check (AD-NET-02).
describe('SavedCheck', () => {
  it('checking: "Checking whether it was saved…"', () => {
    renderStaff(<SavedCheck state="checking" onRetry={() => {}} />);
    expect(screen.getByRole('status').textContent).toBe('Checking whether it was saved…');
  });

  it('not saved: the alert with Retry', () => {
    const onRetry = vi.fn();
    renderStaff(<SavedCheck state="notSaved" onRetry={onRetry} />);
    expect(screen.getByRole('alert').textContent).toContain("It wasn't saved. Try again.");
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('idle or sending: nothing', () => {
    renderStaff(<SavedCheck state="sending" onRetry={() => {}} />);
    expect(screen.queryByTestId('saved-checking')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
