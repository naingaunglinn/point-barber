import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { TransactionRunner } from '../src/common/database/transaction-runner.js';
import { LIST_MAX } from '../src/common/limits.js';
import { Attachments } from '../src/modules/platform/index.js';
import { AttachmentsRepository } from '../src/modules/platform/repositories/attachments.repository.js';
import { type FreshDatabase, freshDatabase } from './helpers/databases.js';
import { createPerson, testCompany } from './helpers/people.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-attachments-upload task 3.1 — AttachmentsRepository (insertStaging, findLive, liveOfEntity, stagingOf,
// markDeleted) and Attachments.findLive (DB Part 8 `attachments` · CG-DB-06 · CG-PERF-02 · "Server code reads
// a live row and the object of a variant through two service methods"). A fresh copy of the migrated database.
let db: FreshDatabase;
let t: TestApp;
let prisma: PrismaService;
let runner: TransactionRunner;
let repository: AttachmentsRepository;
let attachments: Attachments;
let companyId: string;
let userId: string;
let otherUserId: string;

beforeAll(async () => {
  db = await freshDatabase();
  t = await startTestApp({ databaseUrl: db.url });
  prisma = t.app.get(PrismaService);
  runner = t.app.get(TransactionRunner);
  repository = t.app.get(AttachmentsRepository);
  attachments = t.app.get(Attachments);
  companyId = await testCompany(prisma);
  userId = (await createPerson(prisma, companyId)).userId;
  otherUserId = (await createPerson(prisma, companyId)).userId;
});
afterAll(async () => {
  await t.close();
  await db.drop();
});

const staging = (uploader: string, minute: number, size: [number, number] | null = null) => {
  const id = randomUUID();
  return {
    id,
    company_id: companyId,
    kind: size === null ? 1 : 2,
    storage_key: `att/2026/10/${id}/original.${size === null ? 'pdf' : 'png'}`,
    file_name: `f${minute}`,
    mime_type: size === null ? 'application/pdf' : 'image/png',
    size_bytes: 10 + minute,
    uploaded_by_user_id: uploader,
    uploaded_at: new Date(Date.UTC(2026, 9, 5, 4, minute)),
    image_width: size?.[0] ?? null,
    image_height: size?.[1] ?? null,
  };
};

describe('AttachmentsRepository', () => {
  it('insertStaging writes an uploads row for the uploader with the picture size, and reads return both columns', async () => {
    const image = staging(userId, 1, [600, 400]);
    const document = staging(userId, 2);
    await runner.run(async (tx) => {
      await repository.insertStaging(tx, image);
      await repository.insertStaging(tx, document);
    });
    expect(await repository.findLive(image.id)).toMatchObject({
      entity_type: 'uploads',
      entity_id: userId,
      kind: 2,
      size_bytes: 11,
      image_width: 600,
      image_height: 400,
    });
    expect(await repository.findLive(document.id)).toMatchObject({
      image_width: null,
      image_height: null,
    });
  });

  it('stagingOf and liveOfEntity: newest first, at most LIST_MAX — 101 rows give 100', async () => {
    const rows = Array.from({ length: LIST_MAX + 1 }, (_, i) => staging(otherUserId, i));
    await runner.run(async (tx) => {
      for (const row of rows) await repository.insertStaging(tx, row);
    });
    const listed = await repository.stagingOf(otherUserId);
    expect(listed).toHaveLength(LIST_MAX);
    // The oldest of the 101 is the one left out.
    expect(listed.map((row) => row.id)).toStrictEqual(
      rows
        .slice(1)
        .reverse()
        .map((row) => row.id),
    );
    expect(await repository.liveOfEntity('uploads', otherUserId)).toHaveLength(LIST_MAX);
    expect(LIST_MAX).toBe(100);
  });

  it("stagingOf is the user's own rows only; markDeleted removes a row from every live read", async () => {
    const own = staging(userId, 30);
    await runner.run((tx) => repository.insertStaging(tx, own));
    expect((await repository.stagingOf(userId)).map((row) => row.id)).toContain(own.id);
    expect((await repository.stagingOf(otherUserId)).map((row) => row.id)).not.toContain(own.id);
    await runner.run((tx) => repository.markDeleted(tx, own.id, userId, new Date()));
    expect((await repository.stagingOf(userId)).map((row) => row.id)).not.toContain(own.id);
    expect(await repository.findLive(own.id)).toBeNull();
    const row = await prisma.attachments.findUniqueOrThrow({ where: { id: own.id } });
    expect(row.deleted_by_user_id).toBe(userId);
  });

  it('a system soft delete keeps deleted_by_user_id NULL', async () => {
    const row = staging(userId, 40);
    await runner.run((tx) => repository.insertStaging(tx, row));
    await runner.run((tx) => repository.markDeleted(tx, row.id, null, new Date()));
    const stored = await prisma.attachments.findUniqueOrThrow({ where: { id: row.id } });
    expect([stored.deleted_at === null, stored.deleted_by_user_id]).toStrictEqual([false, null]);
  });
});

describe('Scenario: Finding a live row (Attachments.findLive)', () => {
  it('returns the row while it is the logo, null after it is soft-deleted, and null for the unknown id', async () => {
    const logo = staging(userId, 50, [800, 400]);
    await runner.run((tx) =>
      repository.insert(tx, { ...logo, entity_type: 'companies', entity_id: companyId }),
    );
    expect(await attachments.findLive(logo.id)).toMatchObject({
      entity_type: 'companies',
      kind: 2,
      image_width: 800,
    });
    await runner.run((tx) => repository.markDeleted(tx, logo.id, null, new Date()));
    expect(await attachments.findLive(logo.id)).toBeNull();
    expect(await attachments.findLive('0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70')).toBeNull();
  });
});
