import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderIntl } from '../../test/intl';
import { EmptyState } from '../EmptyState/EmptyState';
import { ErrorState } from './ErrorState';

// ui-foundation "An API error is shown through its code as a language key" and "An empty state explains
// the area and offers only an allowed action" (API-ERR-01 · API-ERR-02 · AD-STATE-02..04 · design D10).
const REQUEST_ID = '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70';
const NO_BOOKINGS = 'No bookings today.';
const WALK_INS = 'Walk-ins are recorded from ＋ Start.';
const NEW_BOOKING = 'New booking';

describe('ErrorState', () => {
  it('Scenario: Interpolated message — file_too_large with max_mb 10', () => {
    renderIntl(<ErrorState problem={{ code: 'file_too_large', params: { max_mb: 10 } }} />);
    expect(screen.getByText('The file is larger than 10 MB.')).toBeDefined();
  });

  it('Scenario: Forbidden and not found', () => {
    renderIntl(
      <>
        <ErrorState problem={{ code: 'forbidden' }} />
        <ErrorState problem={{ code: 'not_found' }} />
      </>,
    );
    expect(
      screen.getByText("You don't have access to this page. Ask an admin if you need it."),
    ).toBeDefined();
    expect(screen.getByText("This item doesn't exist or was archived.")).toBeDefined();
  });

  it('Scenario: Unknown code never leaks the developer text — error.unknown and Error ID: 0199a3f2', () => {
    const problem = { code: 'zz_unknown', detail: 'stack trace line 1', request_id: REQUEST_ID };
    renderIntl(<ErrorState problem={problem} />);
    expect(screen.getByText('Something went wrong. Try again.')).toBeDefined();
    expect(screen.getByText('Error ID: 0199a3f2')).toBeDefined();
    expect(document.body.textContent).not.toContain('stack trace line 1');
  });

  it('Scenario: Unexpected server error — internal_error with its error ID', () => {
    renderIntl(<ErrorState problem={{ code: 'internal_error', request_id: REQUEST_ID }} />);
    expect(
      screen.getByText(
        'Something went wrong on the server. Try again; if it happens again, give the error ID to an admin.',
      ),
    ).toBeDefined();
    expect(screen.getByText('Error ID: 0199a3f2')).toBeDefined();
  });

  it('Scenario: Retry only when it is safe', () => {
    const onRetry = vi.fn();
    const { unmount } = renderIntl(
      <ErrorState problem={{ code: 'internal_error' }} onRetry={onRetry} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    unmount();
    renderIntl(<ErrorState problem={{ code: 'internal_error' }} />);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});

describe('EmptyState', () => {
  it('Scenario: Empty bookings for a manager and a barber — the action only when allowed', () => {
    const action = { label: NEW_BOOKING, onPress: () => {} };
    const { unmount } = renderIntl(
      <EmptyState title={NO_BOOKINGS} body={WALK_INS} action={{ ...action, allowed: true }} />,
    );
    expect(screen.getByText(NO_BOOKINGS)).toBeDefined();
    expect(screen.getByText(WALK_INS)).toBeDefined();
    expect(screen.getByRole('button', { name: NEW_BOOKING })).toBeDefined();
    unmount();
    renderIntl(
      <EmptyState title={NO_BOOKINGS} body={WALK_INS} action={{ ...action, allowed: false }} />,
    );
    expect(screen.queryByRole('button', { name: NEW_BOOKING })).toBeNull();
  });
});
