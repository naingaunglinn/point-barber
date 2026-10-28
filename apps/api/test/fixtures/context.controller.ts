import { Controller, HttpCode, Post } from '@nestjs/common';

import { Staff } from '../../src/common/access/declarations.js';
import { Public } from '../../src/common/access/public.decorator.js';
import { TransactionRunner } from '../../src/common/database/transaction-runner.js';

// `POST /v1/_fixtures/context` — reads the three transaction settings inside its own transaction
// (audit spec "Every changing request carries its user, session and request id into the database"):
// as a signed-in caller, and `context/anonymous` before sign-in.
@Controller('v1/_fixtures/context')
export class ContextFixtureController {
  constructor(private readonly runner: TransactionRunner) {}

  @Post()
  @HttpCode(200)
  @Staff()
  read(): Promise<{
    user_id: string | null;
    session_id: string | null;
    request_id: string | null;
  }> {
    return this.settings();
  }

  @Post('anonymous')
  @HttpCode(200)
  @Public()
  anonymous(): Promise<{
    user_id: string | null;
    session_id: string | null;
    request_id: string | null;
  }> {
    return this.settings();
  }

  private settings(): Promise<{
    user_id: string | null;
    session_id: string | null;
    request_id: string | null;
  }> {
    return this.runner.run(async (tx) => {
      const rows = await tx.$queryRaw<
        { user_id: string | null; session_id: string | null; request_id: string | null }[]
      >`SELECT current_setting('app.user_id', true) AS user_id,
               current_setting('app.session_id', true) AS session_id,
               current_setting('app.request_id', true) AS request_id`;
      const [row] = rows;
      if (row === undefined) throw new Error('no row');
      return row;
    });
  }
}
