'use client';

import { createContext, useContext } from 'react';

// The id of a demo's visible title (SectionDemos). A field a demo shows on its own is labelled by that
// title (`aria-labelledby`), so the title is the field's visible label — component checklist item 4
// (AD-A11Y-02) — without a second label that repeats it (owner, catalogue review of 12/Oct/2026).
const DemoTitleContext = createContext<string | undefined>(undefined);

export const DemoTitleProvider = DemoTitleContext.Provider;

export function useDemoTitleId(): string {
  const id = useContext(DemoTitleContext);
  if (id === undefined)
    throw new Error('useDemoTitleId() needs the DemoTitleProvider of SectionDemos');
  return id;
}
