import { Injectable } from '@nestjs/common';
import { type SettingKey, settingDefault } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { DomainEvents } from '../../../common/events/domain-events.js';
import { uuidV7 } from '../../../common/http/uuid-v7.js';
import { Clock } from '../../../common/clock/clock.js';
import { Audit } from '../audit/audit.service.js';
import { SettingsRepository } from '../repositories/settings.repository.js';
import { CompanyOfSettings } from './ports.js';
import { sameValue } from './resolve.js';
import { SettingsReader } from './settings-reader.js';

// The write path of the settings store (P1-RULE-08 · P1-RULE-10 · API-AUD-01 · API-IDEM-02 · design
// D6): inside the caller's transaction, the stored row is locked, a value equal to it writes nothing
// (Audit.skip, no event), and a new value is upserted — the trigger `settings_history_trg` writes the
// history — with one audit row `{ key, branch_id, value }` before and after, and `settings.changed`
// collected for delivery after the commit. `write` makes no read-only check: P1.SYS.03 (and later the
// restore of P8.BAK.03) writes `system.maintenance` through it. `reset` (P1.SET.04 · design D7) updates
// an existing row to its parent value — the company effective value for a branch row, the default for
// the company row — and never inserts or deletes one. It lives beside the audit writer in
// PlatformModule, whose instance carries the people module's rules.

export interface SettingWriteRequest {
  readonly key: SettingKey;
  /** The parsed value (valueSchema of the entry). */
  readonly value: unknown;
  /** The branch of an override; null for the company value. */
  readonly branchId: string | null;
  /** The audit action the endpoint declares with @Audited. */
  readonly action: string;
  readonly actorUserId: string;
}

/** A reset: the row of `key` for the company (`branchId` null) or one branch. */
export type SettingResetRequest = Omit<SettingWriteRequest, 'value'>;

export interface SettingWriteResult {
  /** The value was stored (false: it was already the stored value). */
  readonly changed: boolean;
}

@Injectable()
export class SettingsWrites {
  constructor(
    private readonly repository: SettingsRepository,
    private readonly company: CompanyOfSettings,
    private readonly reader: SettingsReader,
    private readonly audit: Audit,
    private readonly events: DomainEvents,
    private readonly clock: Clock,
  ) {}

  async write(tx: Tx, request: SettingWriteRequest): Promise<SettingWriteResult> {
    const companyId = await this.companyId();
    const { key, value, branchId } = request;
    const stored = await this.repository.lockRow(tx, companyId, key, branchId);
    if (stored !== null && sameValue(stored.value, value)) {
      this.audit.skip();
      return { changed: false };
    }
    const at = this.clock.now();
    const written = await this.repository.upsert(tx, {
      id: uuidV7(at.getTime()),
      company_id: companyId,
      branch_id: branchId,
      key,
      value,
      actor_user_id: request.actorUserId,
      at,
    });
    if (written === null) {
      // A concurrent first write committed the same value while this one waited on the index.
      this.audit.skip();
      return { changed: false };
    }
    await this.changed(request, written.id, stored === null ? null : stored.value, value);
    return { changed: true };
  }

  async reset(tx: Tx, request: SettingResetRequest): Promise<SettingWriteResult> {
    const companyId = await this.companyId();
    const { key, branchId } = request;
    const stored = await this.repository.lockRow(tx, companyId, key, branchId);
    if (stored === null) {
      this.audit.skip();
      return { changed: false };
    }
    // Read inside the transaction (the repository reads through it), after the row lock.
    const parent =
      branchId === null ? settingDefault(key) : (await this.reader.effective([key]))[key];
    if (sameValue(stored.value, parent)) {
      this.audit.skip();
      return { changed: false };
    }
    const updated = await this.repository.resetTo(tx, {
      company_id: companyId,
      branch_id: branchId,
      key,
      value: parent,
      actor_user_id: request.actorUserId,
      at: this.clock.now(),
    });
    if (updated === null) {
      this.audit.skip();
      return { changed: false };
    }
    await this.changed(request, updated.id, stored.value, parent);
    return { changed: true };
  }

  private async companyId(): Promise<string> {
    const companyId = await this.company.id();
    if (companyId === null)
      throw new Error('settings write before the base seed created the company');
    return companyId;
  }

  /** One audit row `{ key, branch_id, value }` before and after, and `settings.changed` after commit. */
  private async changed(
    request: SettingResetRequest,
    rowId: string,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    const { key, branchId } = request;
    await this.audit.emit({
      action: request.action,
      entity_type: 'settings',
      entity_id: rowId,
      before: { key, branch_id: branchId, value: before },
      after: { key, branch_id: branchId, value: after },
      branch_id: branchId,
    });
    this.events.collect({ name: 'settings.changed', payload: { key, branch_id: branchId } });
  }
}
