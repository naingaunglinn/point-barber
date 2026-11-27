import { describe, expect, it } from 'vitest';

import { COMPANY_ROOM, branchRoom, isRoom, userRoom } from './rooms.js';

// add-realtime-gateway task 1.2 (the part add-schedule-patterns A5 needs) — API-RT-01 room names.
const ID = '0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b';

describe('realtime rooms (API-RT-01)', () => {
  it('builds the three kinds of room', () => {
    expect(userRoom(ID)).toBe(`user:${ID}`);
    expect(branchRoom(ID)).toBe(`branch:${ID}`);
    expect(COMPANY_ROOM).toBe('company');
  });

  it('accepts company, user:<uuid> and branch:<uuid>', () => {
    expect([COMPANY_ROOM, userRoom(ID), branchRoom(ID)].map(isRoom)).toStrictEqual([
      true,
      true,
      true,
    ]);
  });

  it.each([
    'branch:',
    'user:',
    'team:1',
    'company:1',
    'branch:abc',
    `branch:${ID}:x`,
    `Branch:${ID}`,
    '',
    7,
    null,
  ])('refuses %j', (value) => {
    expect(isRoom(value)).toBe(false);
  });
});
