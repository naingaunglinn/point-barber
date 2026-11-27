import { Injectable } from '@nestjs/common';
import { BranchStatus, EmployeeStatus } from '@point/shared';

import { PrismaService } from '../../../common/database/prisma.service.js';
import { TransactionScope } from '../../../common/database/transaction-scope.js';
import { READ_ROW_CEILING, assertWithinCeiling } from '../../../common/limits.js';
import type { WebsiteBranch, WebsiteCompany, WebsiteProfile } from '../../platform/index.js';

// The people tables as the website management reads them (add-website-management design D1 · D8 ·
// P8.WEB.01 / 09 / 10 / 11): the company's names, the ACTIVE branches and the public fields of the ACTIVE
// employees. Each row is built member by member, so a new column (phone, e-mail, notes) never reaches
// the team overview (P8-RULE-11).
@Injectable()
export class WebsiteRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return TransactionScope.current()?.tx ?? this.prisma;
  }

  /** The one company's names and logo (D-ORG-03: the oldest row). */
  async company(): Promise<WebsiteCompany> {
    const row = await this.db.companies.findFirstOrThrow({
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      select: { name_mm: true, name_en: true, logo_url: true },
    });
    return { name_mm: row.name_mm, name_en: row.name_en, logo_url: row.logo_url };
  }

  /** The ACTIVE branches ordered by code; every one when `ids` is undefined. */
  async branches(ids?: readonly string[]): Promise<WebsiteBranch[]> {
    const rows = await this.db.branches.findMany({
      where: {
        status: BranchStatus.ACTIVE,
        ...(ids === undefined ? {} : { id: { in: [...ids] } }),
      },
      orderBy: { code: 'asc' },
      take: READ_ROW_CEILING + 1,
      select: {
        id: true,
        code: true,
        name_mm: true,
        name_en: true,
        address_mm: true,
        address_en: true,
        is_public: true,
        map_url: true,
      },
    });
    return assertWithinCeiling(rows, 'PeopleDirectory.branchesForWebsite').map((row) => ({
      id: row.id,
      code: row.code,
      name_mm: row.name_mm,
      name_en: row.name_en,
      address_mm: row.address_mm,
      address_en: row.address_en,
      is_public: row.is_public,
      map_url: row.map_url,
    }));
  }

  /** The ACTIVE employees ordered by `employee_code`, with their open assignments (no end date). */
  async profiles(): Promise<WebsiteProfile[]> {
    const rows = await this.db.employees.findMany({
      where: { status: EmployeeStatus.ACTIVE },
      orderBy: { employee_code: 'asc' },
      take: READ_ROW_CEILING + 1,
      select: {
        id: true,
        employee_code: true,
        name_mm: true,
        name_en: true,
        photo_url: true,
        public_profile: true,
        public_specialty_mm: true,
        public_specialty_en: true,
        public_rating: true,
        employee_branches: {
          where: { effective_to: null },
          select: { branches: { select: { id: true, code: true, name_mm: true, name_en: true } } },
        },
      },
    });
    return assertWithinCeiling(rows, 'PublicPeople.activeProfiles').map((row) => ({
      employee_id: row.id,
      employee_code: row.employee_code,
      name_mm: row.name_mm,
      name_en: row.name_en,
      photo_url: row.photo_url,
      public_profile: row.public_profile,
      public_specialty_mm: row.public_specialty_mm,
      public_specialty_en: row.public_specialty_en,
      public_rating: row.public_rating === null ? null : row.public_rating.toNumber(),
      branches: row.employee_branches
        .map((assignment) => assignment.branches)
        .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)),
    }));
  }

  countPublicProfiles(): Promise<number> {
    return this.db.employees.count({
      where: { status: EmployeeStatus.ACTIVE, public_profile: true },
    });
  }
}
