import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AccessGuard } from './common/access/access.guard.js';
import { AccessModule } from './common/access/access.module.js';
import { CoreModule } from './common/core.module.js';
import { DatabaseModule } from './common/database/database.module.js';
import { CsrfGuard } from './common/http/csrf.guard.js';
import { AuthModule, SessionGuard } from './modules/auth/index.js';
import { BookingModule } from './modules/booking/index.js';
import { CashClosingModule } from './modules/cash-closing/index.js';
import { CatalogModule } from './modules/catalog/index.js';
import { DeliveryModule } from './modules/delivery/index.js';
import { PayrollModule } from './modules/payroll/index.js';
import { PeopleModule } from './modules/people/index.js';
import { PlatformModule } from './modules/platform/index.js';
import { SalesModule } from './modules/sales/index.js';

@Module({
  imports: [
    CoreModule,
    DatabaseModule,
    AccessModule,
    PeopleModule,
    PlatformModule,
    AuthModule,
    BookingModule,
    CashClosingModule,
    CatalogModule,
    PayrollModule,
    SalesModule,
    DeliveryModule,
  ],
  // The three global guards, in the order of design D2: a forged changing request is refused before
  // any session or database work; the session is checked before any permission.
  providers: [
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useExisting: SessionGuard },
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
})
export class AppModule {}
