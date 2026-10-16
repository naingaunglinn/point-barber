import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { moneyFromWire } from '@point/shared';

import { FormatProvider } from '../../providers/format';
import { renderIntl } from '../../test/intl';
import { MoneyText } from '../MoneyText/MoneyText';
import { ApprovalCard, type ApprovalCardProps } from './ApprovalCard';

// ui-foundation "ApprovalCard shows a request with its resulting value and the decision actions"
// (AD-NTF-04 · AD-POS-16 · AD-PERM-02 · design D10). The labels are the caller's (translated).
const SUBTOTAL = moneyFromWire(11000);
const DISCOUNT = moneyFromWire(1000);
// The resulting value is the server's (11,000 − 1,000 = 10,000); the card only shows it.
const TOTAL = moneyFromWire(10000);

function renderCard(props: Partial<ApprovalCardProps> = {}) {
  const handlers = { onApprove: vi.fn(), onReject: vi.fn() };
  renderIntl(
    <FormatProvider locale="en" profile="app">
      <ApprovalCard
        title="Discount request"
        requester={{ name: 'Ko Min' }}
        branch="Point 3.0"
        facts={[
          { label: 'Services', value: 'Haircut + Shave' },
          { label: 'Subtotal', value: <MoneyText amount={SUBTOTAL} /> },
          { label: 'Discount', value: <MoneyText amount={DISCOUNT} /> },
        ]}
        result={{ label: 'Total', value: <MoneyText amount={TOTAL} /> }}
        reason="Regular customer"
        canDecide
        {...handlers}
        {...props}
      />
    </FormatProvider>,
  );
  return handlers;
}

const row = (label: string) => screen.getByText(label).parentElement?.textContent;

describe('ApprovalCard', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('Scenario: Discount approval card — facts, emphasised Total 10,000 Ks, reason, Approve and Reject', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    renderCard();
    expect(row('Subtotal')).toBe('Subtotal11,000 Ks');
    expect(row('Discount')).toBe('Discount1,000 Ks');
    const result = document.querySelector('[data-slot="result"]') as HTMLElement;
    expect(result.textContent).toBe('Total10,000 Ks');
    expect(result.className).toContain('font-bold');
    expect(screen.getByText('Regular customer')).toBeDefined();
    expect(document.querySelector('[data-slot="employee-chip"]')?.textContent).toContain('Ko Min');
    expect(screen.getByText('Point 3.0')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Scenario: A viewer who may not decide — same facts, neither Approve nor Reject', () => {
    renderCard({ canDecide: false });
    expect(document.querySelector('[data-slot="result"]')?.textContent).toBe('Total10,000 Ks');
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
  });

  it('Approve reports the decision; Reject asks for a note and reports it', () => {
    const { onApprove, onReject } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), {
      target: { value: '  Price already discounted ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onReject).toHaveBeenCalledWith('Price already discounted');
  });
});
