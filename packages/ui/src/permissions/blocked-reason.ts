'use client';

import { createContext, useContext } from 'react';

// The reason a held permission cannot be used right now (AD-PERM-02 · AD-DET-03 · design D7):
// PermissionGate provides it, Button reads it and renders itself disabled with the reason as helper
// text linked by `aria-describedby`.

const BlockedReasonContext = createContext<string | null>(null);

export const BlockedReasonProvider = BlockedReasonContext.Provider;

/** The reason of the nearest blocked PermissionGate, or `null`. */
export const useBlockedReason = (): string | null => useContext(BlockedReasonContext);
