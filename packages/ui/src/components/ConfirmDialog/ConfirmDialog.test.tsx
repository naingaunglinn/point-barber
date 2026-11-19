import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderIntl } from '../../test/intl';
import { ConfirmDialog } from './ConfirmDialog';

// ui-foundation "Confirm dialogs state the action, the consequence and the verb" (AD-CONF-01 ·
// AD-CONF-02 · AD-LAY-04 · AD-NET-01 · AD-COPY-04 · design D10).
const SEND = 'Send transfer';
const BODY = "Stock leaves Point 1.0 now. You can't edit or cancel this transfer after sending.";

describe('ConfirmDialog', () => {
  it('Scenario: Send transfer — title, body, "This can\'t be undone.", Go back left and Send transfer right', () => {
    renderIntl(
      <ConfirmDialog
        open
        title={SEND}
        consequence={BODY}
        confirmLabel={SEND}
        irreversible
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const dialog = screen.getByRole('alertdialog', { name: SEND });
    expect(dialog.textContent).toContain(BODY);
    expect(dialog.textContent).toContain("This can't be undone.");
    const buttons = screen.getAllByRole('button').filter((b) => b.textContent !== '');
    expect(buttons.map((b) => b.textContent)).toEqual(['Go back', SEND]);
  });

  it('Scenario: Double confirmation — one call, a spinner while it runs', async () => {
    let finish: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderIntl(
      <ConfirmDialog
        open
        title={SEND}
        consequence={BODY}
        confirmLabel={SEND}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    const send = screen.getByRole('button', { name: SEND });
    fireEvent.click(send);
    fireEvent.click(send);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(send.querySelector('[data-slot="spinner"]')).not.toBeNull();
    await act(async () => finish());
  });

  it('uses the destructive style for a destructive action', () => {
    renderIntl(
      <ConfirmDialog
        open
        title={SEND}
        consequence={BODY}
        confirmLabel={SEND}
        destructive
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: SEND }).dataset.variant).toBe('destructive');
  });

  it('Go back calls onCancel', () => {
    const onCancel = vi.fn();
    renderIntl(
      <ConfirmDialog
        open
        title={SEND}
        consequence={BODY}
        confirmLabel={SEND}
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Scenario: A confirm dialog without a consequence does not compile', () => {
    const noBody = (
      // @ts-expect-error -- `consequence` is required (AD-CONF-01).
      <ConfirmDialog
        open
        title={SEND}
        confirmLabel={SEND}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    const noVerb = (
      // @ts-expect-error -- `confirmLabel` is required: no default "OK" (AD-CONF-02).
      <ConfirmDialog
        open
        title={SEND}
        consequence={BODY}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect([noBody, noVerb]).toHaveLength(2);
  });
});
