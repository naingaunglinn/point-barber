import { Injectable } from '@nestjs/common';
import { type MeResponse, toMmtIso, todayMmt } from '@point/shared';

import { GrantSet, GrantSource } from '../../../common/access/grant-set.js';
import { Clock } from '../../../common/clock/clock.js';
import { TransactionRunner } from '../../../common/database/transaction-runner.js';
import { RequestContext } from '../../../common/http/request-context.js';
import { PeopleDirectory } from '../../people/index.js';
import {
  CLIENT_READABLE_KEYS,
  MaintenanceGate,
  SettingsReader,
  TodayBranch,
} from '../../platform/index.js';
import { LoginRepository } from '../repositories/login.repository.js';
import { SessionRepository } from '../repositories/session.repository.js';

// `GET /v1/me` (API-AUTH-05 · P1.ME.01 · P1-RULE-06 · design D13): the caller's own view, assembled
// from the session principal, PeopleDirectory, the grant set, the settings and the session row — and
// returned by a successful code sign-in too. `PATCH /v1/me` (P1.ME.02) sets the interface language.

@Injectable()
export class MeService {
  constructor(
    private readonly logins: LoginRepository,
    private readonly sessions: SessionRepository,
    private readonly directory: PeopleDirectory,
    private readonly grantSource: GrantSource,
    private readonly settings: SettingsReader,
    private readonly maintenance: MaintenanceGate,
    private readonly todayBranch: TodayBranch,
    private readonly runner: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  async build(userId: string, sessionId: string): Promise<MeResponse> {
    const [user, employee, session] = await Promise.all([
      this.logins.userById(userId),
      this.directory.employeeProfile(userId),
      this.sessions.byId(sessionId),
    ]);
    if (user === null || employee === null || session === null) {
      throw new Error('MeService.build: the signed-in caller has no user, employee or session');
    }
    const now = this.clock.now();
    const grants = await this.grantsOf(employee.id, now);
    const [branches, assigned, todayBranchId, settings, extra, maintenance] = await Promise.all([
      this.directory.branchSummaries(
        grants.readScope.all ? undefined : [...grants.readScope.branchIds],
      ),
      this.directory.assignedBranchIds(employee.id),
      this.todayBranch.of(employee.id),
      this.settings.effective(CLIENT_READABLE_KEYS),
      this.settings.effective(['dashboard.show_own_earnings_all']),
      this.maintenance.isOn(),
    ]);
    return {
      user: {
        id: user.id,
        email: user.email,
        status: user.status as MeResponse['user']['status'],
        ui_language: user.ui_language as MeResponse['user']['ui_language'],
        last_login_at: user.last_login_at === null ? null : toMmtIso(user.last_login_at),
      },
      employee: {
        id: employee.id,
        employee_code: employee.employee_code,
        name_mm: employee.name_mm,
        name_en: employee.name_en,
        photo_url: employee.photo_url,
        status: employee.status as MeResponse['employee']['status'],
      },
      grants: grants.merged().map((grant) => ({ ...grant, branch_ids: [...grant.branch_ids] })),
      branches_in_scope: branches,
      today_branch_id: todayBranchId,
      assigned_branch_ids: assigned,
      effective: {
        show_own_earnings: employee.show_own_earnings ?? extra['dashboard.show_own_earnings_all'],
      },
      settings,
      system: {
        maintenance,
        server_time: toMmtIso(now),
        default_language: settings['system.default_language'],
      },
      session: {
        id: session.id,
        device_label: session.device_label,
        created_at: toMmtIso(session.created_at),
      },
    };
  }

  /** P1.ME.02: the caller's own `users.ui_language`; not audited. */
  async setLanguage(userId: string, uiLanguage: number | null): Promise<void> {
    await this.runner.run((tx) =>
      this.logins.setUiLanguage(tx, userId, uiLanguage, this.clock.now()),
    );
  }

  /** The request's grant set when the access guard built one, else built here. */
  private async grantsOf(employeeId: string, now: Date): Promise<GrantSet> {
    const ctx = RequestContext.current();
    if (ctx?.grants !== undefined && ctx.employee_id === employeeId) return ctx.grants;
    return GrantSet.build(await this.grantSource.rowsFor(employeeId), todayMmt(now));
  }
}
