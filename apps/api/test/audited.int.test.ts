import { randomUUID } from 'node:crypto';

import { AuditSource } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPerson, testCompany } from './helpers/people.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-foundation-auth-access task 2.4 — audit spec "Each action endpoint writes one application audit
// row with the branch it acted on" (API-AUD-01 · P1-RULE-10 · design D12), with the seed people and
// the guards of group 4: the access guard resolves the branch the row records.
const NOW = new Date('2026-10-05T11:30:00.000Z'); // Monday 05/Oct/2026 6:00 PM MMT
const { B1, B3 } = FIXTURE_IDS.branches;
let t: SeededApp;
let hnin: { sessionId: string; cookie: string }; // Ma Hnin — Manager of B3
let kyawZin: { sessionId: string; cookie: string }; // U Kyaw Zin — Admin, company scope

beforeAll(async () => {
  t = await startSeededApp({ now: NOW });
  hnin = await t.signIn('E002');
  kyawZin = await t.signIn('E001');
});
afterAll(async () => {
  await t.close();
});

const appRows = (requestId: string) =>
  t.prisma.audit_events.findMany({ where: { request_id: requestId, source: AuditSource.APP } });

function post(path: string, caller: { cookie: string }, requestId: string) {
  return t.http
    .post(`/api/v1/_fixtures/${path}`)
    .set('X-Request-Id', requestId)
    .set('Cookie', caller.cookie);
}

describe('add-foundation-auth-access · audit · Each action endpoint writes one application audit row with the branch it acted on', () => {
  it('Scenario: The branch the guard resolved', async () => {
    const requestId = randomUUID();
    const res = await post('branch-action', hnin, requestId).send({
      branch_id: B3,
      reason: 'fixture reason',
    });
    expect(res.status).toBe(200);
    expect(await appRows(requestId)).toMatchObject([
      {
        action: 'fixture.branch_action',
        entity_id: res.body.id,
        actor_user_id: FIXTURE_IDS.users.E002,
        actor_session_id: hnin.sessionId,
        branch_id: B3,
        reason: 'fixture reason',
        occurred_at: NOW,
      },
    ]);
  });

  it('Scenario: A company-master action has no branch', async () => {
    const requestId = randomUUID();
    expect((await post('company-action', kyawZin, requestId)).status).toBe(200);
    expect(await appRows(requestId)).toMatchObject([{ branch_id: null }]);
  });

  it('Scenario: A request touching two branches has no branch', async () => {
    const requestId = randomUUID();
    const res = await post('branch-items', kyawZin, requestId).send({
      items: [{ branch_id: B1 }, { branch_id: B3 }],
    });
    expect(res.status).toBe(200);
    expect(await appRows(requestId)).toMatchObject([{ branch_id: null }]);
  });

  it('Scenario: A refused action leaves no row', async () => {
    const requestId = randomUUID();
    const res = await post('branch-action', hnin, requestId).send({ branch_id: B1 });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden' });
    expect(await appRows(requestId)).toHaveLength(0);
  });

  it('Scenario: Reading is not audited', async () => {
    const requestId = randomUUID();
    const res = await t.http.get('/api/v1/_fixtures/branch-action').set('X-Request-Id', requestId);
    expect(res.status).toBe(200);
    expect(await t.prisma.audit_events.count({ where: { request_id: requestId } })).toBe(0);
  });

  it('the branch of the one entity, when the guard resolved none', async () => {
    const requestId = randomUUID();
    await post('entity-action', hnin, requestId).send({ branch_id: B1 });
    expect(await appRows(requestId)).toMatchObject([{ branch_id: B1 }]);
  });

  it('the guard-resolved branch wins over the entity branch', async () => {
    const requestId = randomUUID();
    await post('branch-action', hnin, requestId).send({ branch_id: B3, entity_branch_id: B1 });
    expect(await appRows(requestId)).toMatchObject([{ branch_id: B3 }]);
  });
});

describe('the branch of an employee-targeted action (D12 · P1-RULE-10)', () => {
  it('is the primary branch: the active assignment with the earliest effective_from', async () => {
    const target = await createPerson(t.prisma, await testCompany(t.prisma), {
      branches: [
        { id: B3, from: '2026-09-15' },
        { id: B1, from: '2026-09-01' },
      ],
    });
    const requestId = randomUUID();
    await post('employee-action', hnin, requestId).send({ employee_id: target.employeeId });
    expect(await appRows(requestId)).toMatchObject([{ branch_id: B1 }]);
  });

  it('ignores an ended assignment and one that starts later', async () => {
    const target = await createPerson(t.prisma, await testCompany(t.prisma), {
      branches: [
        { id: B1, from: '2026-08-01', to: '2026-09-30' },
        { id: B1, from: '2026-11-01' },
        { id: B3, from: '2026-10-01' },
      ],
    });
    const requestId = randomUUID();
    await post('employee-action', hnin, requestId).send({ employee_id: target.employeeId });
    expect(await appRows(requestId)).toMatchObject([{ branch_id: B3 }]);
  });

  it('breaks a tie on effective_from by created_at, then id', async () => {
    const target = await createPerson(t.prisma, await testCompany(t.prisma), {
      branches: [
        { id: B3, from: '2026-09-01' },
        { id: B1, from: '2026-09-01' },
      ],
    });
    const requestId = randomUUID();
    await post('employee-action', hnin, requestId).send({ employee_id: target.employeeId });
    // B3's row was created first.
    expect(await appRows(requestId)).toMatchObject([{ branch_id: B3 }]);
  });

  it('is NULL when the employee has no active assignment', async () => {
    const target = await createPerson(t.prisma, await testCompany(t.prisma));
    const requestId = randomUUID();
    await post('employee-action', hnin, requestId).send({ employee_id: target.employeeId });
    expect(await appRows(requestId)).toMatchObject([{ branch_id: null }]);
  });

  it('is the caller’s own primary branch when the event names no employee (sign-out)', async () => {
    const requestId = randomUUID();
    await post('employee-action', hnin, requestId).send({});
    expect(await appRows(requestId)).toMatchObject([{ branch_id: B3 }]);
  });
});
