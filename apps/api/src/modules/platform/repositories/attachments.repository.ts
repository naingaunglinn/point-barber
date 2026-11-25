import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/database/prisma.service.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { TransactionScope } from '../../../common/database/transaction-scope.js';
import { LIST_MAX } from '../../../common/limits.js';

/** `entity_type` of a staging row: the file is the uploader's own until an owner links it (P8-RULE-03). */
export const STAGING_ENTITY = 'uploads';

// The attachments table (Part 8 — the platform module owns it; F-P8-05 polymorphic rows): the generated
// receipt files (add-walkin-visit-checkout) and the staging rows of an upload (add-attachments-upload).
// Every read names its columns (CG-DB-06); a list ends in `take = LIST_MAX` (CG-PERF-02).

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
  /** The stored original's pixels; both NULL for every file that is not a measured image (AT8). */
  readonly image_width: number | null;
  readonly image_height: number | null;
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
  readonly image_width?: number | null;
  readonly image_height?: number | null;
}

/** The staging row of an upload: the uploader's own, so `entity_id` is the user and is not passed. */
export type NewStaging = Omit<NewAttachment, 'entity_type' | 'entity_id'>;

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
  image_width: true,
  image_height: true,
} as const;

const toRow = <T extends { size_bytes: bigint }>(row: T) => ({
  ...row,
  size_bytes: Number(row.size_bytes),
});

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
    return toRow(created);
  }

  /** The row of a new upload, inside the caller's transaction (no bucket call runs in it, CG-DB-10). */
  insertStaging(tx: Tx, row: NewStaging): Promise<AttachmentRow> {
    return this.insert(tx, {
      ...row,
      entity_type: STAGING_ENTITY,
      entity_id: row.uploaded_by_user_id,
    });
  }

  /** The live (not deleted) rows of one entity, ordered by MIME type then id. */
  async liveOf(entityType: string, entityId: string): Promise<AttachmentRow[]> {
    const rows = await this.db.attachments.findMany({
      where: { entity_type: entityType, entity_id: entityId, deleted_at: null },
      orderBy: [{ mime_type: 'asc' }, { id: 'asc' }],
      select: SELECT,
    });
    return rows.map(toRow);
  }

  /** The newest live rows of an entity, at most `LIST_MAX` (P8.ATT.02). */
  async liveOfEntity(entityType: string, entityId: string): Promise<AttachmentRow[]> {
    const rows = await this.db.attachments.findMany({
      where: { entity_type: entityType, entity_id: entityId, deleted_at: null },
      orderBy: [{ uploaded_at: 'desc' }, { id: 'desc' }],
      take: LIST_MAX,
      select: SELECT,
    });
    return rows.map(toRow);
  }

  /** A user's own live staging rows, newest first, at most `LIST_MAX`. */
  stagingOf(userId: string): Promise<AttachmentRow[]> {
    return this.liveOfEntity(STAGING_ENTITY, userId);
  }

  /** One live (not deleted) row by id; null when there is none (add-company-profile design D7). */
  async findLive(id: string): Promise<AttachmentRow | null> {
    const row = await this.db.attachments.findFirst({
      where: { id, deleted_at: null },
      select: SELECT,
    });
    return row === null ? null : toRow(row);
  }

  /** Soft delete (D-DAT-05): `by` null is the system (a replacement, the purge). */
  async markDeleted(tx: Tx, id: string, by: string | null, at: Date): Promise<void> {
    await tx.attachments.update({
      where: { id },
      data: { deleted_at: at, deleted_by_user_id: by },
    });
  }

  /** `receipt:<entity_id>` — exclusive, held to commit (CG-DB-08 · design D10). */
  async lockReceiptFiles(tx: Tx, entityId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`receipt:${entityId}`}, 0))`;
  }
}
