import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  FieldIssueCode,
  type ServiceCreateBody,
  type ServiceDto,
  type ServiceListItemDto,
  ServicePricingMode,
  type ServiceOrderBody,
  type ServiceUpdateBody,
  toMmtIso,
  todayMmt,
} from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import { type Tx, TransactionRunner } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { isUuid, uuidV7 } from '../../../common/http/uuid-v7.js';
import { Audit } from '../../platform/index.js';
import { CurrentCompany } from '../../people/index.js';
import { CatalogueOrder } from '../catalogue-order.js';
import { PriceRows } from '../price-rows/price-rows.js';
import { ServiceListRepository } from '../repositories/service-list.repository.js';
import {
  type ServiceChanges,
  type ServiceRow,
  ServiceWritesRepository,
} from '../repositories/service-writes.repository.js';
import { ServiceDetail } from '../service-detail/service-detail.js';
import { toListItem } from '../service-list/service-catalog.js';
import { assertFresh } from '../stale.js';
import { assertNoZawgyi } from '../zawgyi.js';

// The service writes P2.SVC.02 / 04 / 05 / 07 of add-service-catalogue (design D1 / D4 / D6 / D7 / D8 / D9):
// one TransactionRunner.run each (READ COMMITTED), locks first and checks after them (category, then service,
// then price rows), one audit row per committed change with `branch_id` NULL (company master — P8-RULE-06).
// Archived rows are history only: a write that names one is 404 (Recorded reading 3). An unchanged edit and a
// repeated archive write nothing. The sale per branch (P2.SVC.06) and the site event come with group 6.

export const SERVICE_CREATE = 'service.create';
export const SERVICE_UPDATE = 'service.update';
export const SERVICE_ARCHIVE = 'service.archive';
export const SERVICE_REORDER = 'service.reorder';

const ENTITY = 'services';
const notFound = () => new ProblemException(ErrorCode.NOT_FOUND, 404);
const alreadyExists = () => new ProblemException(ErrorCode.ALREADY_EXISTS, 409);
const categoryInactive = () => new ProblemException(ErrorCode.CATEGORY_INACTIVE, 422);

/** What a write answers: the full `Service` as a company-scope caller reads it (P2.SVC.03). */
const VIEWER = { scope: 'all', management: true } as const;

/** The members the audit row shows — the API's own wording of the row. */
const members = (row: ServiceRow) => ({
  category_id: row.category_id,
  name_mm: row.name_mm,
  name_en: row.name_en,
  description_mm: row.description_mm,
  description_en: row.description_en,
  public_description_mm: row.public_description_mm,
  public_description_en: row.public_description_en,
  pricing_mode: row.pricing_mode,
  buffer_minutes: row.buffer_minutes,
  show_on_website: row.show_on_website,
  sort_order: row.sort_order,
  status: row.status,
});

/** The text members checked for Zawgyi (API-SHAPE-05) — every text a body can carry. */
const texts = (body: Partial<ServiceCreateBody & ServiceUpdateBody>) => ({
  name_mm: body.name_mm,
  name_en: body.name_en,
  description_mm: body.description_mm,
  description_en: body.description_en,
  public_description_mm: body.public_description_mm,
  public_description_en: body.public_description_en,
});

@Injectable()
export class ServiceWrites {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repository: ServiceWritesRepository,
    private readonly listRepository: ServiceListRepository,
    private readonly detail: ServiceDetail,
    private readonly prices: PriceRows,
    private readonly order: CatalogueOrder,
    private readonly audit: Audit,
    private readonly company: CurrentCompany,
    private readonly clock: Clock,
  ) {}

  /** P2.SVC.02 — an ACTIVE service, last in its category, and its `branch_services` rows. */
  create(body: ServiceCreateBody): Promise<ServiceDto> {
    return this.runner.run(async (tx) => {
      assertNoZawgyi(texts(body));
      if (body.pricing_mode === ServicePricingMode.OPTIONS)
        throw new ProblemException(ErrorCode.OPTIONS_REQUIRED, 422);
      const now = this.clock.now();
      // The category is read under `FOR SHARE`: an archive racing this create waits, so no row is orphaned.
      const category = await this.repository.lockCategory(tx, body.category_id);
      if (category === null || category.archived_at !== null) throw categoryInactive();
      const companyId = await this.company.id(tx);
      // The pre-check answers the usual case; the unique index answers a race (CG-DB-12 · API-IDEM-05).
      if (await this.repository.nameTaken(tx, companyId, body.name_mm)) throw alreadyExists();
      const id = uuidV7(now.getTime());
      await this.repository.insert(tx, {
        id,
        company_id: companyId,
        category_id: body.category_id,
        name_mm: body.name_mm,
        name_en: body.name_en ?? null,
        description_mm: body.description_mm ?? null,
        description_en: body.description_en ?? null,
        public_description_mm: body.public_description_mm ?? null,
        public_description_en: body.public_description_en ?? null,
        pricing_mode: body.pricing_mode,
        buffer_minutes: body.buffer_minutes,
        show_on_website: body.show_on_website,
        sort_order: await this.order.nextService(tx, body.category_id),
        at: now,
      });
      const branches = body.branches ?? [];
      await this.repository.insertBranches(
        tx,
        id,
        branches.map((item, index) => ({
          id: uuidV7(now.getTime() + index + 1),
          ...item,
        })),
        now,
      );
      const row = await this.stored(tx, id);
      await this.audit.emit({
        action: SERVICE_CREATE,
        entity_type: ENTITY,
        entity_id: id,
        branch_id: null,
        before: null,
        after: { ...members(row), branches },
      });
      return this.detail.get(tx, id, VIEWER);
    });
  }

  /** P2.SVC.04 — only the members sent; the token is compared with the locked row (API-IDEM-04). */
  update(id: string, body: ServiceUpdateBody): Promise<ServiceDto & { warnings: [] }> {
    return this.runner.run(async (tx) => {
      // Lock order: the target category first (when the category changes), then the service (design D4).
      const target =
        body.category_id === undefined
          ? null
          : await this.repository.lockCategory(tx, body.category_id);
      const stored = await this.lockLive(tx, id);
      assertFresh(stored.updated_at, body.expected_updated_at);
      assertNoZawgyi(texts(body));
      if (body.pricing_mode === ServicePricingMode.OPTIONS)
        throw new ProblemException(ErrorCode.USE_OPTIONS_ENDPOINT, 422);
      const moved = body.category_id !== undefined && body.category_id !== stored.category_id;
      if (moved && (target === null || target.archived_at !== null)) throw categoryInactive();
      const changes = this.changesOf(stored, body);
      if (moved && body.category_id !== undefined) {
        changes.category_id = body.category_id;
        changes.sort_order = await this.order.nextService(tx, body.category_id);
      }
      const changed = Object.keys(changes) as (keyof ServiceChanges)[];
      if (changed.length === 0) {
        this.audit.skip();
        return { ...(await this.detail.get(tx, id, VIEWER)), warnings: [] };
      }
      if (
        changes.name_mm !== undefined &&
        (await this.repository.nameTaken(tx, await this.company.id(tx), changes.name_mm, id))
      ) {
        throw alreadyExists();
      }
      await this.repository.update(tx, id, changes, this.clock.now());
      const row = await this.stored(tx, id);
      const shown = members(row);
      const before = members(stored);
      await this.audit.emit({
        action: SERVICE_UPDATE,
        entity_type: ENTITY,
        entity_id: id,
        branch_id: null,
        before: Object.fromEntries(
          changed.map((member) => [member, before[member as keyof typeof before]]),
        ),
        after: Object.fromEntries(
          changed.map((member) => [member, shown[member as keyof typeof shown]]),
        ),
      });
      return { ...(await this.detail.get(tx, id, VIEWER)), warnings: [] };
    });
  }

  /**
   * P2.SVC.05 — the service is locked first, then its price rows are closed as of today in the same
   * transaction (P2-RULE-04 #5 · design D6); a repeat answers the same row and writes nothing.
   */
  archive(id: string): Promise<ServiceDto & { warnings: [] }> {
    return this.runner.run(async (tx) => {
      const stored = isUuid(id) ? await this.repository.lock(tx, id) : null;
      if (stored === null) throw notFound();
      if (stored.archived_at !== null) {
        this.audit.skip();
        return { ...(await this.detail.get(tx, id, VIEWER)), warnings: [] };
      }
      const now = this.clock.now();
      const closed = await this.prices.closeAsOfToday(tx, { service_id: id }, todayMmt(now), now);
      await this.repository.update(tx, id, { archived_at: now }, now);
      const row = await this.stored(tx, id);
      await this.audit.emit({
        action: SERVICE_ARCHIVE,
        entity_type: ENTITY,
        entity_id: id,
        branch_id: null,
        before: { archived_at: null },
        after: {
          archived_at: row.archived_at === null ? null : toMmtIso(row.archived_at),
          price_rows_closed: closed,
        },
      });
      return { ...(await this.detail.get(tx, id, VIEWER)), warnings: [] };
    });
  }

  /** P2.SVC.07 — `ids` is every non-archived service of the category exactly once; positions become 1 … n (D7). */
  reorder(body: ServiceOrderBody): Promise<{ items: ServiceListItemDto[] }> {
    return this.runner.run(async (tx) => {
      const category = isUuid(body.category_id)
        ? await this.repository.lockCategory(tx, body.category_id)
        : null;
      if (category === null || category.archived_at !== null) throw notFound();
      const live = await this.repository.lockLiveOfCategory(tx, body.category_id);
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
      const now = this.clock.now();
      const before = await this.repository.liveIdsInOrder(tx, live);
      await this.repository.setPositions(tx, body.ids, now);
      await this.audit.emit({
        action: SERVICE_REORDER,
        entity_type: ENTITY,
        entity_id: null,
        branch_id: null,
        before: { category_id: body.category_id, ids: before },
        after: { category_id: body.category_id, ids: body.ids },
      });
      // One read in catalogue order (the positions just written), never several reads at once on one tx (CG-TS-07).
      const rows = await this.listRepository.services(tx, {
        category_id: body.category_id,
        statuses: [0, 1],
        include_archived: false,
        picker: false,
        sold: 'here',
        today: todayMmt(now),
        take: body.ids.length,
      });
      return { items: rows.map((row) => toListItem(row, 'all')) };
    });
  }

  /** The members that differ from the stored row; `category_id` and the position are decided by the caller. */
  private changesOf(stored: ServiceRow, body: ServiceUpdateBody): ServiceChanges {
    const changes: ServiceChanges = {};
    const differs = <T>(sent: T | undefined, current: T): sent is T =>
      sent !== undefined && sent !== current;
    if (differs(body.name_mm, stored.name_mm)) changes.name_mm = body.name_mm;
    if (differs(body.name_en, stored.name_en)) changes.name_en = body.name_en;
    if (differs(body.description_mm, stored.description_mm))
      changes.description_mm = body.description_mm;
    if (differs(body.description_en, stored.description_en))
      changes.description_en = body.description_en;
    if (differs(body.public_description_mm, stored.public_description_mm))
      changes.public_description_mm = body.public_description_mm;
    if (differs(body.public_description_en, stored.public_description_en))
      changes.public_description_en = body.public_description_en;
    if (differs(body.buffer_minutes, stored.buffer_minutes))
      changes.buffer_minutes = body.buffer_minutes;
    if (differs(body.show_on_website, stored.show_on_website))
      changes.show_on_website = body.show_on_website;
    if (differs(body.status, stored.status)) changes.status = body.status;
    return changes;
  }

  /** The service locked first; 404 for an unknown id and for an archived one. */
  private async lockLive(tx: Tx, id: string): Promise<ServiceRow> {
    const row = isUuid(id) ? await this.repository.lock(tx, id) : null;
    if (row === null || row.archived_at !== null) throw notFound();
    return row;
  }

  private async stored(tx: Tx, id: string): Promise<ServiceRow> {
    const row = await this.repository.row(tx, id);
    if (row === null) throw new Error(`service ${id} vanished inside its own transaction`);
    return row;
  }
}
