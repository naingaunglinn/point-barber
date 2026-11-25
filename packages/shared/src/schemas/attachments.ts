import { z } from 'zod';

import { FILE_NAME_MAX, REASON_MAX, VARIANT_WIDTHS } from '../constants/attachments.js';
import { AttachmentKind } from '../constants/status.js';
import { codeOf, userRefSchema, wireDateTime } from './wire.js';

// The attachment DTOs of OpenAPI Part 8 (P8.ATT.01 - 05 · API-ERR-03 · CG-API-03 · add-attachments-upload
// design D3 / D6). A response carries no `storage_key` and no URL (CG-SEC-10).

/** image → kind 2 · document → kind 1 · import → kind 3. */
export const UPLOAD_PURPOSES = ['image', 'document', 'import'] as const;

/** `original`, then `w<width>` for each width of `VARIANT_WIDTHS` (contract 11). */
export const ATTACHMENT_VARIANTS = [
  'original',
  ...VARIANT_WIDTHS.map((width) => `w${width}` as const),
] as const;

/**
 * P8.ATT.01. `file` is the received file's NAME — the controller passes the name of the one `file`
 * part, or nothing when there is none; the bytes are judged by the size and type checks. So a missing
 * part is `invalid_type` on `file`, a name over 255 characters `too_big`.
 */
export const attachmentUploadSchema = z.object({
  // The OpenAPI part is the file itself (Part 8 AttachmentUpload: `format: binary`).
  file: z.string().min(1).max(FILE_NAME_MAX).meta({ format: 'binary' }),
  purpose: z.enum(UPLOAD_PURPOSES),
});

/** OpenAPI Part 8 `RemoveRequest` — the reason is required except for one's own staging row. */
export const removeRequestSchema = z.object({
  reason: z.string().max(REASON_MAX).nullable().optional(),
});

/** The query of P8.ATT.04: `variant` outside the four is `invalid_value`; `download` is `true` / `false`. */
export const urlQuerySchema = z.object({
  variant: z.enum(ATTACHMENT_VARIANTS).optional(),
  download: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export const signedUrlSchema = z.strictObject({ url: z.url(), expires_at: wireDateTime });

/**
 * OpenAPI Part 8 `Attachment`. Strict: the mapper names every member, so there is none for the
 * storage key or a URL (design D6). `image` is built from the row's `image_width` / `image_height`.
 */
export const attachmentSchema = z.strictObject({
  id: z.uuid(),
  entity_type: z.string(),
  entity_id: z.uuid(),
  kind: codeOf(AttachmentKind),
  file_name: z.string(),
  mime_type: z.string(),
  size_bytes: z.int(),
  image: z
    .strictObject({
      width: z.int(),
      height: z.int(),
      variants: z.array(z.enum(ATTACHMENT_VARIANTS)),
    })
    .nullable(),
  staging: z.boolean(),
  expires_at: wireDateTime.nullable(),
  uploaded_by: userRefSchema,
  uploaded_at: wireDateTime,
  deleted_at: wireDateTime.nullable(),
});

/** The query of P8.ATT.02: the entity whose live files are listed. */
export const attachmentListQuerySchema = z.object({
  entity_type: z.string().min(1).max(60),
  entity_id: z.uuid(),
});
