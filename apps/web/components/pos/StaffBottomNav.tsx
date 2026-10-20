'use client';

import { CalendarCheck, Plus } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { BottomNav } from '@point/ui';

import { useOpenVisits } from '../../lib/pos/queries';

// The staff bottom navigation of this change (AD-NAV-03 · AD-NAV-01 · add-walkin-visit-checkout task
// 10.1): Today with the number of open visits as its badge, and the centre ＋ Start (arrival → START).
// Bookings, Customers and More come with the changes that build those screens.
export function StaffBottomNav() {
  const t = useTranslations('today');
  const router = useRouter();
  const pathname = usePathname();
  const open = useOpenVisits();
  const count = open.data?.length ?? 0;
  return (
    <BottomNav
      activeKey={pathname.startsWith('/today') ? 'today' : undefined}
      items={[
        {
          key: 'today',
          label: t('title'),
          icon: <CalendarCheck />,
          href: '/today',
          ...(count > 0 ? { badge: count } : {}),
        },
      ]}
      centre={{ label: t('nav.start'), icon: <Plus />, onPress: () => router.push('/visits/new') }}
    />
  );
}
