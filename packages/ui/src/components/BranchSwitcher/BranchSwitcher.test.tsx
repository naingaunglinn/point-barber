import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PERSONA_GRANTS } from '../../catalogue/personas';
import { FormatProvider } from '../../providers/format';
import { renderIntl } from '../../test/intl';
import { ALL_BRANCHES, BranchSwitcher } from './BranchSwitcher';

// ui-foundation "The branch switcher offers only branches in scope and remembers the choice per user"
// (AD-NAV-04 · AD-PERM-04 · D-DSH-01 · D-ROLE-03 · design D10), with Ma Hnin and U Kyaw Zin.
let search = new URLSearchParams();
vi.mock('next/navigation', () => ({
  usePathname: () => '/dev/ui',
  useSearchParams: () => search,
}));

const ADMIN = PERSONA_GRANTS.admin.branches_in_scope;
const MANAGER = PERSONA_GRANTS.manager.branches_in_scope;

function renderSwitcher(
  userId: string,
  branches: typeof ADMIN,
  allowAll: boolean,
  onChange = vi.fn(),
  value = branches[0]?.id ?? ALL_BRANCHES,
) {
  const view = renderIntl(
    <FormatProvider locale="en" profile="app">
      <BranchSwitcher
        branches={branches}
        value={value}
        userId={userId}
        allowAll={allowAll}
        onChange={onChange}
      />
    </FormatProvider>,
  );
  return { onChange, view };
}

const trigger = () => screen.getByRole('button', { name: /Point|All branches/ });
const openMenu = () => {
  fireEvent.pointerDown(trigger(), { button: 0, pointerType: 'mouse' });
};
const options = () => screen.getAllByRole('menuitemradio').map((item) => item.textContent);

describe('BranchSwitcher', () => {
  beforeEach(() => {
    search = new URLSearchParams();
    window.localStorage.clear();
    window.history.replaceState(null, '', '/dev/ui?lang=en&as=admin');
  });
  afterEach(() => vi.restoreAllMocks());

  it('Scenario: Branch switcher follows the scope — Ma Hnin: Point 3.0 only; U Kyaw Zin: all four choices', () => {
    renderSwitcher('manager', MANAGER, false);
    openMenu();
    expect(options()).toEqual(['Point 3.0']);
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
  });

  it('U Kyaw Zin sees All branches, Point 1.0, Point 2.0 and Point 3.0', () => {
    renderSwitcher('admin', ADMIN, true);
    openMenu();
    expect(options()).toEqual(['All branches', 'Point 1.0', 'Point 2.0', 'Point 3.0']);
  });

  it('Scenario: The branch choice is in the address — branch=B3, other parameters kept', () => {
    const { onChange } = renderSwitcher('admin', ADMIN, true, vi.fn(), ALL_BRANCHES);
    openMenu();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Point 3.0' }));
    expect(window.location.search).toBe('?lang=en&as=admin&branch=B3');
    expect(onChange).toHaveBeenLastCalledWith('B3');
    expect(trigger().textContent).toBe('Point 3.0');
  });

  it('opening an address with branch=B3 shows Point 3.0 and reports it', () => {
    search = new URLSearchParams('branch=B3');
    const { onChange } = renderSwitcher('admin', ADMIN, true, vi.fn(), ALL_BRANCHES);
    expect(trigger().textContent).toBe('Point 3.0');
    expect(onChange).toHaveBeenCalledWith('B3');
  });

  it('an address branch outside the scope is ignored', () => {
    search = new URLSearchParams('branch=B1');
    const { onChange } = renderSwitcher('manager', MANAGER, false);
    expect(trigger().textContent).toBe('Point 3.0');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Scenario: The choice is remembered per user — manager Point 3.0, admin Point 2.0 again', () => {
    const first = renderSwitcher('admin', ADMIN, true, vi.fn(), ALL_BRANCHES);
    openMenu();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Point 2.0' }));
    first.view.unmount();
    search = new URLSearchParams();

    const manager = renderSwitcher('manager', MANAGER, false);
    expect(trigger().textContent).toBe('Point 3.0');
    manager.view.unmount();

    const { onChange } = renderSwitcher('admin', ADMIN, true, vi.fn(), ALL_BRANCHES);
    expect(trigger().textContent).toBe('Point 2.0');
    expect(onChange).toHaveBeenCalledWith('B2');
    expect(window.localStorage.getItem('point.branch.admin')).toBe('"B2"');
  });

  it('All branches is written as branch=all and offered only with allowAll', () => {
    renderSwitcher('admin', ADMIN, true, vi.fn(), 'B1');
    openMenu();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'All branches' }));
    expect(new URLSearchParams(window.location.search).get('branch')).toBe('all');
  });
});
