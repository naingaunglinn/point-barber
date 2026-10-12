import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import {
  FixtureGrantsProvider,
  FixturePermissionGate as PermissionGate,
  PERSONA_GRANTS,
  useFixtureCan,
  type Persona,
} from '../catalogue/personas';
import { Button } from '../components/Button/Button';
import { LockBanner } from '../components/LockBanner/LockBanner';

// ui-foundation "PermissionGate hides what the user may never do and never shows an enabled control
// that would be refused" (AD-PERM-02 · AD-PERM-04 · AD-DET-03 · design D7), with the four personas.
const CANCEL = 'Cancel booking';
const CLOSED = 'The day is closed. Reopen it to change bookings.';
const NO_ACCESS = 'No access';

function as(persona: Persona, children: ReactNode) {
  return render(
    <FixtureGrantsProvider me={PERSONA_GRANTS[persona]}>{children}</FixtureGrantsProvider>,
  );
}

const cancelButton = () => screen.queryByRole('button', { name: CANCEL });

describe('PermissionGate', () => {
  it('Scenario: A barber never sees the cancel button — no "Cancel booking", enabled or disabled', () => {
    as(
      'barber',
      <PermissionGate code="booking.delete">
        <Button variant="destructive">{CANCEL}</Button>
      </PermissionGate>,
    );
    expect(cancelButton()).toBeNull();
    expect(document.body.textContent).toBe('');
  });

  it('Scenario: State forbids the action — the manager sees it disabled with the reason under it', () => {
    as(
      'manager',
      <PermissionGate code="booking.delete" branchId="B3" blocked={{ reason: CLOSED }}>
        <Button variant="destructive">{CANCEL}</Button>
      </PermissionGate>,
    );
    const button = cancelButton() as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const description = document.getElementById(button.getAttribute('aria-describedby') ?? '');
    expect(description?.textContent).toBe(CLOSED);
  });

  it('Scenario: State forbids the action — hidden under the lock banner', () => {
    as(
      'manager',
      <>
        <LockBanner message={CLOSED} />
        <PermissionGate code="booking.delete" blocked="hidden">
          <Button variant="destructive">{CANCEL}</Button>
        </PermissionGate>
      </>,
    );
    expect(cancelButton()).toBeNull();
    expect(screen.getByText(CLOSED)).toBeDefined();
  });

  it('the admin sees it enabled at any branch', () => {
    as(
      'admin',
      <PermissionGate code="booking.delete" branchId="B1">
        <Button variant="destructive">{CANCEL}</Button>
      </PermissionGate>,
    );
    expect((cancelButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it('the manager outside her branch gets the fallback', () => {
    as(
      'manager',
      <PermissionGate code="booking.delete" branchId="B1" fallback={NO_ACCESS}>
        <Button variant="destructive">{CANCEL}</Button>
      </PermissionGate>,
    );
    expect(cancelButton()).toBeNull();
    expect(screen.getByText(NO_ACCESS)).toBeDefined();
  });

  it('branch scope gives a company code read-only and a private code nothing (branch-holder)', () => {
    function Probe() {
      const can = useFixtureCan();
      return (
        <output>
          {JSON.stringify([
            can('role.update'),
            can('role.update', { level: 'company' }),
            can('payroll.view'),
          ])}
        </output>
      );
    }
    as('branch-holder', <Probe />);
    expect(screen.getByRole('status').textContent).toBe('[true,false,false]');
  });

  it('a code outside the catalogue and an option its level lacks do not compile', () => {
    const typeOnly = () => (
      <>
        {/* @ts-expect-error — not in the catalogue (D-ROLE-08) */}
        <PermissionGate code="booking.fly">{CANCEL}</PermissionGate>
        {/* @ts-expect-error — a branch-level code has no company check */}
        <PermissionGate code="booking.delete" level="company">
          {CANCEL}
        </PermissionGate>
      </>
    );
    expect(typeof typeOnly).toBe('function');
  });

  it('needs a GrantsProvider', () => {
    expect(() => render(<PermissionGate code="booking.create">{CANCEL}</PermissionGate>)).toThrow(
      /GrantsProvider/,
    );
  });
});
