// The Part 4 codes of the seed roles (API Part 4 §9 · D-ROLE-07 · D-ROLE-09 · add-walkin-visit-checkout
// task 1.4): the API's base seed gives them to the Manager and Barber roles it creates, and the
// development fixture module 090 adds them to roles created before Part 4. This file imports nothing:
// db/seed/fixtures/*.mjs loads it directly with Node's type stripping.

/** Manager — branch scope; `sale.finish_override` = owner B2. */
export const MANAGER_PART4_CODES = [
  'visit.view',
  'visit.update',
  'visit.delete',
  'sale.view',
  'sale.create',
  'sale.delete',
  'sale.finish_override',
  'sale.override_price',
  'sale.late_entry',
  'payment.view',
  'payment.verify',
  'discount.view',
  'discount.approve',
] as const;

/** Barber — late entry (🔒 D-VIS-13 default) and a product sale without a service. */
export const BARBER_PART4_CODES = ['sale.late_entry', 'sale.create'] as const;
