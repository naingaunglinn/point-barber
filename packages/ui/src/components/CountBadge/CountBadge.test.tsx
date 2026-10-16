import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CountBadge, countText } from './CountBadge';

// The shared count badge (AD-NTF-01 · AD-NAV-01 · design D10).
describe('CountBadge', () => {
  it('caps at 99+ and shows nothing at 0', () => {
    expect([0, 1, 99, 100].map(countText)).toEqual([null, '1', '99', '99+']);
  });

  it('is anchored to the icon corner and never hidden from screen readers', () => {
    const { container } = render(<CountBadge count={100} />);
    const badge = container.querySelector('[data-slot="count-badge"]') as HTMLElement;
    expect(badge.textContent).toBe('99+');
    expect(badge.className).toContain('start-full');
    // The digits' optical centre differs by font: Latin 19 px, Myanmar 23 px.
    expect(badge.className).toContain('leading-[19px]');
    expect(badge.className).toContain('[&:lang(my)]:leading-[23px]');
    expect(badge.getAttribute('aria-hidden')).toBeNull();
    expect(render(<CountBadge count={0} />).container.innerHTML).toBe('');
  });
});
