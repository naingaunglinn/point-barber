'use client';

import { useCan } from '../session/grants';

// add-customer-management — who reaches what on the customer screens (AD-PERM-02 · AD-PERM-03 · API-PERM-07 ·
// ADR-012 · design D11): `customer.*` is a shared-level family, so a code held at any branch reaches every
// customer (the history inside is cut to the caller's read scope by the API). The screens never show a
// control the API refuses; the API checks every request.

/** The four customer codes (permissions.json): any of them opens the list and a customer's page. */
export const CUSTOMER_CODES = [
  'customer.view',
  'customer.create',
  'customer.update',
  'customer.delete',
] as const;

export interface CustomerAccess {
  /** Any customer code (customer.view⁺): the menu item, the list and a customer's page. */
  readonly any: boolean;
  /** `customer.create`: Add customer and /customers/new. */
  readonly create: boolean;
  /** `customer.update`: the Edit sheet. */
  readonly update: boolean;
  /** `customer.delete`: Deactivate, Re-activate, Archive and Restore. */
  readonly remove: boolean;
}

export function useCustomerAccess(): CustomerAccess {
  const can = useCan();
  return {
    any: CUSTOMER_CODES.some((code) => can(code)),
    create: can('customer.create'),
    update: can('customer.update'),
    remove: can('customer.delete'),
  };
}
