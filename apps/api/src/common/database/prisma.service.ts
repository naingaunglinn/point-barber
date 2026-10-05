import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { APP_TIME_ZONE } from '@point/shared';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../generated/prisma/client.js';
import { AppConfig } from '../config/config.js';

// The API's database connection: role point_app through DATABASE_URL (design D4.4 / D4.7 ·
// CG-DB-03). The Prisma client is imported only here and in modules' repositories/ (design D10).

/** Third time-zone layer (D-PLT-15 · design D4.7c): the API refuses to run outside Asia/Yangon. */
export function assertMyanmarTimeZone(timeZone: string | undefined): void {
  if (timeZone !== APP_TIME_ZONE) {
    throw new Error(
      `Database session time zone is ${timeZone ?? '(unknown)'}, expected ${APP_TIME_ZONE} — ` +
        'check ALTER ROLE point_app SET timezone and the database default (D-PLT-15)',
    );
  }
}

/** The health ping (design D9), separate so a test can make it fail or hang. */
export abstract class DatabaseProbe {
  abstract ping(): Promise<void>;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements DatabaseProbe, OnModuleInit, OnModuleDestroy
{
  constructor(config: AppConfig) {
    super({ adapter: new PrismaPg({ connectionString: config.env.DATABASE_URL }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    const rows = await this.$queryRaw<{ TimeZone: string }[]>`SHOW timezone`;
    assertMyanmarTimeZone(rows[0]?.TimeZone);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
