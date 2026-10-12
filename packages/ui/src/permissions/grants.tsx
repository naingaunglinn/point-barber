'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import {
  createCan,
  type Can,
  type CanOptions,
  type MeGrants,
  type PermissionCatalogue,
} from '@point/shared';

import { BlockedReasonProvider } from './blocked-reason';

// GrantsProvider and PermissionGate (AD-PERM-02 · AD-PERM-03 · AD-PERM-05 · design D7), bound to a
// permission catalogue so that a code outside it does not compile (D-ROLE-08):
// `add-foundation-auth-access` binds the real catalogue once (`createGrants(PERMISSIONS)`, in a
// 'use client' module — it creates a React context), the catalogue page binds the seven-code fixture
// catalogue (catalogue/fixture-grants.tsx). The provider holds the `/me` slice; the gate
// shows its children only when can() is true. They only shape the UI — the API checks every request.
// `blocked = { reason }` disables the `Button`s below the gate (with the reason under each); a control
// that is not a Button does not read it — gate such a control with `blocked = 'hidden'` and a LockBanner.

/** A held permission the record's state forbids: disabled with the reason, or hidden (a LockBanner says why). */
export type Blocked = { readonly reason: string } | 'hidden';

export type PermissionGateProps<C extends PermissionCatalogue, K extends keyof C & string> = {
  readonly code: K;
  readonly children: ReactNode;
  readonly blocked?: Blocked;
  /** Shown instead when can() is false; default nothing. */
  readonly fallback?: ReactNode;
} & CanOptions<C[K]['level']>;

export function createGrants<const C extends PermissionCatalogue>(catalogue: C) {
  const bind = createCan(catalogue);
  const GrantsContext = createContext<Can<C> | null>(null);

  function GrantsProvider({
    me,
    children,
  }: {
    readonly me: MeGrants;
    readonly children: ReactNode;
  }) {
    const can = useMemo(() => bind(me), [me]);
    return <GrantsContext.Provider value={can}>{children}</GrantsContext.Provider>;
  }

  function useCan(): Can<C> {
    const can = useContext(GrantsContext);
    if (can === null)
      throw new Error('useCan() and PermissionGate need a GrantsProvider above them');
    return can;
  }

  function PermissionGate<K extends keyof C & string>(props: PermissionGateProps<C, K>) {
    const { code, children, blocked, fallback = null, ...options } = props;
    const can = useCan() as (code: string, options?: object) => boolean;
    if (!can(code, options)) return <>{fallback}</>;
    if (blocked === 'hidden') return null;
    if (blocked !== undefined) {
      return <BlockedReasonProvider value={blocked.reason}>{children}</BlockedReasonProvider>;
    }
    return <>{children}</>;
  }

  return { GrantsProvider, PermissionGate, useCan };
}
