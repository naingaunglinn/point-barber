import { Injectable } from '@nestjs/common';
import { type Locale, UiLanguage, localized } from '@point/shared';

import { RequestContext } from '../../../common/http/request-context.js';
import { SettingsReader } from '../../platform/index.js';
import { DisplayNameRepository } from '../repositories/display-name.repository.js';

// The `display_name` of the reference shapes `{ id, display_name }` / `{ user_id, display_name }`
// (add-walkin-visit-checkout design, reading of 15/Oct/2026): the employee's name in the caller's
// language by AD-L10N-03 (🔒 D-DB-04) — Myanmar UI `name_mm`; English UI `name_en`, else `name_mm`.
// The caller's language is `users.ui_language`, or the system default when it is NULL (AD-L10N-06).
// Receipts are English always and call `names*` with 'en' (AD-RCPT-01).
@Injectable()
export class DisplayNames {
  constructor(
    private readonly repository: DisplayNameRepository,
    private readonly settings: SettingsReader,
  ) {}

  /** The language of the signed-in caller; the system default outside a request. */
  async callerLocale(): Promise<Locale> {
    const userId = RequestContext.current()?.user_id;
    const own = userId === undefined ? null : await this.repository.uiLanguage(userId);
    const language =
      own ??
      (await this.settings.effective(['system.default_language']))['system.default_language'];
    return language === UiLanguage.EN ? 'en' : 'my';
  }

  /** Display names of users (their employee), keyed by user id; a user without one is absent. */
  async ofUsers(userIds: readonly string[], locale: Locale): Promise<ReadonlyMap<string, string>> {
    return this.pick(await this.repository.namesOfUsers(unique(userIds)), locale);
  }

  /** Display names of employees, keyed by employee id. */
  async ofEmployees(
    employeeIds: readonly string[],
    locale: Locale,
  ): Promise<ReadonlyMap<string, string>> {
    return this.pick(await this.repository.namesOfEmployees(unique(employeeIds)), locale);
  }

  private pick(
    names: ReadonlyMap<string, { name_mm: string; name_en: string | null }>,
    locale: Locale,
  ): ReadonlyMap<string, string> {
    return new Map([...names].map(([key, name]) => [key, localized(name, 'name', locale)]));
  }
}

const unique = (ids: readonly string[]): string[] => [...new Set(ids)];
