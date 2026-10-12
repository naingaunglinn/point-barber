import { act, fireEvent, render, screen } from '@testing-library/react';
import { Plus } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { renderIntl } from '../../test/intl';
import { Button } from './Button';

// ui-foundation "Buttons follow one hierarchy, one size rule and one loading behaviour" (AD-CMP-01 ·
// AD-LAY-04 · AD-A11Y-05 · AD-NET-01 · design D10). Heights and the hit area are measured in the
// browser by the catalogue cases; here the classes that make them and the behaviour.

// Test labels (the components take translated text; the tests pass plain strings).
const SAVE = 'Save';
const ADD = 'Add';
const REOPEN = 'Reopen day';
const CLOSED = 'The day is closed';

function deferred() {
  let resolve: () => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('Button', () => {
  it.each(['primary', 'secondary', 'ghost', 'destructive'] as const)(
    'renders the %s variant',
    (variant) => {
      render(<Button variant={variant}>{SAVE}</Button>);
      expect(screen.getByRole('button', { name: 'Save' }).dataset.variant).toBe(variant);
    },
  );

  it('is secondary by default and a plain button, not a submit', () => {
    render(<Button>{SAVE}</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.dataset.variant).toBe('secondary');
    expect(button.getAttribute('type')).toBe('button');
  });

  it('is 48 px below 768 px and 40 px from 768 px, with a 44 px hit area', () => {
    render(<Button>{SAVE}</Button>);
    const classes = screen.getByRole('button').className.split(' ');
    expect(classes).toEqual(expect.arrayContaining(['h-12', 'md:h-10', 'after:-inset-y-0.5']));
  });

  it('Scenario: A double tap submits once — spinner next to the kept label, disabled until settled', async () => {
    const call = deferred();
    const onClick = vi.fn(() => call.promise);
    render(<Button onClick={onClick}>{SAVE}</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button).toHaveProperty('disabled', true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.querySelector('[data-slot="spinner"]')).not.toBeNull();
    expect(button.textContent).toBe('Save');
    await act(async () => {
      call.resolve();
      await call.promise;
    });
    expect(button).toHaveProperty('disabled', false);
    expect(button.querySelector('[data-slot="spinner"]')).toBeNull();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('is enabled again after a failed action, and the failure is not swallowed', async () => {
    const call = deferred();
    const failures: unknown[] = [];
    const onUnhandled = (event: PromiseRejectionEvent | Error) => failures.push(event);
    process.on('unhandledRejection', onUnhandled);
    render(<Button onClick={() => call.promise}>{SAVE}</Button>);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    await act(async () => {
      call.reject(new Error('network'));
      await call.promise.catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    process.off('unhandledRejection', onUnhandled);
    expect(button).toHaveProperty('disabled', false);
    expect(failures).toHaveLength(1);
  });

  it('shows the spinner and stays disabled while `loading` is set by the caller', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        {SAVE}
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button.querySelector('[data-slot="spinner"]')).not.toBeNull();
  });

  it('an icon-only button is named by its aria-label and keeps the 44 px hit area on both axes', () => {
    render(<Button iconOnly icon={<Plus />} aria-label="Add" />);
    const button = screen.getByRole('button', { name: 'Add' });
    expect(button.className.split(' ')).toEqual(
      expect.arrayContaining(['size-12', 'md:size-10', 'after:-inset-0.5']),
    );
  });

  it('Scenario: Icon-only button without a name does not compile', () => {
    // @ts-expect-error -- `iconOnly` without `aria-label` (AD-A11Y-05): `pnpm typecheck` fails here.
    const unnamed = <Button iconOnly icon={<Plus />} />;
    const labelled = (
      // @ts-expect-error -- an icon-only button has no visible label.
      <Button iconOnly icon={<Plus />} aria-label={ADD}>
        {ADD}
      </Button>
    );
    expect([unnamed, labelled]).toHaveLength(2);
  });

  it('an icon-only button can be named by a label element, and passes extra attributes on', () => {
    renderIntl(
      <>
        <span id="date-label">{ADD}</span>
        <Button
          iconOnly
          icon={<Plus />}
          aria-labelledby="date-label"
          aria-expanded={false}
          aria-haspopup="dialog"
        />
      </>,
    );
    const button = screen.getByRole('button', { name: ADD });
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('a disabled reason disables the button and is linked as its description', () => {
    const onClick = vi.fn();
    render(
      <Button disabledReason={CLOSED} onClick={onClick}>
        {REOPEN}
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Reopen day' });
    expect(button).toHaveProperty('disabled', true);
    const description = document.getElementById(button.getAttribute('aria-describedby') ?? '');
    expect(description?.textContent).toBe('The day is closed');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('passes `type="submit"` through for form buttons', () => {
    render(<Button type="submit">{SAVE}</Button>);
    expect(screen.getByRole('button').getAttribute('type')).toBe('submit');
  });
});
