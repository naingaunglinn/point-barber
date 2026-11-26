import { UPLOAD_ALLOWED_FORMATS } from '@point/shared';
import { describe, expect, it } from 'vitest';

import { UPLOAD_TYPES } from './accept';

// add-attachments-upload task 1.7 — the `allowed` names of a type refusal (design D4) are the format
// names `AttachmentUploader` shows for the same purpose, in the same order (P8-RULE-03 R3-19).
describe('upload types: the server list = the uploader list', () => {
  it.each(['image', 'document', 'import'] as const)('purpose %s', (purpose) => {
    expect(UPLOAD_TYPES[purpose].map((type) => type.name)).toEqual(UPLOAD_ALLOWED_FORMATS[purpose]);
  });
});
