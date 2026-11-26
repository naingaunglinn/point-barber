import { describe, expect, it } from 'vitest';

import {
  BYTES_PER_MB,
  FILE_NAME_MAX,
  IMAGE_LONG_EDGE_PX,
  PURGE_BATCH,
  PURGE_WINDOW_DAYS,
  REASON_MAX,
  SIGNED_URL_SECONDS,
  STAGING_HOURS,
  VARIANT_WIDTHS,
} from './attachments.js';
import { AttachmentKind } from './status.js';

// add-attachments-upload task 1.3 — the fixed limits are pinned (ADR-014 decision 8 · CG-ARCH-09 ·
// D-DB-03): a change of one is a spec change, so it fails here first.
describe('attachment limits', () => {
  it('pins the numbers, and 10 MB is 10,485,760 bytes', () => {
    expect([SIGNED_URL_SECONDS, STAGING_HOURS, IMAGE_LONG_EDGE_PX]).toEqual([300, 24, 2560]);
    expect([FILE_NAME_MAX, REASON_MAX, PURGE_BATCH, PURGE_WINDOW_DAYS]).toEqual([
      255, 1000, 200, 30,
    ]);
    expect(VARIANT_WIDTHS).toEqual([400, 800, 1600]);
    expect(10 * BYTES_PER_MB).toBe(10_485_760);
  });

  it('the kind codes of attachments.kind are declared once, in status.ts', () => {
    expect(AttachmentKind).toEqual({ DOCUMENT: 1, IMAGE: 2, IMPORT_FILE: 3 });
  });
});
