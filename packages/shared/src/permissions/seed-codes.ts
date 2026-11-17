// The Part 4 codes of the seed roles (API Part 4 §9 · D-ROLE-07 · D-ROLE-09 · add-walkin-visit-checkout
// task 1.4), the Part 2 schedule codes of the Manager (API Part 2 §12 · add-schedule-patterns task
// 1.3) and its Part 8 website codes (API Part 8 §14 · add-website-management task 1.2): the API's base
// seed gives them to the Manager and Barber roles it creates, and the development fixture modules 090
// and 310 add the Part 4 and schedule codes to roles created before. This file imports nothing:
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

/**
 * Manager — the two schedule codes of add-schedule-patterns (Part 2 §12: Admin; Manager); the Barber
 * seed role gets none. `schedule.create` / `schedule.delete` come with add-schedule-roster.
 */
export const MANAGER_SCHEDULE_CODES = ['schedule.view', 'schedule.update'] as const;

/**
 * Part 3 §7 (owner #9 · add-customer-management task 1.3): the Manager reads, adds and edits customers,
 * the Barber reads and adds them; `customer.delete` stays with the Admin. Fixture module 170 adds them
 * to roles created before Part 3.
 */
export const MANAGER_PART3_CUSTOMER_CODES = [
  'customer.view',
  'customer.create',
  'customer.update',
] as const;
export const BARBER_PART3_CUSTOMER_CODES = ['customer.view', 'customer.create'] as const;

/**
 * Manager — the two website codes of add-website-management (Part 8 §14: Admin; Manager — branch
 * scope reaches its own branches' hours and closures, owner F7); the Barber seed role gets none.
 */
export const MANAGER_WEBSITE_CODES = ['website.view', 'website.update'] as const;
