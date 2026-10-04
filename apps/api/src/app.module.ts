import { Module } from '@nestjs/common';

import { CoreModule } from './common/core.module.js';
import { DatabaseModule } from './common/database/database.module.js';
import { PlatformModule } from './modules/platform/index.js';

@Module({
  imports: [CoreModule, DatabaseModule, PlatformModule],
})
export class AppModule {}
