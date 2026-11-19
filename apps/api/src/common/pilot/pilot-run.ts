// What the pilot surfaces of add-pilot-data-seed share (design D2 / D3): the run's plan — per table,
// the rows created, found unchanged or updated — and the refusal that ends a run with status 1. The
// command owns the run; each module's pilot surface counts its own tables into the plan and throws
// PilotRefused before or while it writes, so the run's one transaction rolls back. Deleted with the
// command (design D10).

/** The tables of a run, in the write order of design D6. */
export const PILOT_TABLES = [
  'branches',
  'users',
  'employees',
  'employee_branches',
  'employee_roles',
  'employee_role_branches',
  'service_categories',
  'services',
  'branch_services',
  'service_prices',
  'employee_service_eligibilities',
  'payment_methods',
] as const;

export type PilotTable = (typeof PILOT_TABLES)[number];

/** A refusal: one line per problem, printed on standard error; nothing is written. */
export class PilotRefused extends Error {
  override readonly name = 'PilotRefused';

  constructor(readonly problems: readonly string[]) {
    super(problems.join('\n'));
  }
}

export class PilotPlan {
  private readonly counts = new Map<
    PilotTable,
    { create: number; unchanged: number; update: number }
  >(PILOT_TABLES.map((table) => [table, { create: 0, unchanged: 0, update: 0 }]));

  created(table: PilotTable, rows = 1): void {
    this.of(table).create += rows;
  }

  unchanged(table: PilotTable, rows = 1): void {
    this.of(table).unchanged += rows;
  }

  updated(table: PilotTable, rows = 1): void {
    this.of(table).update += rows;
  }

  count(table: PilotTable): { create: number; unchanged: number; update: number } {
    return { ...this.of(table) };
  }

  /** `<table>: create <n>, unchanged <m>` — and `, update <n>` for payment_methods (design D2). */
  lines(): string[] {
    return PILOT_TABLES.map((table) => {
      const { create, unchanged, update } = this.of(table);
      const line = `${table}: create ${create}, unchanged ${unchanged}`;
      return table === 'payment_methods' ? `${line}, update ${update}` : line;
    });
  }

  private of(table: PilotTable) {
    const counts = this.counts.get(table);
    if (counts === undefined) throw new Error(`unknown pilot table ${table}`);
    return counts;
  }
}

export interface PilotRunContext {
  /** The operating-system user that ran the command (audit `after_data.operator`). */
  readonly operator: string;
  readonly plan: PilotPlan;
  /** The business date of the run (MMT): `effective_from` of every new dated row (design D7). */
  readonly businessDate: string;
  readonly now: Date;
}

/** A stored value that differs from the file (PD3 ★): table, key, column and both values. */
export function changedValue(
  table: PilotTable,
  key: string,
  column: string,
  stored: unknown,
  file: unknown,
): string {
  const show = (value: unknown) => (value === null || value === undefined ? 'none' : String(value));
  return `${table} ${key} ${column}: stored ${show(stored)}, file ${show(file)} — a stored value is never changed by this command (PD3)`;
}

/** The database `date` of a business date. */
export const dbDate = (day: string): Date => new Date(`${day}T00:00:00Z`);
