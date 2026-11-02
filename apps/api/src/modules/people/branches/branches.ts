import { Injectable } from '@nestjs/common';
import {
  type Branch,
  type BranchCreateBody,
  type BranchMembers,
  type BranchStatusBody,
  BranchStatus,
  type BranchUpdateBody,
  ErrorCode,
  type FieldError,
  PUBLIC_BRANCH_MEMBERS,
  isZawgyi,
  normalizeBranchMembers,
  socialLinksOf,
  toMmtIso,
  toMmtIsoMillis,
  todayMmt,
} from '@point/shared';

import { type ReadScope, inReadScope } from '../../../common/access/read-scope.js';
import { Clock } from '../../../common/clock/clock.js';
import { type Tx, TransactionRunner } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { isUuid, uuidV7 } from '../../../common/http/uuid-v7.js';
import { Audit, SettingsReader, SiteContent } from '../../platform/index.js';
import { CurrentCompany } from '../company/current-company.js';
import { type BranchRow, BranchesRepository } from '../repositories/branches.repository.js';
import { BranchUsage } from './branch-usage.js';
import { changedMembers, sameMillisecond } from './changed-members.js';

// The branch endpoints of add-branch-management (P1.BR.02 – 05 · design D1 / D3). One
// TransactionRunner.run per write (READ COMMITTED); the branch row is the only row lock, taken first,
// and every check runs after it (CG-API-07 · CG-DB-06). Each committed write leaves one audit row with
// the branch (P1-RULE-10 · API-AUD-01) and, when the public site shows what changed, one
// site.revalidate job in the same transaction (API-PUB-03 · D8).

export const BRANCH_CREATE = 'branch.create';
export const BRANCH_UPDATE = 'branch.update';
export const BRANCH_STATUS = 'branch.status';

const ENTITY = 'branches';
/** P1.BR.02: a new branch's radius when the request does not send one (Part 5 §17 · design D5). */
const DEFAULT_RADIUS = 'attendance.default_radius_meters';
/** The members checked for Zawgyi after the schema passed (API-SHAPE-05 · design D4). */
const ZAWGYI_MEMBERS = ['name_mm', 'name_en', 'address_mm', 'address_en'] as const;

const notFound = () => new ProblemException(ErrorCode.NOT_FOUND, 404);

/** Every member with Zawgyi text, one `errors[]` item each (`code` zawgyi_text). */
export function zawgyiFields(members: BranchMembers): FieldError[] {
  const fields: FieldError[] = [];
  for (const member of ZAWGYI_MEMBERS) {
    const value = members[member];
    if (typeof value === 'string' && isZawgyi(value))
      fields.push({ field: member, code: ErrorCode.ZAWGYI_TEXT });
  }
  members.social_links?.other?.forEach((link, index) => {
    if (isZawgyi(link.label))
      fields.push({ field: `social_links.other[${index}].label`, code: ErrorCode.ZAWGYI_TEXT });
  });
  return fields;
}

function assertNoZawgyi(members: BranchMembers): void {
  const errors = zawgyiFields(members);
  if (errors.length > 0) throw new ProblemException(ErrorCode.ZAWGYI_TEXT, 400, { errors });
}

const coordinate = (value: string | null): number | null => (value === null ? null : Number(value));

/** The stored members as the API answers them — the `after_data` of a create (design D7). */
function storedMembers(row: BranchRow): Record<string, unknown> {
  return {
    code: row.code,
    name_mm: row.name_mm,
    name_en: row.name_en,
    phone: row.phone,
    email: row.email,
    address_mm: row.address_mm,
    address_en: row.address_en,
    website_url: row.website_url,
    social_links: socialLinksOf(row.social_links),
    latitude: coordinate(row.latitude),
    longitude: coordinate(row.longitude),
    location_radius_meters: row.location_radius_meters,
    is_public: row.is_public,
    map_url: row.map_url,
    status: row.status,
  };
}

/** The one mapper of `Branch` (CG-API-04): every member named, so a new column never leaks. */
function toBranch(row: BranchRow, activeEmployees: number): Branch {
  return {
    id: row.id,
    code: row.code,
    name_mm: row.name_mm,
    name_en: row.name_en,
    phone: row.phone,
    status: row.status === BranchStatus.ACTIVE ? BranchStatus.ACTIVE : BranchStatus.INACTIVE,
    is_public: row.is_public,
    email: row.email,
    address_mm: row.address_mm,
    address_en: row.address_en,
    website_url: row.website_url,
    social_links: socialLinksOf(row.social_links),
    latitude: coordinate(row.latitude),
    longitude: coordinate(row.longitude),
    location_radius_meters: row.location_radius_meters,
    map_url: row.map_url,
    active_employees: activeEmployees,
    created_at: toMmtIso(row.created_at),
    // With its milliseconds: the value a client echoes as expected_updated_at (design D6).
    updated_at: toMmtIsoMillis(row.updated_at),
  };
}

@Injectable()
export class Branches {
  constructor(
    private readonly repository: BranchesRepository,
    private readonly runner: TransactionRunner,
    private readonly audit: Audit,
    private readonly settings: SettingsReader,
    private readonly company: CurrentCompany,
    private readonly usage: BranchUsage,
    private readonly site: SiteContent,
    private readonly clock: Clock,
  ) {}

  /**
   * P1.BR.03 — a branch outside the caller's read scope answers 404 on the same path as an unknown
   * id, so the two bodies are equal (API-PERM-03 · P1-RULE-05).
   */
  async detail(id: string, scope: ReadScope): Promise<Branch> {
    if (!isUuid(id) || !inReadScope(scope, id)) throw notFound();
    const row = await this.repository.detailRow(id);
    if (row === null) throw notFound();
    const today = todayMmt(this.clock.now());
    return toBranch(row, await this.repository.activeEmployees(id, today));
  }

  /** P1.BR.02 — a new ACTIVE branch (design D3 step 1 · D5). */
  create(body: BranchCreateBody): Promise<Branch> {
    return this.runner.run(async (tx) => {
      const now = this.clock.now();
      const members = normalizeBranchMembers(body);
      // An absent radius takes the setting's effective value; a sent null stays NULL (D5).
      const radius =
        members.location_radius_meters === undefined
          ? (await this.settings.effective([DEFAULT_RADIUS]))[DEFAULT_RADIUS]
          : members.location_radius_meters;
      const id = uuidV7(now.getTime());
      // A code the company already has: branches_company_id_code_idx → 409 already_exists in the
      // one error mapper (CG-DB-12).
      await this.repository.insert(tx, {
        ...members,
        id,
        company_id: await this.company.id(tx),
        code: body.code,
        name_mm: body.name_mm,
        location_radius_meters: radius,
        at: now,
      });
      assertNoZawgyi(members);
      const row = await this.stored(tx, id);
      await this.audit.emit({
        action: BRANCH_CREATE,
        entity_type: ENTITY,
        entity_id: id,
        branch_id: id,
        before: null,
        after: storedMembers(row),
      });
      await this.site.touch(tx, ['home', `branch:${row.code}`]);
      return toBranch(row, await this.repository.activeEmployees(id, todayMmt(now), tx));
    });
  }

  /** P1.BR.04 — only the members sent; never the code (owner BR1 · design D3 step 2 · D6 · D7). */
  update(id: string, body: BranchUpdateBody): Promise<Branch> {
    return this.runner.run(async (tx) => {
      const stored = await this.lock(tx, id);
      if (
        body.expected_updated_at !== undefined &&
        !sameMillisecond(stored.updated_at, body.expected_updated_at)
      ) {
        throw new ProblemException(ErrorCode.CONFLICT, 409);
      }
      const members = normalizeBranchMembers(body);
      assertNoZawgyi(members);
      const now = this.clock.now();
      const today = todayMmt(now);
      const changes = changedMembers(stored, members);
      if (changes.length === 0) {
        // Nothing changed: no UPDATE, no audit row, no job; the stored updated_at (D7).
        this.audit.skip();
        return toBranch(stored, await this.repository.activeEmployees(id, today, tx));
      }
      await this.repository.updateMembers(tx, id, members, now);
      await this.audit.emit({
        action: BRANCH_UPDATE,
        entity_type: ENTITY,
        entity_id: id,
        branch_id: id,
        before: Object.fromEntries(changes.map((change) => [change.member, change.before])),
        after: Object.fromEntries(changes.map((change) => [change.member, change.after])),
      });
      const shown: readonly string[] = PUBLIC_BRANCH_MEMBERS;
      if (changes.some((change) => shown.includes(change.member))) {
        await this.site.touch(tx, ['home', `branch:${stored.code}`]);
      }
      return toBranch(
        await this.stored(tx, id),
        await this.repository.activeEmployees(id, today, tx),
      );
    });
  }

  /**
   * P1.BR.05 — deactivate (guarded by P1-RULE-09 · owner BR2) or re-activate (unguarded); the same
   * status again answers 200 and writes nothing (API-IDEM-01 · design D3 step 3).
   */
  setStatus(id: string, body: BranchStatusBody): Promise<Branch> {
    return this.runner.run(async (tx) => {
      const stored = await this.lock(tx, id);
      const now = this.clock.now();
      // Read once per transaction: the Myanmar calendar date (D-PLT-15).
      const today = todayMmt(now);
      if (stored.status === body.status) {
        this.audit.skip();
        return toBranch(stored, await this.repository.activeEmployees(id, today, tx));
      }
      if (body.status === BranchStatus.INACTIVE) {
        const counts = await this.usage.countsFor(tx, id, today);
        if (counts.open_bookings > 0 || counts.open_sales > 0 || counts.active_assignments > 0) {
          throw new ProblemException(ErrorCode.BRANCH_IN_USE, 409, { context: counts });
        }
      }
      await this.repository.updateMembers(tx, id, { status: body.status }, now);
      await this.audit.emit({
        action: BRANCH_STATUS,
        entity_type: ENTITY,
        entity_id: id,
        branch_id: id,
        before: { status: stored.status },
        after: { status: body.status },
        // The reason goes to the audit row only — branches has no reason column (reading 12).
        reason: body.reason === undefined || body.reason === '' ? null : body.reason,
      });
      await this.site.touch(tx, ['home', `branch:${stored.code}`]);
      return toBranch(
        await this.stored(tx, id),
        await this.repository.activeEmployees(id, today, tx),
      );
    });
  }

  /** The branch row locked first (design D3); 404 for an id that is no branch. */
  private async lock(tx: Tx, id: string): Promise<BranchRow> {
    const row = isUuid(id) ? await this.repository.lockById(tx, id) : null;
    if (row === null) throw notFound();
    return row;
  }

  private async stored(tx: Tx, id: string): Promise<BranchRow> {
    const row = await this.repository.detailRow(id, tx);
    if (row === null) throw new Error(`branch ${id} vanished inside its own transaction`);
    return row;
  }
}
