// Limits of the attachment upload fixed in code, each with its source (CG-ARCH-09). The upload size is
// the setting `system.upload_max_mb` (API-LIM-03); the kind codes are `AttachmentKind` in status.ts.

/** A signed download link lives 300 seconds, made for each request (ADR-014 decision 4 · P8.ATT.04). */
export const SIGNED_URL_SECONDS = 300;

/** A staging file nobody linked is purged after 24 hours (ADR-014 decision 5 · P8-RULE-03). */
export const STAGING_HOURS = 24;

/** The long edge of a stored image, in pixels (ADR-014 decision 3 · P8-RULE-03 · design D5). */
export const IMAGE_LONG_EDGE_PX = 2560;

/** The WebP variant widths, ascending (ADR-014 decision 3 · P8-RULE-03 · contract 11 · design D5). */
export const VARIANT_WIDTHS = [400, 800, 1600] as const;

/** Bytes in one megabyte of `system.upload_max_mb`: 10 MB = 10,485,760 bytes (API-LIM-03). */
export const BYTES_PER_MB = 1_048_576;

/** `attachments.file_name` is `varchar(255)` (DB Part 8 · API-SHAPE-05 · design D3). */
export const FILE_NAME_MAX = 255;

/** `RemoveRequest.reason` `maxLength` (OpenAPI Part 8 · P8.ATT.05). */
export const REASON_MAX = 1000;

/** Rows per batch of the hourly purge of deleted files (design D11 · P8-RULE-18). */
export const PURGE_BATCH = 200;

/** The purge reaches back 30 days — the bucket keeps a non-current version that long (design D11 · R8). */
export const PURGE_WINDOW_DAYS = 30;
