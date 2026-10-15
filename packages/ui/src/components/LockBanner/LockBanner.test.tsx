import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { moneyFromWire } from '@point/shared';

import { FormatProvider } from '../../providers/format';
import { MoneyText } from '../MoneyText/MoneyText';
import { LockBanner, ReadOnlyFields } from './LockBanner';

// ui-foundation "A locked record shows a lock banner and its values as text" (AD-DET-03 · AD-STATE-06 ·
// AD-PERM-02 · design D10).
const CLOSED = '04/Oct/2026 at Point 3.0 was closed by Ma Hnin at 9:05 PM';
const ADMIN_CAN = 'An admin can reopen the day';
const REOPEN = 'Reopen day';

function ClosedDay({
  canReopen,
  onReopen = () => {},
}: {
  canReopen: boolean;
  onReopen?: () => void;
}) {
  return (
    <FormatProvider locale="en" profile="app">
      <LockBanner
        message={CLOSED}
        correction={{
          text: ADMIN_CAN,
          action: { label: REOPEN, onPress: onReopen, allowed: canReopen },
        }}
      />
      <ReadOnlyFields
        fields={[
          { label: 'Branch', value: 'Point 3.0' },
          { label: 'Cash counted', value: <MoneyText amount={moneyFromWire(44_000)} /> },
        ]}
      />
    </FormatProvider>
  );
}

describe('LockBanner', () => {
  it('Scenario: Closed day for a manager and an admin — the banner, values as text, Reopen only for the admin', () => {
    const { unmount } = render(<ClosedDay canReopen={false} />);
    expect(screen.getByText(CLOSED)).toBeDefined();
    expect(screen.getByText(ADMIN_CAN)).toBeDefined();
    expect(screen.queryByRole('button', { name: REOPEN })).toBeNull();
    expect(document.querySelector('input, textarea, select')).toBeNull();
    expect(screen.getByText('44,000 Ks')).toBeDefined();
    unmount();
    const onReopen = vi.fn();
    render(<ClosedDay canReopen onReopen={onReopen} />);
    fireEvent.click(screen.getByRole('button', { name: REOPEN }));
    expect(onReopen).toHaveBeenCalledTimes(1);
  });

  it('marks a Myanmar value with lang="my"', () => {
    render(<ReadOnlyFields fields={[{ label: 'Branch', value: 'ပွိုင့် ၃.၀' }]} />);
    expect(screen.getByText('ပွိုင့် ၃.၀').getAttribute('lang')).toBe('my');
  });
});
