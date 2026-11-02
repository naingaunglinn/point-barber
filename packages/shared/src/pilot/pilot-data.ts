import { z } from 'zod';

import { emailSchema } from '../schemas/auth.js';
import { wireAmount } from '../schemas/wire.js';

// The pilot data file of add-pilot-data-seed (design D1 · owner answer S16 · P1.BR.02 · D-PLT-04 ·
// P4-RULE-19): the owner's branch, people, services, prices and KBZPay reference pattern, read by the
// operator command `pilot-seed` from standard input. Every object is strict (an unknown key is an
// error), and the cross-field rules give the JSON path of the entry they refuse. An address on the
// reserved `.test` domain is the development fixture's signature (D-PLT-11 · design D4.1).

const text = (max: number) => z.string().trim().min(1).max(max);
/** A whole amount in kyat, 0 allowed (a free service) — the API's wire amount. */
const amount = wireAmount;

const pilotEmail = emailSchema.refine((email) => !email.endsWith('.test'), {
  message: 'a .test address is the development fixture (D-PLT-11)',
});

const branchSchema = z.strictObject({
  code: z.string().regex(/^[A-Z0-9]{1,10}$/),
  name_mm: text(255),
  name_en: text(255).optional(),
  phone: text(50).optional(),
  address_mm: text(1000).optional(),
  address_en: text(1000).optional(),
});

const personSchema = z.strictObject({
  employee_code: text(100),
  email: pilotEmail,
  name_mm: text(255),
  name_en: text(255).optional(),
  join_date: z.iso.date().optional(),
  /** A branch-scope seed role (PD4 ★): company admins come only from `admin-create`. */
  role: z.enum(['Barber', 'Manager']),
  /** The services this person may perform; every service of the file when absent (PD1 ★). */
  services: z.array(text(200)).optional(),
});

const barberPriceSchema = z.strictObject({ employee_code: text(100), price: amount });

const serviceSchema = z.strictObject({
  name_mm: text(200),
  name_en: text(200).optional(),
  duration_minutes: z.int().min(1),
  price: amount,
  barber_prices: z.array(barberPriceSchema).optional(),
});

const categorySchema = z.strictObject({
  name_mm: text(150),
  name_en: text(150).optional(),
  services: z.array(serviceSchema).min(1),
});

const compiles = (pattern: string): boolean => {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
};

const kbzpaySchema = z
  .strictObject({
    reference_regex: text(200).refine(compiles, { message: 'not a regular expression' }),
    /** References from real KBZPay slips: each must match, so the pattern is checked before use. */
    examples: z.array(z.string()).min(1),
  })
  .superRefine((value, ctx) => {
    if (!compiles(value.reference_regex)) return;
    // The same test as payment add (P4-RULE-19 · payments.ts).
    const pattern = new RegExp(value.reference_regex);
    value.examples.forEach((example, index) => {
      if (!pattern.test(example)) {
        ctx.addIssue({
          code: 'custom',
          path: ['examples', index],
          message: 'does not match reference_regex',
        });
      }
    });
  });

/** The first index of each value that repeats, as [index of the repeat, value]. */
function repeats<T>(values: readonly T[]): [number, T][] {
  const seen = new Set<T>();
  const found: [number, T][] = [];
  values.forEach((value, index) => {
    if (seen.has(value)) found.push([index, value]);
    seen.add(value);
  });
  return found;
}

export const PilotDataSchema = z
  .strictObject({
    branch: branchSchema,
    people: z.array(personSchema).min(1),
    categories: z.array(categorySchema).min(1),
    kbzpay: kbzpaySchema.optional(),
  })
  .superRefine((data, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });

    for (const [index] of repeats(data.people.map((person) => person.employee_code))) {
      issue(['people', index, 'employee_code'], 'the code is given twice');
    }
    for (const [index] of repeats(data.people.map((person) => person.email))) {
      issue(['people', index, 'email'], 'the address is given twice');
    }
    for (const [index] of repeats(data.categories.map((category) => category.name_mm))) {
      issue(['categories', index, 'name_mm'], 'the category is given twice');
    }

    const services = data.categories.flatMap((category, c) =>
      category.services.map((service, s) => ({ service, path: ['categories', c, 'services', s] })),
    );
    for (const [index] of repeats(services.map(({ service }) => service.name_mm))) {
      issue([...(services[index]?.path ?? []), 'name_mm'], 'the service is given twice');
    }

    const codes = new Set(data.people.map((person) => person.employee_code));
    for (const { service, path } of services) {
      const priced = new Set<string>();
      service.barber_prices?.forEach((price, index) => {
        const at = [...path, 'barber_prices', index, 'employee_code'];
        if (!codes.has(price.employee_code)) issue(at, 'no person of the file has this code');
        if (priced.has(price.employee_code)) issue(at, 'one barber price per person');
        priced.add(price.employee_code);
      });
    }

    const names = new Set(services.map(({ service }) => service.name_mm));
    data.people.forEach((person, p) => {
      person.services?.forEach((name, index) => {
        if (!names.has(name)) {
          issue(['people', p, 'services', index], 'no service of the file has this name');
        }
      });
    });
  });

export type PilotData = z.output<typeof PilotDataSchema>;
export type PilotPerson = PilotData['people'][number];
export type PilotService = PilotData['categories'][number]['services'][number];
