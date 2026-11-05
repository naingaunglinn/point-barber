import { Controller, HttpCode, Post, Put } from '@nestjs/common';
import {
  type SettingPutBody,
  type SettingResetBody,
  type SettingView,
  settingKeyParamSchema,
  settingPutBodySchema,
  settingResetBodySchema,
} from '@point/shared';

import { Can } from '../../../common/access/declarations.js';
import type { GrantSet } from '../../../common/access/grant-set.js';
import { RequestContext } from '../../../common/http/request-context.js';
import { ZBody, ZParam } from '../../../common/http/zod-validation.pipe.js';
import { Audited } from '../audit/audited.js';
import { SettingsCommands } from './settings-commands.js';

// The settings writes of API Part 1 (P1.SET.03 / 04 · design D5): `settings.update` for the company
// master (no branch_id → company scope, else 403 company_scope_required) or for the branch of an
// override (403 forbidden naming the code). Registered in PlatformModule beside the audit writer.

function callerGrants(): GrantSet {
  const grants = RequestContext.current()?.grants;
  if (grants === undefined) throw new Error('settings: the access guard built no grant set');
  return grants;
}

@Controller('v1/settings')
export class SettingsWriteController {
  constructor(private readonly commands: SettingsCommands) {}

  /** P1.SET.03 */
  @Put(':key')
  @Audited({ actions: ['settings.set'] })
  @Can('settings.update', { branch: 'body.branch_id?' })
  set(
    @ZParam(settingKeyParamSchema) params: { key: string },
    @ZBody(settingPutBodySchema) body: SettingPutBody,
  ): Promise<SettingView> {
    return this.commands.set(callerGrants(), params.key, body);
  }

  /** P1.SET.04 */
  @Post(':key/reset')
  @HttpCode(200)
  @Audited({ actions: ['settings.reset'] })
  @Can('settings.update', { branch: 'body.branch_id?' })
  reset(
    @ZParam(settingKeyParamSchema) params: { key: string },
    @ZBody(settingResetBodySchema.optional()) body: SettingResetBody | undefined,
  ): Promise<SettingView> {
    return this.commands.reset(callerGrants(), params.key, body);
  }
}
