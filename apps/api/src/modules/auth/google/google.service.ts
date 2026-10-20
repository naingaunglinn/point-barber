import { Inject, Injectable } from '@nestjs/common';
import * as oidc from 'openid-client';
import { UserStatus } from '@point/shared';
import type { Logger } from 'pino';

import { Clock } from '../../../common/clock/clock.js';
import { AppConfig } from '../../../common/config/config.js';
import { TransactionRunner } from '../../../common/database/transaction-runner.js';
import { LOGGER } from '../../../common/logging/logger.js';
import { type LoginUser, LoginRepository } from '../repositories/login.repository.js';
import { type SignInMeta, SignInService } from '../sign-in/sign-in.service.js';
import { GoogleStateStore, safeReturnTo } from './google-state.js';

// Google sign-in in a browser (P1.AUTH.03 / 04 · D-AUTH-08 · ADR-005 · design D7): the
// authorisation-code flow with PKCE, a `state` tied to the browser by a cookie and a `nonce` in the ID
// token. The identity rules: a known `sub` signs in its user; otherwise the verified address must
// equal the address of a user without a Google account, whose `sub` is then stored. Every failure
// has one answer — the login screen with `google_not_linked` — and one `login.failed` row.

export const STATE_COOKIE = 'point_oauth_state';
export const STATE_COOKIE_PATH = '/api/v1/auth/google';
export const NOT_LINKED = '/login?error=google_not_linked';

export type CallbackResult =
  | { readonly ok: true; readonly location: string; readonly token: string }
  | { readonly ok: false; readonly location: string };

type Identity =
  | { readonly kind: 'user'; readonly user: LoginUser; readonly link: boolean }
  | { readonly kind: 'refused'; readonly cause: string; readonly userId: string | null };

@Injectable()
export class GoogleSignIn {
  private configuration: Promise<oidc.Configuration> | undefined;

  constructor(
    private readonly config: AppConfig,
    private readonly states: GoogleStateStore,
    private readonly logins: LoginRepository,
    private readonly signIn: SignInService,
    private readonly runner: TransactionRunner,
    private readonly clock: Clock,
    @Inject(LOGGER) private readonly log: Logger,
  ) {}

  private get redirectUri(): string {
    return `${this.config.env.APP_ORIGIN}/api/v1/auth/google/callback`;
  }

  /**
   * The issuer's metadata, discovered once. The ID token's signature is checked against the issuer's
   * keys (`enableNonRepudiationChecks` — openid-client skips it by default for a token taken straight
   * from the token endpoint; design D7 · PR #21 review item 4). The test issuer is plain HTTP, allowed
   * in test only.
   */
  private oidcConfig(): Promise<oidc.Configuration> {
    this.configuration ??= (async () => {
      const { GOOGLE_ISSUER, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_ENV } = this.config.env;
      const insecure = APP_ENV === 'test' && GOOGLE_ISSUER.startsWith('http:');
      return oidc.discovery(
        new URL(GOOGLE_ISSUER),
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        undefined,
        {
          execute: [
            oidc.enableNonRepudiationChecks,
            ...(insecure ? [oidc.allowInsecureRequests] : []),
          ],
        },
      );
    })().catch((err: unknown) => {
      this.configuration = undefined;
      throw err;
    });
    return this.configuration;
  }

  /** P1.AUTH.03: the authorisation URL and the state for the cookie. */
  async start(returnTo: string | undefined): Promise<{ location: string; state: string }> {
    const configuration = await this.oidcConfig();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    this.states.put(state, {
      codeVerifier,
      nonce,
      returnTo: safeReturnTo(returnTo, this.config.env.APP_ORIGIN),
    });
    const url = oidc.buildAuthorizationUrl(configuration, {
      redirect_uri: this.redirectUri,
      scope: 'openid email',
      response_type: 'code',
      code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    return { location: url.href, state };
  }

  /**
   * P1.AUTH.04: state → code exchange with the PKCE verifier → ID token (signature, iss, aud, exp,
   * nonce) → `email_verified` → identity rules → one transaction for activation, session and audit.
   */
  async callback(
    query: Readonly<Record<string, unknown>>,
    cookieState: string | undefined,
    meta: SignInMeta,
  ): Promise<CallbackResult> {
    const state = typeof query.state === 'string' ? query.state : undefined;
    const pending =
      state === undefined || state !== cookieState ? undefined : this.states.take(state);
    if (pending === undefined || state === undefined)
      return this.refuse('state_mismatch', null, null, meta);
    if (query.error !== undefined || typeof query.code !== 'string') {
      return this.refuse('google_error', null, null, meta);
    }

    let claims: oidc.IDToken | undefined;
    try {
      const current = new URL(this.redirectUri);
      for (const [name, value] of Object.entries(query)) {
        if (typeof value === 'string') current.searchParams.set(name, value);
      }
      const tokens = await oidc.authorizationCodeGrant(await this.oidcConfig(), current, {
        pkceCodeVerifier: pending.codeVerifier,
        expectedState: state,
        expectedNonce: pending.nonce,
        idTokenExpected: true,
      });
      claims = tokens.claims();
    } catch (err) {
      this.log.warn({ err: { name: (err as Error).name } }, 'google code exchange failed');
      return this.refuse('google_error', null, null, meta);
    }
    const subject = claims?.sub;
    const email = typeof claims?.email === 'string' ? claims.email.toLowerCase() : null;
    if (subject === undefined || email === null)
      return this.refuse('google_error', null, email, meta);
    if (claims?.email_verified !== true) return this.refuse('email_unverified', null, email, meta);

    const identity = await this.identify(subject, email);
    if (identity.kind === 'refused')
      return this.refuse(identity.cause, identity.userId, email, meta);

    const { user, link } = identity;
    // The identity is decided again under the row lock (PR #21 review items 3 and 5): two first
    // sign-ins on one address cannot both link, and a user disabled meanwhile gets no session.
    const outcome = await this.runner.run(
      async (tx): Promise<{ token: string } | { refused: string }> => {
        const locked = await this.logins.lockUser(tx, user.id);
        if (locked === null) return { refused: 'no_match' };
        if (locked.status !== UserStatus.ACTIVE && locked.status !== UserStatus.INVITED) {
          return { refused: 'ineligible' };
        }
        const linkedTo = locked.google_subject;
        if (linkedTo !== null && linkedTo !== subject) return { refused: 'subject_mismatch' };
        return this.signIn.succeed(
          tx,
          locked,
          'google',
          this.clock.now(),
          meta,
          link && linkedTo === null ? { googleSubject: subject } : {},
        );
      },
    );
    if ('refused' in outcome) return this.refuse(outcome.refused, user.id, email, meta);
    return { ok: true, location: pending.returnTo ?? '/', token: outcome.token };
  }

  /** D-AUTH-08: by `sub`; at the first Google sign-in by the verified address of an unlinked user. */
  private async identify(subject: string, email: string): Promise<Identity> {
    const bySubject = await this.logins.userByGoogleSubject(subject);
    const user = bySubject ?? (await this.logins.userByEmail(email));
    if (user === null) return { kind: 'refused', cause: 'no_match', userId: null };
    if (bySubject === null && user.google_subject !== null) {
      return { kind: 'refused', cause: 'subject_mismatch', userId: user.id };
    }
    if (!(await this.signIn.eligible(user))) {
      return { kind: 'refused', cause: 'ineligible', userId: user.id };
    }
    return { kind: 'user', user, link: bySubject === null };
  }

  private async refuse(
    cause: string,
    userId: string | null,
    email: string | null,
    meta: SignInMeta,
  ): Promise<CallbackResult> {
    await this.runner.run(() => this.signIn.failed('google', userId, email, meta, cause));
    return { ok: false, location: NOT_LINKED };
  }
}
