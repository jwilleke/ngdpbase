/**
 * A fake OpenID Connect issuer for tests (#1743): discovery, keys and a token
 * endpoint, answered in place of `guardedFetch`. Keys and the client secret
 * are made at run time; nothing secret-looking is written in the source.
 */
import * as crypto from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import type { GuardedFetchOptions, GuardedResponse } from '../../../http/guardedFetch';

export interface TokenRequest {
  url: string;
  headers: Record<string, string>;
  form: URLSearchParams;
}

export interface FakeIssuer {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Answer one outbound request, as `guardedFetch` would. */
  respond(url: string, options: GuardedFetchOptions): Promise<GuardedResponse>;
  /** The ID token the token endpoint hands out next. */
  idToken: string;
  /** What the discovery document says; change to test a misconfigured issuer. */
  discovery: Record<string, unknown>;
  tokenRequests: TokenRequest[];
  /** Sign claims with the issuer's key (or another), with sensible defaults for iss, aud, iat and exp. */
  sign(claims: JWTPayload, opts?: { foreignKey?: boolean }): Promise<string>;
}

export async function fakeIssuer(issuer = 'https://idp.example.test'): Promise<FakeIssuer> {
  const own = await generateKeyPair('RS256');
  const foreign = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(own.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  const clientId = 'client-' + crypto.randomBytes(4).toString('hex');
  const clientSecret = crypto.randomBytes(16).toString('hex');

  const json = (url: string, body: unknown, status = 200): GuardedResponse =>
    ({ status, headers: {}, body: Buffer.from(JSON.stringify(body)), finalUrl: url, chain: [url] });

  const fake: FakeIssuer = {
    issuer,
    clientId,
    clientSecret,
    idToken: '',
    tokenRequests: [],
    discovery: {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks`
    },
    async respond(url, options) {
      if (url === `${issuer}/.well-known/openid-configuration`) return json(url, fake.discovery);
      if (url === `${issuer}/jwks`) return json(url, { keys: [jwk] });
      if (url === `${issuer}/token` && options.method === 'POST') {
        fake.tokenRequests.push({ url, headers: options.headers ?? {}, form: new URLSearchParams(String(options.body)) });
        return json(url, { access_token: 'not-kept', token_type: 'Bearer', id_token: fake.idToken });
      }
      return json(url, { error: 'not found' }, 404);
    },
    async sign(claims, opts = {}) {
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT({ iss: issuer, aud: clientId, iat: now, exp: now + 300, ...claims })
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .sign(opts.foreignKey ? foreign.privateKey : own.privateKey);
    }
  };
  return fake;
}

/** The state and nonce a provider put in its authorization URL. */
export function flowFrom(authUrl: string): { state: string; nonce: string; challenge: string; params: URLSearchParams } {
  const params = new URL(authUrl).searchParams;
  return { state: params.get('state') ?? '', nonce: params.get('nonce') ?? '', challenge: params.get('code_challenge') ?? '', params };
}
