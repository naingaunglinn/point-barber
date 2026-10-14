import { Injectable } from '@nestjs/common';

import { Clock } from '../../../common/clock/clock.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { uuidV7 } from '../../../common/http/uuid-v7.js';
import { Audit } from '../../platform/index.js';
import { CompanyRepository } from '../repositories/company.repository.js';

// The seed roles (D-ROLE-09 · ADR-011 · ADR-012 · Part 1 §10 · design D10): on the first start of a
// company that has no role at all — archived ones count, so a role the admin renamed or archived is
// never re-created — Admin gets every code, Manager the six codes whose Part 1 seed entry names
// Manager (the two "Manager if the owner wants" codes are not seeded — owner sheet record R2), Barber
// none. Scope is not part of a role. Names: fixtures §2 and the brief's copy table (owner answer S18).

/** Part 1 §10 entries whose seed names Manager without a condition. */
export const MANAGER_SEED_CODES = [
  'branch.view',
  'employee.view',
  'employee.rating_update',
  'role.assign',
  'settings.view',
  'settings.update',
] as const;

const SEED_ROLES = [
  { name_en: 'Admin', name_mm: 'အက်ဒမင်', codes: 'all' },
  { name_en: 'Manager', name_mm: 'မန်နေဂျာ', codes: MANAGER_SEED_CODES },
  { name_en: 'Barber', name_mm: 'ဘာဘာ', codes: [] },
] as const;

@Injectable()
export class SeedRoles {
  constructor(
    private readonly repository: CompanyRepository,
    private readonly audit: Audit,
    private readonly clock: Clock,
  ) {}

  /** Creates the three roles when the company has none; otherwise changes nothing. */
  async ensure(tx: Tx, companyId: string): Promise<void> {
    if ((await this.repository.roleCount(tx, companyId)) > 0) return;
    const now = this.clock.now();
    const permissions = await this.repository.activePermissions(tx);
    const id = () => uuidV7(now.getTime());
    for (const seed of SEED_ROLES) {
      const codes = seed.codes === 'all' ? [...permissions.keys()] : [...seed.codes];
      const role = {
        id: id(),
        company_id: companyId,
        name_mm: seed.name_mm,
        name_en: seed.name_en,
      };
      const permissionIds = codes.map((code) => {
        const permissionId = permissions.get(code);
        if (permissionId === undefined)
          throw new Error(`seed role ${seed.name_en}: no code ${code}`);
        return permissionId;
      });
      await this.repository.createRole(tx, role, permissionIds, id, now);
      this.audit.emitSystem({
        action: 'role.create',
        entity_type: 'roles',
        entity_id: role.id,
        after: { name_mm: role.name_mm, name_en: role.name_en, codes: [...codes].sort() },
      });
    }
  }
}
