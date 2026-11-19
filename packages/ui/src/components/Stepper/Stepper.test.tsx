import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderIntl } from '../../test/intl';
import { Stepper, type Step } from './Stepper';

// ui-foundation "A stepper shows where the user is in a multi-step flow" (AD-CMP-12 · AD-WIZ-01 · design D10).
const STEPS: readonly Step[] = [
  { key: 'services', label: 'Services', state: 'done' },
  { key: 'payment', label: 'Payment', state: 'current' },
  { key: 'review', label: 'Review', state: 'todo' },
  { key: 'finish', label: 'Finish', state: 'todo' },
];

describe('Stepper', () => {
  it('Scenario: Stepper on desktop and phone — four steps with a check on Services; "Step 2 of 4 · Payment" and a bar', () => {
    renderIntl(<Stepper steps={STEPS} onStepPress={() => {}} />);
    const row = document.querySelector('[data-slot="stepper-row"]');
    expect(row?.className).toContain('md:flex');
    expect(row?.querySelectorAll('li')).toHaveLength(4);
    expect(row?.querySelectorAll('[data-slot="connector"]')).toHaveLength(3);
    expect(row?.querySelector('li [class*="lucide"]')?.closest('li')?.textContent).toBe('Services');
    expect(row?.querySelector('[aria-current="step"]')?.textContent).toContain('Payment');
    const compact = document.querySelector('[data-slot="stepper-compact"]');
    expect(compact?.className).toContain('md:hidden');
    expect(compact?.textContent).toBe('Step 2 of 4 · Payment');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('2');
    // The bar is named by the line above it (axe aria-progressbar-name).
    expect(screen.getByRole('progressbar', { name: 'Step 2 of 4 · Payment' })).toBeDefined();
  });

  it('Scenario: Going back to a completed step — Services is reported, Finish is not a button', () => {
    const onStepPress = vi.fn();
    renderIntl(<Stepper steps={STEPS} onStepPress={onStepPress} />);
    fireEvent.click(screen.getByRole('button', { name: 'Services' }));
    expect(onStepPress).toHaveBeenCalledWith('services');
    expect(screen.queryByRole('button', { name: 'Finish' })).toBeNull();
  });
});
