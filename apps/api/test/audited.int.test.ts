import { randomUUID } from 'node:crypto';

import { AuditSource } from '@point/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import {
  FIXTURE_BRANCH_HEADER,
  FIXTURE_EMPLOYEE_HEADER,
  FIXTURE_REFUSE_HEADER,
  FIXTURE_SESSION_HEADER,
  FIXTURE_USER_HEADER,
} from './helpers/fixture-actor.js';
import { type TestPerson, createBranch, createPerson, testCompany } from './helpers/people.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-foundation-auth-access task 2.4 — audit spec "Each action endpoint writes one application audit
// row with the branch it acted on" (API-AUD-01 · P1-RULE-10 · design D12). The guards arrive in
// group 4; until then the fixture-actor headers carry what they resolve.
const NOW = new Date('2026-10-05T11:30:00.000Z'); // Monday 05/Oct/2026 6:00 PM MMT
let t: TestApp;
let prisma: PrismaService;
let b1: string;
let b3: string;
let hnin: TestPerson; // Ma Hnin — Manager of B3

beforeAll(async () => {
  t = await startTestApp({ now: NOW });
  prisma = t.app.get(PrismaService);
  const company = await testCompany(prisma);
  b1 = await createBranch(prisma, company);
  b3 = await createBranch(prisma, company);
  hnin = await createPerson(prisma, company, { branches: [{ id: b3, from: '2026-09-01' }] });
});
afterAll(async () => {
  await t.close();
});

const appRows = (requestId: string) =>
  prisma.audit_events.findMany({ where: { request_id: requestId, source: AuditSource.APP } });

function post(path: string, person: TestPerson, requestId: string) {
  return t.http
    .post(`/api/v1/_fixtures/${path}`)
    .set('X-Request-Id', requestId)
    .set(FIXTURE_USER_HEADER, person.userId)
    .set(FIXTURE_SESSION_HEADER, person.sessionId)
    .set(FIXTURE_EMPLOYEE_HEADER, person.employeeId);
}

describe('add-foundation-auth-access · audit · Each action endpoint writes one application audit row with the branch it acted on', () => {
  it('Scenario: The branch the guard resolved', async () => {
    const requestId = randomUUID();
    const res = await post('branch-action', hnin, requestId)
      .set(FIXTURE_BRANCH_HEADER, b3)
      .send({ branch_id: b3, reason: 'fixture reason' });
    expect(res.status).toBe(200);
    expect(await appRows(requestId)).toMatchObject([
      {
        action: 'fixture.branch_action',
        entity_id: res.body.id,
        actor_user_id: hnin.userId,
        actor_session_id: hnin.sessionId,
        branch_id: b3,
        reason: 'fixture reason',
        occurred_at: NOW,
      },
    ]);
  });

  it('Scenario: A company-master action has no branch', async () => {
    const requestId = randomUUID();
    expect((await post('company-action', hnin, requestId)).status).toBe(200);
    expect(await appRows(requestId)).toMatchObject([{ branch_id: null }]);
  });

  it('Scenario: A request touching two branches has no branch', async () => {
    const requestId = randomUUID();
    const res = await post('branch-items', hnin, requestId).send({
      items: [{ branch_id: b1 }, { branch_id: b3 }],
    });
    expect(res.status).toBe(200);
    expect(await appRows(requestId)).toMatchObject([{ branch_id: null }]);
  });

  it('Scenario: A refused action leaves no row', async () => {
    const requestId = randomUUID();
    const res = await post('branch-action', hnin, requestId)
      .set(FIXTURE_REFUSE_HEADER, '1')
      .send({ branch_id: b1 });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden' });
    expect(await appRows(requestId)).toHaveLength(0);
  });

  it('Scenario: Reading is not audited', async () => {
    const requestId = randomUUID();
    const res = await t.http.get('/api/v1/_fixtures/branch-action').set('X-Request-Id', requestId);
    expect(res.status).toBe(200);
    expect(await prisma.audit_events.count({ where: { request_id: requestId } })).toBe(0);
  });

  it('the branch of the one entity, when the guard resolved none', async () => {
    const requestId = randomUUID();
    await post('entity-action', hnin, requestId).send({ branch_id: b1 });
    expect(await appRows(requestId)).toMatchObject([{ branch_id: b1 }]);
  });

  it('the guard-resolved branch wins over the entity branch', async () => {
    const requestId = randomUUID();
    await post('entity-action', hnin, requestId)
      .set(FIXTURE_BRANCH_HEADER, b3)
      .send({ branch_id: b1 });
    expect(await appRows(requestId)).toMatchObject([{ branch_id: b3 }]);
  });
});

describe('the branch of an employee-targeted action (D12 · P1-RULE-10)', () => {
  it('is the primary branch: the active assignment with the earliest effective_from', async () => {
    const company = await testCompany(prisma);
    const target = await createPerson(prisma, company, {
      branches: [
        { id: b3, from: '2026-09-15' },
        { id: b1, from: '2026-09-01' },
      ],
    });
    const requestId = randomUUID();
    await post('employee-action', hnin, requestId).send({ employee_id: target.employeeId });
    expect(await appRows(requestId)).toMatchObject([{ branch_id: b1 }]);
  });

  it('ignores an ended assignment and one that starts later', async () => {
    const company = await testCompany(prisma);
    const target = await createPerson(prisma, company, {
      branches: [
        { id: b1, from: '2026-08-01', to: '2026-09-30' },
        { id: b1, from: '2026-11-01' },
        { id: b3, from: '2026-10-01' },
      ],
    });
    const requestId = randomUUID();
    await post('employee-action', hnin, requestId).send({ employee_id: target.employeeId });
    expect(await appRows(requestId)).toMatchObject([{ branch_id: b3 }]);
  });

  it('breaks a tie on effective_from by created_at, then id', async () => {
    const company = await testCompany(prisma);
    const target = await createPerson(prisma, company, {
      branches: [
        { id: b3, from: '2026-09-01' },
        { id: b1, from: '2026-09-01' },
      ],
    });
    const requestId = randomUUID();
    await post('employee-action', hnin, requestId).send({ employee_id: target.employeeId });
    // b3's row was created first.
    expect(await appRows(requestId)).toMatchObject([{ branch_id: b3 }]);
  });

  it('is NULL when the employee has no active assignment', async () => {
    const target = await createPerson(prisma, await testCompany(prisma));
    const requestId = randomUUID();
    await post('employee-action', hnin, requestId).send({ employee_id: target.employeeId });
    expect(await appRows(requestId)).toMatchObject([{ branch_id: null }]);
  });

  it('is the caller’s own primary branch when the event names no employee (sign-out)', async () => {
    const requestId = randomUUID();
    await post('employee-action', hnin, requestId).send({});
    expect(await appRows(requestId)).toMatchObject([{ branch_id: b3 }]);
  });
});
