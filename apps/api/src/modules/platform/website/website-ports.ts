import { Injectable } from '@nestjs/common';

// What the website management reads from the other modules (add-website-management design D1 ·
// ADR-001 rule 1): `people`, `catalog` and `scheduling` build on `platform`, so each registers its read
// here at start-up, as `people` does for `WebsitePeople` and `booking` for `ClosureBookings`.

/** A branch as the website screens read it (`PeopleDirectory.branchesForWebsite`). */
export interface WebsiteBranch {
  readonly id: string;
  readonly code: string;
  readonly name_mm: string;
  readonly name_en: string | null;
  readonly address_mm: string | null;
  readonly address_en: string | null;
  readonly is_public: boolean;
  readonly map_url: string | null;
}

/** The company's names and logo (`companies`). */
export interface WebsiteCompany {
  readonly name_mm: string;
  readonly name_en: string | null;
  readonly logo_url: string | null;
}

export interface WebsiteBranchName {
  readonly id: string;
  readonly code: string;
  readonly name_mm: string;
  readonly name_en: string | null;
}

/** An ACTIVE employee's public fields and open assignments (`PublicPeople.activeProfiles`). No phone, e-mail or note. */
export interface WebsiteProfile {
  readonly employee_id: string;
  readonly employee_code: string;
  readonly name_mm: string;
  readonly name_en: string | null;
  readonly photo_url: string | null;
  readonly public_profile: boolean;
  readonly public_specialty_mm: string | null;
  readonly public_specialty_en: string | null;
  readonly public_rating: number | null;
  /** The open assignments (no end date), ordered by branch code. */
  readonly branches: readonly WebsiteBranchName[];
}

export interface WebsiteDirectoryReads {
  company(): Promise<WebsiteCompany>;
  /** The ACTIVE branches, ordered by code; every one when `ids` is undefined. */
  branchesForWebsite(ids?: readonly string[]): Promise<WebsiteBranch[]>;
  /** The ACTIVE employees ordered by `employee_code`. */
  activeProfiles(): Promise<WebsiteProfile[]>;
  /** How many ACTIVE employees have `public_profile`. */
  countPublicProfiles(): Promise<number>;
}

@Injectable()
export class WebsiteDirectory implements WebsiteDirectoryReads {
  private reads: WebsiteDirectoryReads | undefined;

  use(reads: WebsiteDirectoryReads): void {
    this.reads = reads;
  }

  company(): Promise<WebsiteCompany> {
    return this.registered().company();
  }

  branchesForWebsite(ids?: readonly string[]): Promise<WebsiteBranch[]> {
    return this.registered().branchesForWebsite(ids);
  }

  activeProfiles(): Promise<WebsiteProfile[]> {
    return this.registered().activeProfiles();
  }

  countPublicProfiles(): Promise<number> {
    return this.registered().countPublicProfiles();
  }

  private registered(): WebsiteDirectoryReads {
    if (this.reads === undefined)
      throw new Error('WebsiteDirectory: nothing registered (PeopleModule not loaded)');
    return this.reads;
  }
}

export interface WebsiteCatalogReads {
  /** ACTIVE, non-archived services with `show_on_website`. */
  countOnWebsite(): Promise<number>;
}

@Injectable()
export class WebsiteCatalog implements WebsiteCatalogReads {
  private reads: WebsiteCatalogReads | undefined;

  use(reads: WebsiteCatalogReads): void {
    this.reads = reads;
  }

  countOnWebsite(): Promise<number> {
    if (this.reads === undefined)
      throw new Error('WebsiteCatalog: nothing registered (CatalogModule not loaded)');
    return this.reads.countOnWebsite();
  }
}

/** One public branch a barber works at on a day, with the shift's times. */
export interface ShiftBranch extends WebsiteBranchName {
  readonly starts_at: Date;
  readonly ends_at: Date;
}

export interface WebsiteShiftReads {
  /**
   * For each employee, the public ACTIVE branches of its non-archived shifts on the business date
   * `date`, in shift order (`TodayShifts.branchesOf`); an employee without one is absent.
   */
  branchesOf(query: {
    readonly employee_ids: readonly string[];
    readonly date: string;
  }): Promise<ReadonlyMap<string, readonly ShiftBranch[]>>;
}

@Injectable()
export class WebsiteShifts implements WebsiteShiftReads {
  private reads: WebsiteShiftReads | undefined;

  use(reads: WebsiteShiftReads): void {
    this.reads = reads;
  }

  branchesOf(query: {
    readonly employee_ids: readonly string[];
    readonly date: string;
  }): Promise<ReadonlyMap<string, readonly ShiftBranch[]>> {
    if (this.reads === undefined)
      throw new Error('WebsiteShifts: nothing registered (SchedulingModule not loaded)');
    return query.employee_ids.length === 0
      ? Promise.resolve(new Map())
      : this.reads.branchesOf(query);
  }
}
