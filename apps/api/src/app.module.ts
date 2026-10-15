import { Module } from '@nestjs/common';

import { CoreModule } from './common/core.module.js';
import { DatabaseModule } from './common/database/database.module.js';
import { PeopleModule } from './modules/people/index.js';
import { PlatformModule } from './modules/platform/index.js';
import { SalesModule } from './modules/sales/index.js';

@Module({
  imports: [CoreModule, DatabaseModule, PeopleModule, PlatformModule, SalesModule],
})
export class AppModule {}
