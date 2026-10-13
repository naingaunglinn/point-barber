import { Module } from '@nestjs/common';

import { PeopleDirectory } from './directory/people-directory.js';
import { PeopleRepository } from './repositories/people.repository.js';

// Bounded context `people` (ADR-001 · docs/engineering/module-map.md): company, branches, employees,
// branch assignments, roles and permissions.
@Module({
  providers: [PeopleRepository, PeopleDirectory],
  exports: [PeopleDirectory],
})
export class PeopleModule {}
