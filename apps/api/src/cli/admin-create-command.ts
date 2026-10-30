import { parseArgs } from 'node:util';

import type { INestApplicationContext } from '@nestjs/common';
import { emailSchema } from '@point/shared';
import { z } from 'zod';

import { TransactionRunner } from '../common/database/transaction-runner.js';
import { FirstAdmin, FirstAdminRefused } from '../modules/people/index.js';

// `admin-create` — the first company admin of an environment (P1-RULE-14 · D-EMP-03 · design D10):
//   node dist/cli/admin-create.js --email <e> --name-mm <n> --code <c> [--name-en <n>]
// `--code` is required: employees.employee_code is NOT NULL and the code generator of P1.EMP.02 has no
// locked format yet. Returns the exit status and the one line to print; any refusal changes nothing.

const argsSchema = z.object({
  email: emailSchema,
  'name-mm': z.string().trim().min(1).max(255),
  'name-en': z.string().trim().min(1).max(255).optional(),
  code: z.string().trim().min(1).max(100),
});

export interface CommandResult {
  readonly status: 0 | 1;
  readonly message: string;
}

const refuse = (message: string): CommandResult => ({
  status: 1,
  message: `admin-create: ${message}`,
});

export async function adminCreate(
  app: INestApplicationContext,
  argv: readonly string[],
  operator: string,
): Promise<CommandResult> {
  let values: Record<string, unknown>;
  try {
    values = parseArgs({
      args: [...argv],
      options: {
        email: { type: 'string' },
        'name-mm': { type: 'string' },
        'name-en': { type: 'string' },
        code: { type: 'string' },
      },
      strict: true,
    }).values;
  } catch (error) {
    return refuse(error instanceof Error ? error.message : String(error));
  }
  const parsed = argsSchema.safeParse(values);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => {
      const name = `--${String(issue.path[0])}`;
      return values[String(issue.path[0])] === undefined
        ? `${name} is required`
        : `${name} is invalid`;
    });
    return refuse(`${problems.join('; ')} (P1-RULE-14)`);
  }
  const args = parsed.data;
  try {
    await app.get(TransactionRunner).run((tx) =>
      app.get(FirstAdmin).create(tx, {
        email: args.email,
        nameMm: args['name-mm'],
        code: args.code,
        operator,
        ...(args['name-en'] === undefined ? {} : { nameEn: args['name-en'] }),
      }),
    );
  } catch (error) {
    if (error instanceof FirstAdminRefused) return refuse(error.message);
    throw error;
  }
  return {
    status: 0,
    message: `admin-create: ${args.code} created (INVITED) with the Admin role at company scope — ask ${args.email} to sign in`,
  };
}
