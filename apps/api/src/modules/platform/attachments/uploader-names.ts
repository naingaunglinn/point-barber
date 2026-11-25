import { Injectable } from '@nestjs/common';

// The `display_name` of `uploaded_by` (P8.ATT.01): the employee's name in the caller's language
// (AD-L10N-03). `platform` does not read the people tables, so `people` registers the lookup at start-up,
// the way it registers `UserNames` (docs/engineering/module-map.md).

export type NamesOfUploaders = (userIds: readonly string[]) => Promise<ReadonlyMap<string, string>>;

@Injectable()
export class UploaderNames {
  private lookup: NamesOfUploaders | undefined;

  use(lookup: NamesOfUploaders): void {
    this.lookup = lookup;
  }

  /** Names by user id; a user without an employee has none and shows as an empty name. */
  async of(userIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (this.lookup === undefined) {
      throw new Error('UploaderNames: nothing registered (PeopleModule not loaded)');
    }
    return userIds.length === 0 ? new Map() : this.lookup([...new Set(userIds)]);
  }
}
