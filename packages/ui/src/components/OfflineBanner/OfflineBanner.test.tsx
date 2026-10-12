import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderIntl } from '../../test/intl';
import { OfflineBanner } from './OfflineBanner';

// ui-foundation "An offline banner stays while the connection is down" (AD-STATE-05 · D-VIS-13 · design D10).
const BANNER =
  "No connection. Money actions can't be saved right now. Write the service on paper and add it later with Late entry.";
const AMOUNT = 'Amount';
const HELP = '/help/late-entry';

function setOnline(online: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
  act(() => {
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
  });
}

afterEach(() => vi.restoreAllMocks());

describe('OfflineBanner', () => {
  it('Scenario: Offline banner text — shown while offline with the help link; the field keeps 8,000', () => {
    renderIntl(
      <>
        <OfflineBanner helpHref={HELP} />
        <input aria-label={AMOUNT} defaultValue="8,000" />
      </>,
    );
    expect(screen.queryByText(BANNER)).toBeNull();
    setOnline(false);
    expect(screen.getByText(BANNER)).toBeDefined();
    expect(screen.getByRole('link', { name: 'How to add it later' }).getAttribute('href')).toBe(
      HELP,
    );
    expect((screen.getByRole('textbox', { name: AMOUNT }) as HTMLInputElement).value).toBe('8,000');
    setOnline(true);
    expect(screen.queryByText(BANNER)).toBeNull();
  });

  it('shows while the API is unreachable although the browser is online', () => {
    renderIntl(<OfflineBanner helpHref={HELP} apiUnreachable />);
    expect(screen.getByText(BANNER)).toBeDefined();
    fireEvent.click(screen.getByRole('link'));
  });
});
