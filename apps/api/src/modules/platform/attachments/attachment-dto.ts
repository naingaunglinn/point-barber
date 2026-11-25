import { AttachmentKind, STAGING_HOURS, type attachmentSchema, toMmtIso } from '@point/shared';
import type { z } from 'zod';

import { type AttachmentRow, STAGING_ENTITY } from '../repositories/attachments.repository.js';
import { variantsOf } from './variant-object.js';

// The `Attachment` of OpenAPI Part 8, built from a live row alone (design D6 · AT8): no bucket call, and
// no member for the storage key or a URL — the schema is strict and a test pins its member list.

export type AttachmentDto = z.infer<typeof attachmentSchema>;

/** The database CHECK allows 1 / 2 / 3 only; anything else is a defect, not a case to map. */
function kindOf(kind: number): AttachmentDto['kind'] {
  const known = Object.values(AttachmentKind).find((value) => value === kind);
  if (known === undefined) throw new Error(`attachments.kind ${kind} is not a kind`);
  return known;
}

/**
 * `image` = `{ width, height, variants }` from the row's own size — `variants` is `"original"` then each
 * width not wider than the stored original (the one function the pipeline and `variantObject` use); null
 * for a file that is not a measured image (a PDF, a CSV, a generated receipt PNG).
 */
function imageOf(row: AttachmentRow): AttachmentDto['image'] {
  if (row.image_width === null || row.image_height === null) return null;
  return {
    width: row.image_width,
    height: row.image_height,
    variants: variantsOf(row.image_width),
  };
}

/** A live row as the API returns it; `uploaderName` is the uploader's `display_name`. */
export function toAttachment(row: AttachmentRow, uploaderName: string): AttachmentDto {
  const staging = row.entity_type === STAGING_ENTITY;
  return {
    id: row.id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    kind: kindOf(row.kind),
    file_name: row.file_name,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    image: imageOf(row),
    staging,
    // Computed, not stored: the purge reads `uploaded_at` (P8-RULE-03).
    expires_at: staging
      ? toMmtIso(new Date(row.uploaded_at.getTime() + STAGING_HOURS * 3_600_000))
      : null,
    uploaded_by: { user_id: row.uploaded_by_user_id, display_name: uploaderName },
    uploaded_at: toMmtIso(row.uploaded_at),
    // Only live rows are read; a soft-deleted row is never mapped.
    deleted_at: null,
  };
}
