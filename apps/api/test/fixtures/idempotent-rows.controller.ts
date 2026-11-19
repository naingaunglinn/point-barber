import { randomUUID } from 'node:crypto';

import { Controller, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';

import { Public } from '../../src/common/access/public.decorator.js';
import { PrismaService } from '../../src/common/database/prisma.service.js';
import { TransactionRunner } from '../../src/common/database/transaction-runner.js';
import { ZBody } from '../../src/common/http/zod-validation.pipe.js';
import {
  Audit,
  Audited,
  Idempotency,
  Idempotent,
  IdempotencyKey,
} from '../../src/modules/platform/index.js';

// `POST /v1/_fixtures/idempotent-rows` (design D14 · platform-runtime spec): a row-creating endpoint
// with identifying fields `branch_id` and `amount` and a free `note`, writing to the test table
// fixtures.idempotent_rows. Test application only. `latch` lets a test hold a request inside its
// transaction, or make another writer take the key between find() and create().

const bodySchema = z.object({
  branch_id: z.uuid(),
  amount: z.number().int(),
  note: z.string().optional(),
});
type Body = z.infer<typeof bodySchema>;

export interface FixtureRow {
  readonly id: string;
  readonly client_request_id: string;
  readonly branch_id: string;
  readonly amount: number;
  readonly note: string | null;
}

export const idempotencyLatch: {
  /** Set: create() waits until it resolves, after `entered` has been called. */
  hold?: { entered: () => void; release: Promise<void> };
  /** Set: create() first commits a row with the same key from another connection. */
  collide?: boolean;
} = {};

@Controller('v1/_fixtures/idempotent-rows')
export class IdempotentRowsFixtureController {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly idempotency: Idempotency,
    private readonly audit: Audit,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @HttpCode(201)
  @Public()
  @Idempotent()
  @Audited({ actions: ['fixture.idempotent_row'] })
  create(@ZBody(bodySchema) body: Body, @IdempotencyKey() key: string): Promise<FixtureRow> {
    return this.runner.run(async (tx) => {
      const { row } = await this.idempotency.run(tx, {
        key,
        find: async () => {
          const rows = await tx.$queryRaw<FixtureRow[]>`
            SELECT id, client_request_id, branch_id, amount, note
            FROM fixtures.idempotent_rows WHERE client_request_id = ${key}::uuid`;
          return rows[0] ?? null;
        },
        same: (row) => row.branch_id === body.branch_id && row.amount === body.amount,
        create: async () => {
          const hold = idempotencyLatch.hold;
          if (hold !== undefined) {
            hold.entered();
            await hold.release;
          }
          if (idempotencyLatch.collide === true) {
            idempotencyLatch.collide = false;
            await this.prisma.$executeRaw`
              INSERT INTO fixtures.idempotent_rows (id, client_request_id, branch_id, amount)
              VALUES (${randomUUID()}::uuid, ${key}::uuid, ${body.branch_id}::uuid, ${body.amount})`;
          }
          const id = randomUUID();
          await tx.$executeRaw`
            INSERT INTO fixtures.idempotent_rows (id, client_request_id, branch_id, amount, note)
            VALUES (${id}::uuid, ${key}::uuid, ${body.branch_id}::uuid, ${body.amount}, ${body.note ?? null})`;
          await this.audit.emit({
            action: 'fixture.idempotent_row',
            entity_type: 'fixtures',
            entity_id: id,
            branch_id: body.branch_id,
          });
          return {
            id,
            client_request_id: key,
            branch_id: body.branch_id,
            amount: body.amount,
            note: body.note ?? null,
          };
        },
      });
      return row;
    });
  }
}
