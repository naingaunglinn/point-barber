import { parseArgs } from 'node:util';

import type { INestApplicationContext } from '@nestjs/common';
import { PilotDataSchema, businessDateOf } from '@point/shared';

import { Clock } from '../common/clock/clock.js';
import { TransactionRunner } from '../common/database/transaction-runner.js';
import { RequestContext } from '../common/http/request-context.js';
import { uuidV7 } from '../common/http/uuid-v7.js';
import { PilotPlan, PilotRefused, type PilotRunContext } from '../common/pilot/pilot-run.js';
import { PilotCatalogue } from '../modules/catalog/index.js';
import { PeopleSeedLock, PilotPeople } from '../modules/people/index.js';
import { PilotPaymentMethods } from '../modules/sales/index.js';

// `pilot-seed` — the pilot branch's data from the owner's file (add-pilot-data-seed design D1 / D2 /
// D4 / D6 · owner answer S16), on the server:
//   docker compose exec -T api node dist/cli/pilot-seed.js [--apply] < /path/on/server/pilot-data.json
// The file comes on standard input only: there is no --file option, so nothing points at a path in
// the repository. Both modes run the same path — schema, refusals, the whole write in one
// transaction under the code-tables lock — and a dry run rolls back at the end, so it proves the
// apply would succeed. Exit 0 with the plan on standard output; 1 with one line per refusal on
// standard error and nothing written.

export interface PilotSeedResult {
  readonly status: 0 | 1;
  readonly stdout: readonly string[];
  readonly stderr: readonly string[];
}

/** Thrown at the end of a dry run, so the transaction rolls back before its audit rows (D2). */
class DryRunRollback extends Error {
  override readonly name = 'DryRunRollback';
}

const refuse = (lines: readonly string[]): PilotSeedResult => ({
  status: 1,
  stdout: [],
  stderr: lines.map((line) => `pilot-seed: ${line}`),
});

/** `people[1].email` — the JSON path of a schema issue. */
const jsonPath = (path: readonly PropertyKey[]): string =>
  path.length === 0
    ? '(file)'
    : path
        .map((part, index) =>
          typeof part === 'number' ? `[${part}]` : `${index === 0 ? '' : '.'}${String(part)}`,
        )
        .join('');

export async function pilotSeed(
  app: INestApplicationContext,
  argv: readonly string[],
  stdin: string,
  operator: string,
): Promise<PilotSeedResult> {
  let apply: boolean;
  try {
    apply =
      parseArgs({
        args: [...argv],
        options: { apply: { type: 'boolean' } },
        strict: true,
        allowPositionals: false,
      }).values.apply === true;
  } catch (error) {
    return refuse([
      `${error instanceof Error ? error.message : String(error)} — the only option is --apply; the file comes on standard input`,
    ]);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(stdin);
  } catch (error) {
    return refuse([
      `standard input is not JSON (${error instanceof Error ? error.message : String(error)})`,
    ]);
  }
  const parsed = PilotDataSchema.safeParse(raw);
  if (!parsed.success) {
    return refuse(parsed.error.issues.map((issue) => `${jsonPath(issue.path)}: ${issue.message}`));
  }
  const data = parsed.data;

  const now = app.get(Clock).now();
  const runId = uuidV7(now.getTime());
  const ctx: PilotRunContext = {
    operator,
    plan: new PilotPlan(),
    businessDate: businessDateOf(now),
    now,
  };
  const people = app.get(PilotPeople);
  const paymentMethods = app.get(PilotPaymentMethods);

  try {
    // One request id for every audit row of the run (design D8).
    await RequestContext.run({ request_id: runId }, () =>
      app.get(TransactionRunner).run(async (tx) => {
        // D6: the lock of the catalogue sync and the first-admin command, then the refusals of D4.
        await app.get(PeopleSeedLock).take(tx);
        await people.refuseFixture(tx);
        await paymentMethods.refuseWithoutSystemRows(tx);
        await people.preflight(tx, data);
        const { companyId, branchId, employeeIds } = await people.apply(tx, data, ctx);
        await app
          .get(PilotCatalogue)
          .apply(tx, data, { companyId, branchId, branchCode: data.branch.code, employeeIds }, ctx);
        if (data.kbzpay !== undefined) {
          await paymentMethods.setReferenceRegex(tx, 'KBZPAY', data.kbzpay.reference_regex, ctx);
        }
        if (!apply) throw new DryRunRollback();
      }),
    );
  } catch (error) {
    if (error instanceof DryRunRollback) {
      return {
        status: 0,
        stdout: [
          `pilot-seed: dry run on ${ctx.businessDate} — nothing was written`,
          ...ctx.plan.lines(),
          'pilot-seed: send the owner the summary; run again with --apply after the OK (PD5)',
        ],
        stderr: [],
      };
    }
    if (error instanceof PilotRefused) return refuse(error.problems);
    return refuse([
      `failed — nothing was written (${error instanceof Error ? error.message : String(error)})`,
    ]);
  }
  return {
    status: 0,
    stdout: [
      `pilot-seed: applied on ${ctx.businessDate} — request_id ${runId}`,
      ...ctx.plan.lines(),
    ],
    stderr: [],
  };
}
