import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type SettingKey,
  type SettingView,
  isSettingKey,
  settingEntry,
  valueSchema,
} from '@point/shared';

import type { GrantSet } from '../../../common/access/grant-set.js';
import { TransactionRunner } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { RequestContext } from '../../../common/http/request-context.js';
import { toFieldErrors } from '../../../common/http/zod-issues.js';
import { SettingBranches } from './ports.js';
import { SettingsReader } from './settings-reader.js';
import { SettingsStore } from './settings-store.js';
import { SettingsWrites } from './settings-writes.js';

// P1.SET.03 / P1.SET.04 — set and reset a company value or a branch override (P1-RULE-08 · P1-RULE-13 ·
// owner SS4 · design D5 – D7). The access guard has decided `settings.update` for the company master or
// the branch; the service then checks, in this order: the key is in settings.json (404) · the key is
// not read-only (400 setting_scope — system.maintenance, and the tax and service-charge switches until
// add-tax-service-charge) · a branch override is only for a branch-scoped key (400 setting_scope) · the
// branch exists (404) · the value passes its schema (400 validation at `value`, `value.mm`, `value.en`).
// One transaction per write; the answer is the key's SettingView after it.

const notFound = () => new ProblemException(ErrorCode.NOT_FOUND, 404);
const settingScope = () => new ProblemException(ErrorCode.SETTING_SCOPE, 400);

function actor(): string {
  const userId = RequestContext.current()?.user_id;
  if (userId === undefined) throw new ProblemException(ErrorCode.UNAUTHENTICATED, 401);
  return userId;
}

@Injectable()
export class SettingsCommands {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly writes: SettingsWrites,
    private readonly store: SettingsStore,
    private readonly branches: SettingBranches,
    private readonly reader: SettingsReader,
  ) {}

  /** P1.SET.03. */
  async set(
    grants: GrantSet,
    key: string,
    body: { readonly value: unknown; readonly branch_id?: string | null },
  ): Promise<SettingView> {
    const branchId = body.branch_id ?? null;
    const known = await this.writable(key, branchId);
    const actorUserId = actor();
    await this.runner.run(async (tx) => {
      // The value passes its schema, with the effective value of any bounding key read in this
      // transaction (design D9 · owner CM3: customer.preferred_barber_min_visits ≤ _window).
      const parsed = valueSchema(settingEntry(known), await this.boundsOf(known)).safeParse(
        body.value,
      );
      if (!parsed.success) {
        throw new ProblemException(ErrorCode.VALIDATION, 400, {
          errors: toFieldErrors(
            parsed.error.issues.map((issue) => ({ ...issue, path: ['value', ...issue.path] })),
          ),
        });
      }
      await this.writes.write(tx, {
        key: known,
        value: parsed.data,
        branchId,
        action: 'settings.set',
        actorUserId,
      });
    });
    return this.store.view(grants, known, branchId ?? undefined);
  }

  /** P1.SET.04. */
  async reset(
    grants: GrantSet,
    key: string,
    body: { readonly branch_id?: string | null } | undefined,
  ): Promise<SettingView> {
    const branchId = body?.branch_id ?? null;
    const known = await this.writable(key, branchId);
    const actorUserId = actor();
    await this.runner.run((tx) =>
      this.writes.reset(tx, { key: known, branchId, action: 'settings.reset', actorUserId }),
    );
    return this.store.view(grants, known, branchId ?? undefined);
  }

  /** The effective company values of the keys that bound `key` (`min_key` / `max_key`). */
  private async boundsOf(key: SettingKey): Promise<Record<string, unknown>> {
    const { validation } = settingEntry(key) as {
      validation: { min_key?: string; max_key?: string };
    };
    const keys = [validation.min_key, validation.max_key].filter(
      (bound): bound is SettingKey => bound !== undefined && isSettingKey(bound),
    );
    return keys.length === 0 ? {} : { ...(await this.reader.effective(keys)) };
  }

  /** The checks of design D5 before the value: the key, read-only, the scope, the branch. */
  private async writable(key: string, branchId: string | null): Promise<SettingKey> {
    if (!isSettingKey(key)) throw notFound();
    const entry = settingEntry(key);
    if ('read_only' in entry && entry.read_only) throw settingScope();
    if (branchId !== null) {
      if (entry.scope !== 'branch') throw settingScope();
      if (!(await this.branches.exists(branchId))) throw notFound();
    }
    return key;
  }
}
