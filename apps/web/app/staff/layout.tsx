import type { ReactNode } from 'react';

import { RootLayout } from '../root-layout';

// Root layout of the staff tree (`app.<domain>` — ADR-001 · design D1).
export default function StaffLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <RootLayout tree="staff">{children}</RootLayout>;
}
