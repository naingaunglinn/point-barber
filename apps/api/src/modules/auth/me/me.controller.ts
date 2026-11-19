import { Controller, Get, Header, Patch } from '@nestjs/common';
import { type MeResponse, type PatchMe, patchMeSchema } from '@point/shared';

import { Self } from '../../../common/access/declarations.js';
import { RequestContext } from '../../../common/http/request-context.js';
import { ZBody } from '../../../common/http/zod-validation.pipe.js';
import { MeService } from './me.service.js';

/** The signed-in caller of the request — the session guard has put it in the context. */
export function caller(): { readonly userId: string; readonly sessionId: string } {
  const ctx = RequestContext.current();
  if (ctx?.user_id === undefined || ctx.session_id === undefined) {
    throw new Error('no signed-in caller in the request context');
  }
  return { userId: ctx.user_id, sessionId: ctx.session_id };
}

@Controller('v1/me')
export class MeController {
  constructor(private readonly me: MeService) {}

  /** P1.ME.01 — the caller's own data; never cached (API-AUTH-05). */
  @Get()
  @Header('Cache-Control', 'no-store')
  @Self()
  read(): Promise<MeResponse> {
    const { userId, sessionId } = caller();
    return this.me.build(userId, sessionId);
  }

  /** P1.ME.02 — the caller's interface language (1 MY · 2 EN · null = system default). */
  @Patch()
  @Header('Cache-Control', 'no-store')
  @Self()
  async update(@ZBody(patchMeSchema) body: PatchMe): Promise<MeResponse> {
    const { userId, sessionId } = caller();
    if (body.ui_language !== undefined) await this.me.setLanguage(userId, body.ui_language);
    return this.me.build(userId, sessionId);
  }
}
