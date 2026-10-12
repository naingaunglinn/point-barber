import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { CalendarDays, House, Settings, ShoppingBag } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { DESKTOP, TABLET } from '../../hooks/use-min-width';
import { AppShell, type ShellModule } from './AppShell';

// ui-foundation "The app shell changes its layout at 768 px and 1024 px" (AD-VIS-10 · AD-LAY-01 ·
// AD-LAY-02 · AD-LAY-03 · AD-VIS-11 · AD-VIS-07 · design D10). jsdom applies no CSS: these tests pin the
// class contract (`md:` = 768 px, `lg:` = 1024 px); the real widths 767 / 768 / 1023 / 1024 are checked
// in a browser on the catalogue (task 11.17).
const NAV: readonly ShellModule[] = [
  { key: 'home', label: 'Home', icon: <House />, href: '/home' },
  { key: 'calendar', label: 'Calendar', icon: <CalendarDays />, href: '/calendar' },
  {
    key: 'sales',
    label: 'Sales',
    icon: <ShoppingBag />,
    href: '/sales',
    items: [
      { key: 'visits', label: 'Visits', href: '/sales/visits' },
      { key: 'sales', label: 'Sales list', href: '/sales/list' },
      { key: 'refunds', label: 'Refunds', href: '/sales/refunds' },
    ],
  },
  { key: 'settings', label: 'Settings', icon: <Settings />, href: '/settings' },
];
// Slot stand-ins: the shell only places them.
const [BRANCH, TITLE, BELL, LANGUAGE, USER, CONTENT, BREADCRUMB] = [
  'Point 3.0',
  'Sales list',
  'Notifications',
  'MM',
  'U Kyaw Zin',
  'content',
  'Sales / Sales list',
];
const SLOTS = {
  branchSwitcher: <button type="button">{BRANCH}</button>,
  title: TITLE,
  search: <input type="search" />,
  bell: <button type="button">{BELL}</button>,
  language: <button type="button">{LANGUAGE}</button>,
  userMenu: <button type="button">{USER}</button>,
  bottomNav: <nav data-slot="bottom-nav" />,
};

function renderShell() {
  return render(
    <AppShell nav={NAV} activeKey="sales" activeItemKey="sales" {...SLOTS}>
      <p>{CONTENT}</p>
    </AppShell>,
  );
}

const slot = (name: string) => document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
const classes = (name: string) => slot(name).className.split(/\s+/);

describe('AppShell', () => {
  it('md and lg are 768 and 1024 px: tokens.css does not change the Tailwind breakpoints', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const tokens = readFileSync(join(here, '../../../tokens.css'), 'utf8');
    expect(tokens).not.toMatch(/--breakpoint-/);
    expect([TABLET, DESKTOP]).toEqual([48 * 16, 64 * 16]);
  });

  it('Scenario: Layout at the breakpoints — rail from 768, sub-navigation from 1024, bottom navigation below 768', () => {
    renderShell();
    expect(classes('rail')).toEqual(expect.arrayContaining(['hidden', 'md:flex', 'w-16']));
    expect(classes('sub-nav')).toEqual(expect.arrayContaining(['hidden', 'lg:flex', 'w-60']));
    expect(classes('bottom-nav-area')).toContain('md:hidden');
    expect(classes('sub-tabs')).toEqual(
      expect.arrayContaining(['hidden', 'md:block', 'lg:hidden']),
    );
  });

  it('the top bar holds branch switcher · title · search · bell · language · user menu, in that order', () => {
    renderShell();
    expect(
      [...slot('top-bar').children].map((child) => (child as HTMLElement).dataset.slot),
    ).toEqual(['top-branch', 'top-title', 'top-search', 'top-bell', 'top-language', 'top-user']);
    // Below 768 px: title, branch chip, bell (AD-LAY-03); search, language and user menu move away.
    expect(classes('top-title')).toContain('order-1');
    expect(classes('top-branch')).toContain('order-2');
    expect(classes('top-bell')).toContain('order-3');
    for (const name of ['top-search', 'top-language', 'top-user']) {
      expect(classes(name)).toEqual(expect.arrayContaining(['hidden', 'md:block']));
    }
  });

  it('content padding: 16 px gutter below 768 px, 24 px from 768 px (AD-VIS-07)', () => {
    renderShell();
    expect(classes('content')).toEqual(expect.arrayContaining(['px-4', 'md:p-6']));
  });

  it('rail items are icon-only, named by their labels; the active module is marked (AD-VIS-11 v1.8)', () => {
    renderShell();
    const rail = slot('rail');
    for (const link of within(rail).getAllByRole('link')) {
      expect(link.querySelector('svg')).not.toBeNull();
      expect(link.querySelector('.sr-only')?.textContent).not.toBe('');
      const shown = link.cloneNode(true) as HTMLElement;
      shown.querySelectorAll('.sr-only, [data-slot="count-badge"]').forEach((el) => el.remove());
      expect(shown.textContent?.trim()).toBe('');
    }
    expect(within(rail).getByRole('link', { name: 'Sales' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('a rail badge is read with the module name', () => {
    render(
      <AppShell nav={[{ ...NAV[0], badge: 4 } as ShellModule, ...NAV.slice(1)]} activeKey="home">
        <p>{CONTENT}</p>
      </AppShell>,
    );
    expect(within(slot('rail')).getByRole('link', { name: 'Home 4' })).toBeDefined();
  });

  it('from 768 px the breadcrumb names the page; the title stays for the phone app bar', () => {
    render(
      <AppShell nav={NAV} activeKey="home" title={TITLE} breadcrumb={BREADCRUMB}>
        <p>{CONTENT}</p>
      </AppShell>,
    );
    expect(screen.getByText(TITLE).className).toContain('md:hidden');
    expect(screen.getByText(BREADCRUMB).className).toEqual(expect.stringContaining('md:block'));
  });

  it('a rail item shows its label as a tooltip on focus', async () => {
    renderShell();
    await act(async () => {
      fireEvent.focus(within(slot('rail')).getByRole('link', { name: 'Calendar' }));
    });
    expect(screen.getByRole('tooltip').textContent).toBe('Calendar');
  });

  it('the sub-navigation lists the screens of the active module and collapses', () => {
    renderShell();
    const subNav = slot('sub-nav');
    const toggle = within(subNav).getByRole('button', { name: 'Sales' });
    expect(
      within(subNav).getByRole('link', { name: 'Sales list' }).getAttribute('aria-current'),
    ).toBe('page');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(subNav.querySelector('ul')?.hidden).toBe(true);
    expect(subNav.className).toContain('w-14');
    fireEvent.click(toggle);
    expect(subNav.className).toContain('w-60');
  });

  it('a module without screens has no sub-navigation', () => {
    render(
      <AppShell nav={NAV} activeKey="home">
        <p>{CONTENT}</p>
      </AppShell>,
    );
    expect(slot('sub-nav')).toBeNull();
    expect(slot('sub-tabs')).toBeNull();
  });
});
