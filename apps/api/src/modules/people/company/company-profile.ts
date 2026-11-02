import { Injectable } from '@nestjs/common';
import {
  type CompanyDto,
  type CompanyProfileChanges,
  type CompanyProfileValues,
  type CompanyUpdate,
  ErrorCode,
  type FieldError,
  type SocialLinks,
  isZawgyi,
  normalizeCompanyUpdate,
  socialLinksSchema,
  toMmtIso,
} from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import { TransactionRunner, type Tx } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { Audit, SiteContent } from '../../platform/index.js';
import { CompanyRepository, type CompanyProfileRow } from '../repositories/company.repository.js';

// The company profile (P1.CO.01 / P1.CO.02 · D-ORG-02 · D-WEB-03 · P1-RULE-10 · API-IDEM-04 ·
// API-SHAPE-04 / 05 · API-AUD-01 · API-PUB-03 · add-company-profile design D2 – D6, D10). The access
// guard has decided already: every staff member reads, a company-scope `company.update` writes.

export const COMPANY_UPDATE = 'company.update';

/** The text members of a PATCH, compared by equality (design D5); `social_links` canonically. */
const TEXT_MEMBERS = [
  'name_mm',
  'name_en',
  'phone',
  'email',
  'address_mm',
  'address_en',
  'website_url',
] as const satisfies readonly (keyof CompanyProfileValues)[];

/** The text members a Zawgyi keyboard may have typed (API-SHAPE-05 · design D10). */
const MYANMAR_TEXT = ['name_mm', 'name_en', 'address_mm', 'address_en'] as const;

/** A stored NULL is `{}` on the wire (proposal reading 8); a stored object is the API's own write. */
const linksOf = (json: CompanyProfileRow['social_links']): SocialLinks =>
  json === null ? {} : socialLinksSchema.parse(json);

/** Members sorted, `other` in its order — two equal link sets give the same text (design D5). */
function canonical(links: SocialLinks): string {
  const { other, ...members } = links;
  const present = Object.entries(members)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify([present, (other ?? []).map((link) => [link.label, link.url])]);
}

function valuesOf(row: CompanyProfileRow): CompanyProfileValues {
  return {
    name_mm: row.name_mm,
    name_en: row.name_en,
    phone: row.phone,
    email: row.email,
    address_mm: row.address_mm,
    address_en: row.address_en,
    website_url: row.website_url,
    social_links: linksOf(row.social_links),
  };
}

/** The `Company` DTO — the 12 members of P1.CO.01, named one by one. */
function toDto(row: CompanyProfileRow): CompanyDto {
  return {
    id: row.id,
    name_mm: row.name_mm,
    name_en: row.name_en,
    logo_url: row.logo_url,
    phone: row.phone,
    email: row.email,
    address_mm: row.address_mm,
    address_en: row.address_en,
    website_url: row.website_url,
    social_links: linksOf(row.social_links),
    status: row.status as CompanyDto['status'],
    updated_at: toMmtIso(row.updated_at),
  };
}

/** The members whose value differs from the stored one, before and after (design D5). */
function changedMembers(
  current: CompanyProfileValues,
  changes: CompanyProfileChanges,
): { before: Record<string, unknown>; after: CompanyProfileChanges } {
  const before: Record<string, unknown> = {};
  const after: { -readonly [K in keyof CompanyProfileValues]?: CompanyProfileValues[K] } = {};
  const compareText = <K extends (typeof TEXT_MEMBERS)[number]>(member: K) => {
    const value = changes[member];
    if (value === undefined || value === current[member]) return;
    before[member] = current[member];
    after[member] = value;
  };
  for (const member of TEXT_MEMBERS) compareText(member);
  const links = changes.social_links;
  if (links !== undefined && canonical(links) !== canonical(current.social_links)) {
    // Recorded whole when it changed (design D5).
    before.social_links = current.social_links;
    after.social_links = links;
  }
  return { before, after };
}

/** Every member typed in Zawgyi, as `errors[]` items of `zawgyi_text` (design D10). */
function zawgyiErrors(changes: CompanyProfileChanges): FieldError[] {
  const fields: string[] = MYANMAR_TEXT.filter((member) => {
    const text = changes[member];
    return typeof text === 'string' && isZawgyi(text);
  });
  changes.social_links?.other?.forEach((link, index) => {
    if (isZawgyi(link.label)) fields.push(`social_links.other[${index}].label`);
  });
  return fields.map((field) => ({ field, code: ErrorCode.ZAWGYI_TEXT }));
}

@Injectable()
export class CompanyProfile {
  constructor(
    private readonly repository: CompanyRepository,
    private readonly runner: TransactionRunner,
    private readonly audit: Audit,
    private readonly site: SiteContent,
    private readonly clock: Clock,
  ) {}

  /** P1.CO.01 — the one company (D-ORG-03). */
  async read(db?: Tx): Promise<CompanyDto> {
    const row = await this.repository.profile(db);
    if (row === null)
      throw new Error('no company row yet — the base seed runs at the first API start');
    return toDto(row);
  }

  /**
   * P1.CO.02 — design D3: the Zawgyi stage after the schema (nothing is read or written for a
   * refusal), then one transaction: lock, the version check under the lock, the diff, the write with
   * its audit row and website refresh — or nothing at all when no member changes.
   */
  async update(input: CompanyUpdate): Promise<CompanyDto> {
    const changes = normalizeCompanyUpdate(input);
    const zawgyi = zawgyiErrors(changes);
    if (zawgyi.length > 0) {
      throw new ProblemException(ErrorCode.ZAWGYI_TEXT, 400, { errors: zawgyi });
    }
    return this.runner.run(async (tx) => {
      const row = await this.repository.lockProfile(tx);
      if (
        input.expected_updated_at !== undefined &&
        toMmtIso(input.expected_updated_at) !== toMmtIso(row.updated_at)
      ) {
        throw new ProblemException(ErrorCode.CONFLICT, 409);
      }
      const { before, after } = changedMembers(valuesOf(row), changes);
      if (Object.keys(after).length === 0) {
        this.audit.skip();
        return toDto(row);
      }
      const updated = await this.repository.updateProfile(tx, row.id, after, this.clock.now());
      await this.audit.emit({
        action: COMPANY_UPDATE,
        entity_type: 'companies',
        entity_id: row.id,
        before,
        after,
        branch_id: null,
      });
      await this.site.touch(tx, ['site', 'home']);
      return toDto(updated);
    });
  }
}
