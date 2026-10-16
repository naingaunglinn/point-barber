import { Module, type OnModuleInit } from '@nestjs/common';

import { PeopleModule } from '../people/index.js';
import { Jobs, PlatformModule } from '../platform/index.js';
import { AuthController } from './auth.controller.js';
import { GoogleStateStore } from './google/google-state.js';
import { GoogleController } from './google/google.controller.js';
import { GoogleSignIn } from './google/google.service.js';
import { AUTH_CLEANUP, AUTH_CLEANUP_CRON, AuthCleanup } from './jobs/auth-cleanup.js';
import { MeController } from './me/me.controller.js';
import { MeService } from './me/me.service.js';
import { OtpService } from './otp/otp.service.js';
import { LoginRepository } from './repositories/login.repository.js';
import { SessionRepository } from './repositories/session.repository.js';
import { SessionGuard } from './session/session.guard.js';
import { SessionService } from './session/session.service.js';
import { SignInService } from './sign-in/sign-in.service.js';

// Bounded context `auth` (ADR-001 · docs/engineering/module-map.md): sign-in, sessions, devices and
// one-time codes. It reads the employee of a user through PeopleDirectory and writes its audit rows
// through the platform audit writer.
@Module({
  imports: [PeopleModule, PlatformModule],
  controllers: [AuthController, GoogleController, MeController],
  providers: [
    SessionRepository,
    LoginRepository,
    SessionService,
    SessionGuard,
    SignInService,
    OtpService,
    MeService,
    GoogleStateStore,
    GoogleSignIn,
    AuthCleanup,
  ],
  exports: [SessionService, SessionGuard, MeService],
})
export class AuthModule implements OnModuleInit {
  constructor(
    private readonly jobs: Jobs,
    private readonly cleanup: AuthCleanup,
  ) {}

  onModuleInit(): void {
    this.jobs.register(AUTH_CLEANUP, async () => {
      await this.cleanup.run();
    });
    this.jobs.schedule(AUTH_CLEANUP, AUTH_CLEANUP_CRON);
  }
}
