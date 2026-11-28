import { Injectable } from '@nestjs/common';
import {
  type CategoryCreateBody,
  type CategoryOrderBody,
  type CategoryUpdateBody,
  ErrorCode,
  FieldIssueCode,
  type ServiceCategoryDto,
  toMmtIso,
} from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import { type Tx, TransactionRunner } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { isUuid, uuidV7 } from '../../../common/http/uuid-v7.js';
import { Audit } from '../../platform/index.js';
import { CurrentCompany } from '../../people/index.js';
import { CatalogueOrder } from '../catalogue-order.js';
import {
  type CategoryRow,
  CategoryWritesRepository,
} from '../repositories/category-writes.repository.js';
import { toCategoryDto } from '../service-list/service-catalog.js';
import { assertFresh } from '../stale.js';
import { assertNoZawgyi } from '../zawgyi.js';

// The category writes P2.CAT.02 – 05 of add-service-catalogue (design D1 / D4 / D7 / D8 / D9): one
// TransactionRunner.run each (READ COMMITTED), locks first and checks after them, one audit row per committed
// change with `branch_id` NULL (company master — P8-RULE-06). Archived rows are history only: a write that
// names one is 404 (Recorded reading 3). An unchanged edit and a repeated archive write nothing.

export const CATEGORY_CREATE = 'category.create';
export const CATEGORY_UPDATE = 'category.update';
export const CATEGORY_ARCHIVE = 'category.archive';
export const CATEGORY_REORDER = 'category.reorder';

const ENTITY = 'service_categories';
const notFound = () => new ProblemException(ErrorCode.NOT_FOUND, 404);
const alreadyExists = () => new ProblemException(ErrorCode.ALREADY_EXISTS, 409);

/** The members the audit row shows — the API's own wording of the row. */
const members = (row: CategoryRow) => ({
  name_mm: row.name_mm,
  name_en: row.name_en,
  sort_order: row.sort_order,
  status: row.status,
});

@Injectable()
export class CategoryWrites {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repository: CategoryWritesRepository,
    private readonly order: CatalogueOrder,
    private readonly audit: Audit,
    private readonly company: CurrentCompany,
    private readonly clock: Clock,
  ) {}

  /** P2.CAT.02 — an ACTIVE category, last unless a position is sent (SC2 ★). */
  create(body: CategoryCreateBody): Promise<ServiceCategoryDto> {
    return this.runner.run(async (tx) => {
      assertNoZawgyi({ name_mm: body.name_mm, name_en: body.name_en });
      const now = this.clock.now();
      const companyId = await this.company.id(tx);
      // The pre-check answers the usual case; the unique index answers a race (CG-DB-12 · API-IDEM-05).
      if (await this.repository.nameTaken(tx, companyId, body.name_mm)) throw alreadyExists();
      const id = uuidV7(now.getTime());
      await this.repository.insert(tx, {
        id,
        company_id: companyId,
        name_mm: body.name_mm,
        name_en: body.name_en ?? null,
        sort_order: body.sort_order ?? (await this.order.nextCategory(tx, companyId)),
        at: now,
      });
      const row = await this.stored(tx, id);
      await this.audit.emit({
        action: CATEGORY_CREATE,
        entity_type: ENTITY,
        entity_id: id,
        branch_id: null,
        before: null,
        after: members(row),
      });
      return toCategoryDto(row);
    });
  }

  /** P2.CAT.03 — only the members sent; the token is compared with the locked row (API-IDEM-04). */
  update(id: string, body: CategoryUpdateBody): Promise<ServiceCategoryDto> {
    return this.runner.run(async (tx) => {
      const stored = await this.lockLive(tx, id);
      assertFresh(stored.updated_at, body.expected_updated_at);
      assertNoZawgyi({ name_mm: body.name_mm, name_en: body.name_en });
      const changes: { name_mm?: string; name_en?: string | null; status?: number } = {};
      if (body.name_mm !== undefined && body.name_mm !== stored.name_mm)
        changes.name_mm = body.name_mm;
      if (body.name_en !== undefined && body.name_en !== stored.name_en)
        changes.name_en = body.name_en;
      if (body.status !== undefined && body.status !== stored.status) changes.status = body.status;
      const changed = Object.keys(changes) as (keyof typeof changes)[];
      if (changed.length === 0) {
        this.audit.skip();
        return toCategoryDto(stored);
      }
      if (
        changes.name_mm !== undefined &&
        (await this.repository.nameTaken(tx, await this.company.id(tx), changes.name_mm, id))
      ) {
        throw alreadyExists();
      }
      await this.repository.update(tx, id, changes, this.clock.now());
      const row = await this.stored(tx, id);
      await this.audit.emit({
        action: CATEGORY_UPDATE,
        entity_type: ENTITY,
        entity_id: id,
        branch_id: null,
        before: Object.fromEntries(changed.map((member) => [member, stored[member]])),
        after: Object.fromEntries(changed.map((member) => [member, row[member]])),
      });
      return toCategoryDto(row);
    });
  }

  /**
   * P2.CAT.04 — refused while a non-archived service (ACTIVE or INACTIVE) uses the category; the row is
   * locked first, so a service create waiting on `FOR SHARE` sees the archived category afterwards (D4).
   */
  archive(id: string): Promise<ServiceCategoryDto> {
    return this.runner.run(async (tx) => {
      const stored = isUuid(id) ? await this.repository.lock(tx, id) : null;
      if (stored === null) throw notFound();
      if (stored.archived_at !== null) {
        this.audit.skip();
        return toCategoryDto(stored);
      }
      const count = await this.repository.liveServiceCount(tx, id);
      if (count > 0)
        throw new ProblemException(ErrorCode.CATEGORY_IN_USE, 409, { context: { count } });
      await this.repository.update(tx, id, { archived_at: this.clock.now() }, this.clock.now());
      const row = await this.stored(tx, id);
      await this.audit.emit({
        action: CATEGORY_ARCHIVE,
        entity_type: ENTITY,
        entity_id: id,
        branch_id: null,
        before: { archived_at: null },
        after: { archived_at: row.archived_at === null ? null : toMmtIso(row.archived_at) },
      });
      return toCategoryDto(row);
    });
  }

  /** P2.CAT.05 — `ids` is every non-archived category exactly once; positions become 1 … n (D7). */
  reorder(body: CategoryOrderBody): Promise<{ items: ServiceCategoryDto[] }> {
    return this.runner.run(async (tx) => {
      const live = await this.repository.lockAllLive(tx, await this.company.id(tx));
      const sent = new Set(body.ids);
      if (
        sent.size !== body.ids.length ||
        sent.size !== live.length ||
        !live.every((id) => sent.has(id))
      ) {
        throw new ProblemException(ErrorCode.VALIDATION, 400, {
          errors: [{ field: 'ids', code: FieldIssueCode.INVALID_VALUE }],
        });
      }
      const before = await this.repository.liveIdsInOrder(tx, live);
      await this.repository.setPositions(tx, body.ids, this.clock.now());
      await this.audit.emit({
        action: CATEGORY_REORDER,
        entity_type: ENTITY,
        entity_id: null,
        branch_id: null,
        before: { ids: before },
        after: { ids: body.ids },
      });
      // One read, put in the order sent — never several reads at once on one transaction (CG-TS-07).
      const rows = await this.repository.rows(tx, body.ids);
      return { items: rows.map((row) => toCategoryDto(row)) };
    });
  }

  /** The category locked first; 404 for an unknown id and for an archived one. */
  private async lockLive(tx: Tx, id: string) {
    const row = isUuid(id) ? await this.repository.lock(tx, id) : null;
    if (row === null || row.archived_at !== null) throw notFound();
    return row;
  }

  private async stored(tx: Tx, id: string): Promise<CategoryRow> {
    const row = await this.repository.row(tx, id);
    if (row === null) throw new Error(`category ${id} vanished inside its own transaction`);
    return row;
  }
}
