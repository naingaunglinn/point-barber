import { formatTime, mmtInstant } from '@point/shared';
import { fireEvent, screen, within } from '@testing-library/react';

// The time of a late-entry time field (`LateEntryTimeField`, test id `late-entry-<key>`), as a person
// chooses it: press the time's combobox (`late-entry-<key>-time`), type the time as it is shown
// ("3:30 PM") into its search field, press the time's option (`late-entry-<key>-time-<HH:mm>`).
// Component tests in English only (jsdom); e2e/late-entry.spec.ts has the same steps for Playwright.
export function chooseTime(key: string, time: string): void {
  const field = screen.getByTestId(`late-entry-${key}`);
  fireEvent.click(within(field).getByTestId(`late-entry-${key}-time`));
  fireEvent.change(screen.getByPlaceholderText('Search'), {
    target: { value: formatTime(mmtInstant('2026-01-01', time), { locale: 'en' }) },
  });
  fireEvent.click(screen.getByTestId(`late-entry-${key}-time-${time}`));
}
