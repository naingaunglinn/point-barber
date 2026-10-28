import { createSign, generateKeyPairSync, randomBytes } from 'node:crypto';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

// A stub OpenID Connect issuer for the integration tests (add-foundation-auth-access task 5.12 ·
// design D7): discovery, JWKS and a token endpoint that returns an RS256-signed ID token for the
// identity a test has queued with issue(). An identity-provider double, not a login endpoint of the
// app; `GOOGLE_ISSUER` points at it in the test application only. Google itself is tested by hand.

export interface StubIdentity {
  readonly sub: string;
  readonly email: string;
  readonly email_verified: boolean;
  /** The nonce the authorisation request carried; a wrong one must be refused by the client. */
  readonly nonce: string;
  /** A token the client must refuse (PR #21 review item 4). */
  readonly tamper?: 'signature' | 'audience' | 'issuer' | 'expired';
}

const base64url = (value: Buffer | string) => Buffer.from(value).toString('base64url');

export class OidcStub {
  private server: Server | undefined;
  private readonly codes = new Map<string, StubIdentity>();
  private readonly keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  /** A key the JWKS does not publish — a token signed with it has a wrong signature. */
  private readonly strangerKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  private readonly kid = randomBytes(8).toString('hex');
  issuer = '';

  constructor(private readonly clientId: string) {}

  async start(): Promise<string> {
    this.server = createServer((req, res) => {
      void this.handle(req.url ?? '/', req.method ?? 'GET', req)
        .then(({ status, body }) => {
          res.writeHead(status, { 'content-type': 'application/json' });
          res.end(JSON.stringify(body));
        })
        .catch(() => {
          res.writeHead(500);
          res.end();
        });
    });
    await new Promise<void>((resolve) => this.server?.listen(0, '127.0.0.1', resolve));
    const { port } = this.server.address() as AddressInfo;
    this.issuer = `http://127.0.0.1:${port}`;
    return this.issuer;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  /** Queues the identity the next exchange of the returned code yields. */
  issue(identity: StubIdentity): string {
    const code = randomBytes(16).toString('hex');
    this.codes.set(code, identity);
    return code;
  }

  private async handle(
    url: string,
    method: string,
    req: AsyncIterable<Buffer>,
  ): Promise<{ status: number; body: unknown }> {
    const path = url.split('?')[0];
    if (path === '/.well-known/openid-configuration') {
      return {
        status: 200,
        body: {
          issuer: this.issuer,
          authorization_endpoint: `${this.issuer}/authorize`,
          token_endpoint: `${this.issuer}/token`,
          jwks_uri: `${this.issuer}/jwks`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
          scopes_supported: ['openid', 'email'],
        },
      };
    }
    if (path === '/jwks') {
      const jwk = this.keys.publicKey.export({ format: 'jwk' });
      return { status: 200, body: { keys: [{ ...jwk, kid: this.kid, alg: 'RS256', use: 'sig' }] } };
    }
    if (path === '/token' && method === 'POST') {
      let raw = '';
      for await (const chunk of req) raw += chunk.toString('utf8');
      const code = new URLSearchParams(raw).get('code') ?? '';
      const identity = this.codes.get(code);
      this.codes.delete(code);
      if (identity === undefined) return { status: 400, body: { error: 'invalid_grant' } };
      return {
        status: 200,
        body: {
          access_token: randomBytes(16).toString('hex'),
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'openid email',
          id_token: this.idToken(identity),
        },
      };
    }
    return { status: 404, body: { error: 'not_found' } };
  }

  private idToken(identity: StubIdentity): string {
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: this.kid }));
    const { tamper } = identity;
    const payload = base64url(
      JSON.stringify({
        iss: tamper === 'issuer' ? 'http://issuer.invalid' : this.issuer,
        aud: tamper === 'audience' ? 'another-client' : this.clientId,
        sub: identity.sub,
        email: identity.email,
        email_verified: identity.email_verified,
        nonce: identity.nonce,
        iat: tamper === 'expired' ? now - 7200 : now,
        exp: tamper === 'expired' ? now - 3600 : now + 600,
      }),
    );
    const signature = createSign('RSA-SHA256')
      .update(`${header}.${payload}`)
      .sign(tamper === 'signature' ? this.strangerKey : this.keys.privateKey);
    return `${header}.${payload}.${base64url(signature)}`;
  }
}
