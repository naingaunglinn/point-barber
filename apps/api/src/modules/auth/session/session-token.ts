import { createHash, randomBytes } from 'node:crypto';

// The session token (API-AUTH-01 · ADR-005 · design D6): 32 random bytes in base64url without
// padding — 43 characters. Only its SHA-256 hex digest is stored (`user_sessions.token_hash`).

export const newSessionToken = (): string => randomBytes(32).toString('base64url');

export const sessionTokenHash = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');
