import { describe, expect, it } from 'vitest';

import { Clock } from '../../../common/clock/clock.js';
import type { AppConfig } from '../../../common/config/config.js';
import type { AttachmentsRepository } from '../repositories/attachments.repository.js';
import { Attachments } from './attachments.service.js';

// ADR-014 — a generated file's object key is `att/<yyyy>/<mm>/<attachment_id>/original.<ext>`; the id is
// made before the object is stored, so the row written afterwards carries the same id.
class FixedClock extends Clock {
  constructor(private readonly instant: Date) {
    super();
  }
  override now(): Date {
    return this.instant;
  }
}

const CONFIG = { env: { SITE_ORIGIN: 'https://point.test' } } as AppConfig;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('Attachments.newGeneratedKey', () => {
  it('a version-7 id inside the key, the month in Myanmar Time', () => {
    // 30/Sep/2026 18:00 UTC = 01/Oct/2026 00:30 in Yangon.
    const attachments = new Attachments(
      {} as AttachmentsRepository,
      new FixedClock(new Date('2026-09-30T18:00:00Z')),
      CONFIG,
    );
    const { id, storage_key } = attachments.newGeneratedKey('pdf');
    expect(id).toMatch(UUID);
    expect(storage_key).toBe(`att/2026/10/${id}/original.pdf`);
  });

  it('a new id on every call', () => {
    const attachments = new Attachments(
      {} as AttachmentsRepository,
      new FixedClock(new Date()),
      CONFIG,
    );
    expect(attachments.newGeneratedKey('png').id).not.toBe(attachments.newGeneratedKey('png').id);
  });
});

// add-attachments-upload task 3.11 — "Other changes store the stable path, never a signed link, and can
// build sizes from it" (P8-RULE-04 · research E9): the three outputs and the last-segment swap.
describe('Attachments.publicMediaPath / publicMediaUrl', () => {
  const B = '0199a3f2-0000-7000-8a00-00000000000b';
  const attachments = new Attachments(
    {} as AttachmentsRepository,
    new FixedClock(new Date()),
    CONFIG,
  );

  it('the three outputs with SITE_ORIGIN = https://point.test', () => {
    expect(attachments.publicMediaPath(B)).toBe(`/api/v1/public/media/${B}/original`);
    expect(attachments.publicMediaPath(B, 'w800')).toBe(`/api/v1/public/media/${B}/w800`);
    expect(attachments.publicMediaUrl(B)).toBe(
      `https://point.test/api/v1/public/media/${B}/original`,
    );
  });

  it('swapping the last segment of the stored path gives the path of another size', () => {
    const stored = attachments.publicMediaPath(B);
    expect(stored.replace(/\/original$/, '/w400')).toBe(attachments.publicMediaPath(B, 'w400'));
  });
});
