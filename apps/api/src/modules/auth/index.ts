// Public surface of the `auth` module (CG-ARCH-01 · ADR-001 rule 1): other modules import only from
// here.
export { AuthModule } from './auth.module.js';
export {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  readCookie,
  sessionCookie,
} from './session/session-cookie.js';
export { SessionGuard } from './session/session.guard.js';
export {
  type SessionMeta,
  SessionService,
  type SessionState,
  reissuePeriod,
  sessionState,
} from './session/session.service.js';
export { newSessionToken, sessionTokenHash } from './session/session-token.js';
