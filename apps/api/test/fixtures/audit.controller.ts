import { randomUUID } from 'node:crypto';

import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';

import { Public } from '../../src/common/access/public.decorator.js';
import { TransactionRunner } from '../../src/common/database/transaction-runner.js';
import { Audit, Audited } from '../../src/modules/platform/index.js';

// Action fixtures of the audit spec "Each action endpoint writes one application audit row with the
// branch it acted on" (design D12 · D14). Test application only. `@Public()` until the access guard
// exists; the fixture-actor headers stand in for what the guards resolve (test/helpers/fixture-actor).
interface ActionBody {
  readonly branch_id?: string;
  readonly employee_id?: string;
  readonly reason?: string;
  readonly items?: readonly { readonly branch_id: string }[];
}

@Controller('v1/_fixtures')
export class AuditFixtureController {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly audit: Audit,
  ) {}

  /** A branch action: the guard resolves the one branch of `body.branch_id`. */
  @Post('branch-action')
  @HttpCode(200)
  @Public()
  @Audited({ actions: ['fixture.branch_action'] })
  branchAction(@Body() body: ActionBody): Promise<{ id: string }> {
    return this.act('fixture.branch_action', { reason: body.reason ?? null });
  }

  /** One request touching several branches: no single branch. */
  @Post('branch-items')
  @HttpCode(200)
  @Public()
  @Audited({ actions: ['fixture.branch_items'] })
  branchItems(@Body() body: ActionBody): Promise<{ id: string }> {
    return this.act('fixture.branch_items', { after: { items: body.items ?? [] } });
  }

  /** A company-master action: no branch. */
  @Post('company-action')
  @HttpCode(200)
  @Public()
  @Audited({ actions: ['fixture.company_action'] })
  companyAction(): Promise<{ id: string }> {
    return this.act('fixture.company_action', {});
  }

  /** The guard resolved no branch; the service passes the branch of the one entity it changed. */
  @Post('entity-action')
  @HttpCode(200)
  @Public()
  @Audited({ actions: ['fixture.entity_action'] })
  entityAction(@Body() body: ActionBody): Promise<{ id: string }> {
    return this.act('fixture.entity_action', { branch_id: body.branch_id ?? null });
  }

  /** An employee-targeted action whose endpoint names no branch (P1-RULE-11 · P1.AUTH.05). */
  @Post('employee-action')
  @HttpCode(200)
  @Public()
  @Audited({ actions: ['fixture.employee_action'], target: 'employee' })
  employeeAction(@Body() body: ActionBody): Promise<{ id: string }> {
    return this.act('fixture.employee_action', { employee_id: body.employee_id ?? null });
  }

  // The intent check (task 2.5 · CG-SEC-10 · CG-DB-06): each of these answers 500.

  /** The service runs no transaction at all. */
  @Post('audited-no-run')
  @HttpCode(200)
  @Public()
  @Audited({ actions: ['fixture.no_run'] })
  auditedNoRun(): { ok: true } {
    return { ok: true };
  }

  /** The service runs a transaction but neither emits nor skips. */
  @Post('audited-silent')
  @HttpCode(200)
  @Public()
  @Audited({ actions: ['fixture.silent'] })
  auditedSilent(): Promise<{ ok: true }> {
    return this.runner.run(() => Promise.resolve({ ok: true as const }));
  }

  /** The service emits an action the decorator does not declare. */
  @Post('audited-undeclared')
  @HttpCode(200)
  @Public()
  @Audited({ actions: ['fixture.declared'] })
  auditedUndeclared(): Promise<{ id: string }> {
    return this.act('fixture.not_declared', {});
  }

  /** The service skips: an idempotent replay passes the check and writes nothing. */
  @Post('audited-skip')
  @HttpCode(200)
  @Public()
  @Audited({ actions: ['fixture.skip'] })
  auditedSkip(): Promise<{ ok: true }> {
    return this.runner.run(() => {
      this.audit.skip();
      return Promise.resolve({ ok: true as const });
    });
  }

  /** A read: never audited. */
  @Get('branch-action')
  @Public()
  read(): { ok: true } {
    return { ok: true };
  }

  private act(
    action: string,
    extra: {
      reason?: string | null;
      branch_id?: string | null;
      employee_id?: string | null;
      after?: Record<string, unknown>;
    },
  ): Promise<{ id: string }> {
    const id = randomUUID();
    return this.runner.run(async () => {
      await this.audit.emit({ action, entity_type: 'fixtures', entity_id: id, ...extra });
      return { id };
    });
  }
}
