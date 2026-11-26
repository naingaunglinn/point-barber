import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  SIGNED_URL_SECONDS,
  type attachmentListQuerySchema,
  toMmtIso,
  type urlQuerySchema,
} from '@point/shared';
import type { z } from 'zod';

import { Clock } from '../../../common/clock/clock.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { isUuid } from '../../../common/http/uuid-v7.js';
import {
  type AttachmentRow,
  AttachmentsRepository,
  STAGING_ENTITY,
} from '../repositories/attachments.repository.js';
import { StorageService } from '../storage/storage.service.js';
import { type AttachmentDto, toAttachment } from './attachment-dto.js';
import {
  AttachmentPolicies,
  type PolicyCaller,
  type PolicyDecision,
} from './attachment-registries.js';
import { UploaderNames } from './uploader-names.js';
import { variantObject } from './variant-object.js';

// The reads of P8.ATT.02 / 03 / 04 (P8-RULE-03 policy table · API-PERM-03 · CG-SEC-02 · design D2 / D6 /
// D8 / D9). A row the caller may not read, a removed row, an unknown id and a row whose `(entity_type,
// kind)` has no policy all answer the one 404 — the same members, so existence is not revealed. A list
// never carries a URL; a link is made per request, signed locally, and stored nowhere.

const notFound = () => new ProblemException(ErrorCode.NOT_FOUND, 404);

export type SignedUrl = { url: string; expires_at: string };

@Injectable()
export class AttachmentReads {
  constructor(
    private readonly repository: AttachmentsRepository,
    private readonly policies: AttachmentPolicies,
    private readonly names: UploaderNames,
    private readonly storage: StorageService,
    private readonly clock: Clock,
  ) {}

  /** P8.ATT.03 — the metadata of one live file the caller may read. */
  async get(caller: PolicyCaller, id: string): Promise<AttachmentDto> {
    const row = await this.readable(caller, id);
    const names = await this.names.of([row.uploaded_by_user_id]);
    return toAttachment(row, names.get(row.uploaded_by_user_id) ?? '');
  }

  /** P8.ATT.02 — the live files of one entity whose own policy the caller meets, newest first. */
  async list(
    caller: PolicyCaller,
    query: z.infer<typeof attachmentListQuerySchema>,
  ): Promise<{ items: AttachmentDto[] }> {
    const policies = this.policies.ofEntityType(query.entity_type);
    // An entity type nothing registered for (sales, refunds, a typo) is not listed here (AT5).
    if (policies.length === 0) {
      throw new ProblemException(ErrorCode.VALIDATION, 400, {
        errors: [{ field: 'entity_type', code: 'invalid_value' }],
      });
    }
    const decisions = new Map<number, PolicyDecision>();
    for (const policy of policies) {
      decisions.set(policy.kind, await policy.read(caller, query.entity_id));
    }
    // Every kind hidden: the entity is not the caller's to know (another user's staging, an unknown company).
    if ([...decisions.values()].every((decision) => decision === 'hidden')) throw notFound();
    const rows =
      query.entity_type === STAGING_ENTITY
        ? await this.repository.stagingOf(query.entity_id)
        : await this.repository.liveOfEntity(query.entity_type, query.entity_id);
    return { items: await this.present(rows.filter((row) => decisions.get(row.kind) === 'allow')) };
  }

  /** P8.ATT.04 — a 5-minute link to the file or one of its sizes, made for this request only. */
  async url(
    caller: PolicyCaller,
    id: string,
    query: z.infer<typeof urlQuerySchema>,
  ): Promise<SignedUrl> {
    const row = await this.readable(caller, id);
    // The one rule of design D1 / AT3: a size that was not made answers with the original.
    const { key } = variantObject(row, query.variant ?? 'original');
    const now = this.clock.now();
    const url = await this.storage.presignGet(key, {
      expiresInSeconds: SIGNED_URL_SECONDS,
      ...(query.download === true ? { downloadName: row.file_name } : {}),
    });
    return { url, expires_at: toMmtIso(new Date(now.getTime() + SIGNED_URL_SECONDS * 1_000)) };
  }

  /** The live row `id` when its policy lets the caller read it; else the 404. */
  private async readable(caller: PolicyCaller, id: string): Promise<AttachmentRow> {
    const row = isUuid(id) ? await this.repository.findLive(id) : null;
    const decision =
      row === null
        ? undefined
        : await this.policies.of(row.entity_type, row.kind)?.read(caller, row.entity_id);
    if (row === null || decision !== 'allow') throw notFound();
    return row;
  }

  private async present(rows: readonly AttachmentRow[]): Promise<AttachmentDto[]> {
    const names = await this.names.of(rows.map((row) => row.uploaded_by_user_id));
    return rows.map((row) => toAttachment(row, names.get(row.uploaded_by_user_id) ?? ''));
  }
}
