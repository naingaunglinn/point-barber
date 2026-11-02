// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { forgetLateEntryTimes, keepLateEntryTimes, keptLateEntryTimes } from './late-entry-times';

// add-late-entry task 4.4 (design D6) — the later times of a late entry kept on this device between the
// steps, under `point.lateEntry.<visit_id>`; storage that is missing or refuses never breaks a step.

const VISIT = '0199a3f2-0000-7000-8000-0000000000aa';
const TIMES = {
  completed_at: '2026-10-04T15:30:00+06:30',
  received_at: '2026-10-04T15:35:00+06:30',
  finished_at: '2026-10-04T15:35:00+06:30',
};

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('late-entry times on this device (task 4.4)', () => {
  it('keeps, reads and forgets the three times by visit', () => {
    keepLateEntryTimes(VISIT, TIMES);
    expect(localStorage.getItem(`point.lateEntry.${VISIT}`)).not.toBeNull();
    expect(keptLateEntryTimes(VISIT)).toStrictEqual(TIMES);
    expect(keptLateEntryTimes('another-visit')).toBeNull();
    forgetLateEntryTimes(VISIT);
    expect(keptLateEntryTimes(VISIT)).toBeNull();
  });

  it('a damaged entry reads as nothing kept; a missing member as null', () => {
    localStorage.setItem(`point.lateEntry.${VISIT}`, '{not json');
    expect(keptLateEntryTimes(VISIT)).toBeNull();
    localStorage.setItem(`point.lateEntry.${VISIT}`, JSON.stringify({ completed_at: 5 }));
    expect(keptLateEntryTimes(VISIT)).toStrictEqual({
      completed_at: null,
      received_at: null,
      finished_at: null,
    });
  });

  it('storage that refuses (private mode, full) — no error, nothing kept, the step asks', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    expect(() => keepLateEntryTimes(VISIT, TIMES)).not.toThrow();
    expect(keptLateEntryTimes(VISIT)).toBeNull();
    expect(() => forgetLateEntryTimes(VISIT)).not.toThrow();
  });
});
