import { describe, expect, it } from 'vitest';

import { Clock } from '../../../common/clock/clock.js';
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('Attachments.newGeneratedKey', () => {
  it('a version-7 id inside the key, the month in Myanmar Time', () => {
    // 30/Sep/2026 18:00 UTC = 01/Oct/2026 00:30 in Yangon.
    const attachments = new Attachments(
      {} as AttachmentsRepository,
      new FixedClock(new Date('2026-09-30T18:00:00Z')),
    );
    const { id, storage_key } = attachments.newGeneratedKey('pdf');
    expect(id).toMatch(UUID);
    expect(storage_key).toBe(`att/2026/10/${id}/original.pdf`);
  });

  it('a new id on every call', () => {
    const attachments = new Attachments({} as AttachmentsRepository, new FixedClock(new Date()));
    expect(attachments.newGeneratedKey('png').id).not.toBe(attachments.newGeneratedKey('png').id);
  });
});
