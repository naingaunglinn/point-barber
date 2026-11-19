import { Global, Module } from '@nestjs/common';

import { DatabaseProbe, PrismaService } from './prisma.service.js';
import { TransactionRunner } from './transaction-runner.js';

@Global()
@Module({
  providers: [
    PrismaService,
    { provide: DatabaseProbe, useExisting: PrismaService },
    TransactionRunner,
  ],
  exports: [PrismaService, DatabaseProbe, TransactionRunner],
})
export class DatabaseModule {}
