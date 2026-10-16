import { Module } from '@nestjs/common';

import { PeopleModule } from '../people/index.js';
import { PlatformModule } from '../platform/index.js';
import { SessionRepository } from './repositories/session.repository.js';
import { SessionGuard } from './session/session.guard.js';
import { SessionService } from './session/session.service.js';

// Bounded context `auth` (ADR-001 · docs/engineering/module-map.md): sign-in, sessions, devices and
// one-time codes. It reads the employee of a user through PeopleDirectory and writes its audit rows
// through the platform audit writer.
@Module({
  imports: [PeopleModule, PlatformModule],
  providers: [SessionRepository, SessionService, SessionGuard],
  exports: [SessionService, SessionGuard],
})
export class AuthModule {}
