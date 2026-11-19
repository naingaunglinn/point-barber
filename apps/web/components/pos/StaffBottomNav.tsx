'use client';

import { CalendarCheck, Menu, Plus, Settings } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { BottomNav, type ShellModule } from '@point/ui';

import { useOpenVisits } from '../../lib/pos/queries';
import { settingsScreenOf, useSettingsScreens } from '../settings/settings-nav';

// The staff navigation of this change (AD-NAV-01 / 02 / 03 · add-walkin-visit-checkout task 10.1): on a
// phone the bottom navigation — Today with the number of open visits as its badge, the centre ＋ Start
// (arrival → START) and More, the last item (owner 28/Oct/2026: the user's name, MM / EN and Sign out,
// which the phone's top bar does not carry); from 768 px the rail's one item, Today, the first screen of
// the Sales group (design D11 reading), and the top bar's user menu. Bookings and Customers come with the
// changes that build them. Settings is the rail's last module (AD-NAV-03 · add-company-profile design
// D8): it opens its first screen the user may see, and its screens are the sub-navigation; it is not
// there when the user may see none.

/** The rail of the signed-in area, its active module and the active screen of that module. */
export function useStaffRail(): {
  nav: ShellModule[];
  activeKey: string | undefined;
  activeItemKey: string | undefined;
} {
  const t = useTranslations('today');
  const tSettings = useTranslations('settings.nav');
  const pathname = usePathname();
  const count = useOpenVisits().data?.length ?? 0;
  const settings = useSettingsScreens();
  const [firstSetting] = settings;
  const setting = settingsScreenOf(settings, pathname);
  return {
    nav: [
      {
        key: 'today',
        label: t('title'),
        icon: <CalendarCheck />,
        href: '/today',
        ...(count > 0 ? { badge: count } : {}),
      },
      ...(firstSetting === undefined
        ? []
        : [
            {
              key: 'settings',
              label: tSettings('title'),
              icon: <Settings />,
              href: firstSetting.href,
              items: settings,
            },
          ]),
    ],
    activeKey: pathname.startsWith('/today')
      ? 'today'
      : setting !== undefined
        ? 'settings'
        : undefined,
    activeItemKey: setting?.key,
  };
}

export function StaffBottomNav() {
  const t = useTranslations('today');
  const tAction = useTranslations('common.action');
  const router = useRouter();
  const pathname = usePathname();
  const open = useOpenVisits();
  const count = open.data?.length ?? 0;
  return (
    <BottomNav
      activeKey={
        pathname.startsWith('/today') ? 'today' : pathname.startsWith('/more') ? 'more' : undefined
      }
      items={[
        {
          key: 'today',
          label: t('title'),
          icon: <CalendarCheck />,
          href: '/today',
          ...(count > 0 ? { badge: count } : {}),
        },
        { key: 'more', label: tAction('more'), icon: <Menu />, href: '/more' },
      ]}
      centre={{ label: t('nav.start'), icon: <Plus />, onPress: () => router.push('/visits/new') }}
    />
  );
}
