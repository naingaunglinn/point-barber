import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { type FreshDatabase, freshDatabase } from './helpers/databases.js';

// add-attachments-upload task 1.8 — the migration `<timestamp>_attachments_image_size` (DB Part 8 v1.2 ·
// AT8 = A · "The picture's size is stored on the row ..."): two nullable integer columns without a
// default, the CHECK attachments_image_size_chk, and nothing changed by a second run. The row cases
// (1200 x 800 and NULL / NULL accepted; half a size, 0, -1 and a size on a PDF or CSV refused; a kind 1
// JPEG accepted; attachments_size_chk and attachments_deleted_chk unchanged) are part8-...-test.sql
// 51 - 59, which `pnpm db:test` runs on the migrated database. On a fresh copy of the migrated database.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

let db: FreshDatabase;
let owner: PrismaService;

beforeAll(async () => {
  db = await freshDatabase();
  owner = new PrismaService({ env: { DATABASE_URL: db.ownerUrl } } as never);
});
afterAll(async () => {
  await owner.$disconnect();
  await db.drop();
});

const shape = async () => ({
  columns: await owner.$queryRaw<unknown[]>`
    SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
    WHERE table_name = 'attachments' ORDER BY ordinal_position`,
  constraints: await owner.$queryRaw<unknown[]>`
    SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
    WHERE conrelid = 'attachments'::regclass ORDER BY conname`,
});

describe('attachments after the migration', () => {
  it('has image_width and image_height (integer, nullable, no default) and attachments_image_size_chk', async () => {
    const { columns, constraints } = await shape();
    const size = (name: string) => ({
      column_name: name,
      data_type: 'integer',
      is_nullable: 'YES',
      column_default: null,
    });
    expect(columns).toEqual(expect.arrayContaining([size('image_width'), size('image_height')]));
    expect(constraints).toEqual(
      expect.arrayContaining(
        ['attachments_size_chk', 'attachments_deleted_chk', 'attachments_image_size_chk'].map(
          (conname) => expect.objectContaining({ conname }),
        ),
      ),
    );
  });

  it('a second run of the migrate entry point changes nothing', async () => {
    const before = await shape();
    const run = spawnSync(process.execPath, [join(root, 'db/scripts/migrate.mjs')], {
      cwd: root,
      env: { ...process.env, MIGRATE_DATABASE_URL: db.ownerUrl },
      encoding: 'utf8',
    });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('No pending migrations to apply');
    expect(await shape()).toStrictEqual(before);
  });
});
