import { describe, expect, it } from 'vitest';

import { lateEntryOrderViolation } from './late-entry-order.js';

// add-late-entry task 1.3 — P4-RULE-13 · design D2: started ≤ completed ≤ every received ≤ finished ≤
// now. The clock of the integration tests: 05/Oct/2026 9:30 AM MMT; the paper walk-in is yesterday's.
const NOW = '2026-10-05T09:30:00+06:30';
const STARTED = '2026-10-04T15:00:00+06:30';
const COMPLETED = '2026-10-04T15:30:00+06:30';
const RECEIVED = '2026-10-04T15:35:00+06:30';
const FINISHED = '2026-10-04T15:35:00+06:30';
const all = {
  startedAt: STARTED,
  completedAt: COMPLETED,
  receivedAts: [RECEIVED],
  finishedAt: FINISHED,
  now: NOW,
};

describe('lateEntryOrderViolation', () => {
  it('passes four times in order, the payment and the finish at the same minute', () => {
    expect(lateEntryOrderViolation(all)).toBeNull();
  });

  it('passes four equal times, and times equal to now', () => {
    expect(
      lateEntryOrderViolation({
        startedAt: NOW,
        completedAt: NOW,
        receivedAts: [NOW, NOW],
        finishedAt: NOW,
        now: NOW,
      }),
    ).toBeNull();
  });

  it.each([
    ['completed_at', { completedAt: '2026-10-04T14:59:00+06:30' }],
    ['received_at', { receivedAts: ['2026-10-04T15:29:00+06:30'] }],
    ['received_at', { receivedAts: [RECEIVED, '2026-10-04T15:29:00+06:30'] }],
    ['finished_at', { finishedAt: '2026-10-04T15:34:00+06:30' }],
  ])('one minute out of order → %s', (member, change) => {
    expect(lateEntryOrderViolation({ ...all, ...change })).toBe(member);
  });

  it.each([
    ['started_at', { startedAt: '2026-10-05T09:31:00+06:30', completedAt: null, receivedAts: [] }],
    ['completed_at', { completedAt: '2026-10-05T09:31:00+06:30' }],
    ['received_at', { receivedAts: ['2026-10-05T09:31:00+06:30'] }],
    ['finished_at', { finishedAt: '2026-10-05T09:31:00+06:30' }],
  ])('one minute after now → %s (LE-1)', (member, change) => {
    expect(lateEntryOrderViolation({ ...all, ...change })).toBe(member);
  });

  it('a start later than now is named before an out-of-order completion', () => {
    expect(
      lateEntryOrderViolation({
        ...all,
        startedAt: '2026-10-05T10:00:00+06:30',
        completedAt: STARTED,
      }),
    ).toBe('started_at');
  });

  it('two payments may come in any order between completion and finish', () => {
    expect(
      lateEntryOrderViolation({
        ...all,
        receivedAts: ['2026-10-04T15:34:00+06:30', '2026-10-04T15:31:00+06:30'],
      }),
    ).toBeNull();
  });

  it('the finish is checked against the latest payment', () => {
    expect(
      lateEntryOrderViolation({
        ...all,
        receivedAts: ['2026-10-04T15:31:00+06:30', '2026-10-04T15:40:00+06:30'],
        finishedAt: '2026-10-04T15:35:00+06:30',
      }),
    ).toBe('finished_at');
  });

  describe('missing members are skipped (each step checks the times that exist then)', () => {
    it('START: the start alone', () => {
      expect(lateEntryOrderViolation({ startedAt: STARTED, now: NOW })).toBeNull();
    });

    it('a payment before COMPLETE is checked against the start', () => {
      expect(
        lateEntryOrderViolation({ startedAt: STARTED, receivedAts: [STARTED], now: NOW }),
      ).toBeNull();
      expect(
        lateEntryOrderViolation({
          startedAt: STARTED,
          receivedAts: ['2026-10-04T14:59:00+06:30'],
          now: NOW,
        }),
      ).toBe('received_at');
    });

    it('a finish without payments is checked against the completion', () => {
      expect(
        lateEntryOrderViolation({
          startedAt: STARTED,
          completedAt: COMPLETED,
          finishedAt: '2026-10-04T15:29:00+06:30',
          now: NOW,
        }),
      ).toBe('finished_at');
    });

    it('null members are skipped like missing ones', () => {
      expect(
        lateEntryOrderViolation({
          startedAt: STARTED,
          completedAt: null,
          finishedAt: null,
          now: NOW,
        }),
      ).toBeNull();
    });
  });

  it('compares instants, not their text: the same moment in UTC is equal', () => {
    expect(
      lateEntryOrderViolation({
        startedAt: STARTED,
        completedAt: '2026-10-04T08:30:00Z',
        now: NOW,
      }),
    ).toBeNull();
    expect(
      lateEntryOrderViolation({
        startedAt: STARTED,
        completedAt: '2026-10-04T08:29:00Z',
        now: NOW,
      }),
    ).toBe('completed_at');
  });
});
