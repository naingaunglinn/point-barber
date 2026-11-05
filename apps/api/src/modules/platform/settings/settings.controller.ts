import { Controller, Get } from '@nestjs/common';
import {
  type EffectiveSettings,
  type EffectiveSettingsQuery,
  type SettingHistoryPage,
  type SettingHistoryQuery,
  type SettingList,
  type SettingListQuery,
  effectiveSettingsQuerySchema,
  settingHistoryQuerySchema,
  settingKeyParamSchema,
  settingListQuerySchema,
} from '@point/shared';

import { AccessContext } from '../../../common/access/access-context.js';
import { CanView, Staff } from '../../../common/access/declarations.js';
import type { GrantSet } from '../../../common/access/grant-set.js';
import { RequestContext } from '../../../common/http/request-context.js';
import { ZParam, ZQuery } from '../../../common/http/zod-validation.pipe.js';
import { SettingsStore } from './settings-store.js';

// The settings endpoints of API Part 1 (D-PLT-07 · D-PLT-16 · add-settings-store design D5). The
// reads are declared for any `settings.*` grant (P1.SET.01 / 05 — mixed: the store filters the branch
// values) or any signed-in staff member (P1.SET.02).

/** The caller's grants, which the access guard built for this route's declaration (design D11). */
function callerGrants(): GrantSet {
  const grants = RequestContext.current()?.grants;
  if (grants === undefined) throw new Error('settings: the access guard built no grant set');
  return grants;
}

@Controller('v1/settings')
export class SettingsController {
  constructor(private readonly store: SettingsStore) {}

  /** P1.SET.01 */
  @Get()
  @CanView('settings')
  async list(@ZQuery(settingListQuerySchema) query: SettingListQuery): Promise<SettingList> {
    return {
      items: await this.store.list(callerGrants(), {
        module: query.module,
        branchId: query.branch_id,
      }),
    };
  }

  /** P1.SET.02 */
  @Get('effective')
  @Staff()
  effective(
    @ZQuery(effectiveSettingsQuerySchema) query: EffectiveSettingsQuery,
  ): Promise<EffectiveSettings> {
    return this.store.effectiveForClient(AccessContext.scope(), {
      keys: query.keys,
      branchId: query.branch_id,
    });
  }

  /** P1.SET.05 */
  @Get(':key/history')
  @CanView('settings')
  history(
    @ZParam(settingKeyParamSchema) params: { key: string },
    @ZQuery(settingHistoryQuerySchema) query: SettingHistoryQuery,
  ): Promise<SettingHistoryPage> {
    return this.store.history(callerGrants(), params.key, {
      branchId: query.branch_id,
      cursor: query.cursor,
      limit: query.limit,
    });
  }
}
