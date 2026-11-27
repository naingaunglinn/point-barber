import { Injectable } from '@nestjs/common';

// What the website management needs from the people module (add-website-management design D1 ·
// ADR-001 rule 1): `people` builds on `platform`, so it registers these reads at start-up, as it does
// for the settings store (docs/engineering/module-map.md).

export interface WebsitePeopleReads {
  /** The branch with this id, any status; null when there is none. */
  branch(id: string): Promise<{ readonly id: string; readonly code: string } | null>;
  /** The display names of users in the caller's language (AD-L10N-03), keyed by user id. */
  userDisplayNames(userIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
  /** The display names of employees in the caller's language, keyed by employee id. */
  employeeDisplayNames(employeeIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}

@Injectable()
export class WebsitePeople implements WebsitePeopleReads {
  private reads: WebsitePeopleReads | undefined;

  use(reads: WebsitePeopleReads): void {
    this.reads = reads;
  }

  branch(id: string): Promise<{ readonly id: string; readonly code: string } | null> {
    return this.registered().branch(id);
  }

  userDisplayNames(userIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return userIds.length === 0
      ? Promise.resolve(new Map())
      : this.registered().userDisplayNames(userIds);
  }

  employeeDisplayNames(employeeIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return employeeIds.length === 0
      ? Promise.resolve(new Map())
      : this.registered().employeeDisplayNames(employeeIds);
  }

  private registered(): WebsitePeopleReads {
    if (this.reads === undefined)
      throw new Error('WebsitePeople: nothing registered (PeopleModule not loaded)');
    return this.reads;
  }
}
