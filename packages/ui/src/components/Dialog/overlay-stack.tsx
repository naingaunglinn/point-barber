'use client';

import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from 'react';

// The overlay rule of AD-CMP-08 (design D10): no more than one dialog may be open above a drawer. A
// drawer gives its content this context; a dialog inside registers while it is open, and a second one
// throws during render. It throws in every build: packages/ui does not read the build mode
// (process.env is read only by apps/web/env.ts), and the error is a programming error either way.

interface DrawerLayer {
  readonly dialogs: Set<string>;
}

const DrawerLayerContext = createContext<DrawerLayer | null>(null);

export function DrawerLayerProvider({ children }: Readonly<{ children: ReactNode }>) {
  const layer = useRef<DrawerLayer>({ dialogs: new Set() });
  return (
    <DrawerLayerContext.Provider value={layer.current}>{children}</DrawerLayerContext.Provider>
  );
}

export const SECOND_DIALOG_ERROR =
  'AD-CMP-08: no more than one dialog may be open above a drawer — close the first dialog before opening another';

/** Registers an open dialog with the drawer below it, if any; a second open dialog throws. */
export function useDialogOverDrawer(open: boolean): void {
  const layer = useContext(DrawerLayerContext);
  const id = useId();
  if (open && layer !== null && layer.dialogs.size > 0 && !layer.dialogs.has(id)) {
    throw new Error(SECOND_DIALOG_ERROR);
  }
  useEffect(() => {
    if (!open || layer === null) return;
    // Two dialogs that open in the same commit pass the render check; the second one fails here.
    if (layer.dialogs.size > 0 && !layer.dialogs.has(id)) throw new Error(SECOND_DIALOG_ERROR);
    layer.dialogs.add(id);
    return () => {
      layer.dialogs.delete(id);
    };
  }, [open, layer, id]);
}
