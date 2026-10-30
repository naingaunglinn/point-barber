import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/database/prisma.service.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { TransactionScope } from '../../../common/database/transaction-scope.js';

// The attachments table (Part 8 — the platform module owns it; F-P8-05 polymorphic rows). This change
// writes only generated rows: the receipt PDF and PNG of a sale or a refund.

export interface AttachmentRow {
  readonly id: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly kind: number;
  readonly storage_key: string;
  readonly file_name: string;
  readonly mime_type: string;
  readonly size_bytes: number;
  readonly uploaded_by_user_id: string;
  readonly uploaded_at: Date;
}

export interface NewAttachment {
  readonly id: string;
  readonly company_id: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly kind: number;
  readonly storage_key: string;
  readonly file_name: string;
  readonly mime_type: string;
  readonly size_bytes: number;
  readonly uploaded_by_user_id: string;
  readonly uploaded_at: Date;
}

const SELECT = {
  id: true,
  entity_type: true,
  entity_id: true,
  kind: true,
  storage_key: true,
  file_name: true,
  mime_type: true,
  size_bytes: true,
  uploaded_by_user_id: true,
  uploaded_at: true,
} as const;

@Injectable()
export class AttachmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return TransactionScope.current()?.tx ?? this.prisma;
  }

  async insert(tx: Tx, row: NewAttachment): Promise<AttachmentRow> {
    const created = await tx.attachments.create({
      data: { ...row, size_bytes: BigInt(row.size_bytes) },
      select: SELECT,
    });
    return { ...created, size_bytes: Number(created.size_bytes) };
  }

  /** The live (not deleted) rows of one entity, ordered by MIME type then id. */
  async liveOf(entityType: string, entityId: string): Promise<AttachmentRow[]> {
    const rows = await this.db.attachments.findMany({
      where: { entity_type: entityType, entity_id: entityId, deleted_at: null },
      orderBy: [{ mime_type: 'asc' }, { id: 'asc' }],
      select: SELECT,
    });
    return rows.map((row) => ({ ...row, size_bytes: Number(row.size_bytes) }));
  }

  /** `receipt:<entity_id>` — exclusive, held to commit (CG-DB-08 · design D10). */
  async lockReceiptFiles(tx: Tx, entityId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`receipt:${entityId}`}, 0))`;
  }
}
