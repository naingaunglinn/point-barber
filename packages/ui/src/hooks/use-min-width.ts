'use client';

import { useSyncExternalStore } from 'react';

// The layout mode of a component (AD-VIS-10 · design D10): true from `px` wide. The server and the
// first client render assume the phone layout; the browser answers right after hydration.
export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`;
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** 768 px: the phone layout below, the tablet / desktop layout from here (AD-VIS-10). */
export const TABLET = 768;
/** 1024 px: the sub-navigation panel and the page-size menu appear (AD-LAY-02 · AD-LIST-05). */
export const DESKTOP = 1024;
