import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { Can, CanView, Internal, Self, Staff } from './declarations.js';
import { ACCESS_METADATA, Public } from './public.decorator.js';

// add-foundation-auth-access task 4.8 — the declarations are typed on PermissionCode (access spec "The
// permission catalogue is one file and holds the 21 Part 1 codes" · API-PERM-02 · design D11): a code
// that is not in permissions.json does not compile. `pnpm typecheck` runs over this file, so every
// expected-error directive below fails the build the day its line starts to compile.

class Routes {
  @Can('employee.view', { branch: 'params.id→entity.branch_id', orSelf: 'entity.employee_id' })
  read(): void {}

  @Can('role.update', { level: 'company' })
  write(): void {}

  @CanView('employee')
  list(): void {}

  @Staff()
  staff(): void {}

  @Self()
  self(): void {}

  @Public()
  open(): void {}

  @Internal()
  internal(): void {}
}

describe('access declarations (task 4.8)', () => {
  it('do not compile with a code or a module outside the catalogue', () => {
    // @ts-expect-error — `manage` codes do not exist (ADR-011); not in permissions.json.
    Can('employee.manage', { level: 'company' });
    // @ts-expect-error — no module `payroll_admin`.
    CanView('payroll_admin');
    // @ts-expect-error — a @Can names a level, a branch path or a target.
    Can('employee.view', {});
    expect(true).toBe(true);
  });

  it('store one declaration per handler for the guards', () => {
    const reflector = new Reflector();
    const of = (name: keyof Routes) =>
      reflector.get<unknown>(ACCESS_METADATA, Routes.prototype[name] as () => void);
    expect(of('read')).toStrictEqual({
      kind: 'can',
      code: 'employee.view',
      branch: 'params.id→entity.branch_id',
      orSelf: 'entity.employee_id',
    });
    expect(of('write')).toStrictEqual({ kind: 'can', code: 'role.update', level: 'company' });
    expect(of('list')).toStrictEqual({ kind: 'canView', module: 'employee' });
    expect(of('staff')).toStrictEqual({ kind: 'staff' });
    expect(of('self')).toStrictEqual({ kind: 'self' });
    expect(of('open')).toStrictEqual({ kind: 'public' });
    expect(of('internal')).toStrictEqual({ kind: 'internal' });
  });
});
