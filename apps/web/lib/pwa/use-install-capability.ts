'use client';

import { useEffect } from 'react';

import { startInstallCapability } from './install-capability';

/** Listens for `beforeinstallprompt` while the component is mounted (design D6 · task 3.2). */
export function useInstallListener(): void {
  useEffect(() => startInstallCapability(), []);
}
