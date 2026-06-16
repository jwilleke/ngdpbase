/**
 * Tests for AuthentikBearerAuthProvider (#818).
 *
 * Uses jose's local JWKS + generateKeyPair to mint test JWTs without any
 * network — the provider's optional `jwksOverride` constructor argument
 * accepts the local JWKS getter directly. Mirrors the
 * CloudflareAccessAuthProvider test harness (#649).
 */

import { describe, test, expect, beforeAll } from 'vitest';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWK,
  type JWTVerifyGetKey
} from 'jose';
import { AuthentikBearerAuthProvider } from '../AuthentikBearerAuthProvider';

const ISSUER = 'https://auth.nerdsbythehour.com/application/o/ngdpbase/';
const JWKS_URL = `${ISSUER}jwks/`;
const AUDIENCE = 'ngdpbase-client-id-12345';

interface MintOptions {
  email?: string | null;
  name?: string;
  preferredUsername?: string;
  groups?: string[];
  aud?: string;
  iss?: string;
  expSecondsFromNow?: number;
}

let privateKey: CryptoKey;
let jwks: JWTVerifyGetKey;

beforeAll(async () => {
  const kp = await generateKeyPair('RS256', { extractable: true });
  privateKey = kp.privateKey;
  const publicJwk: JWK = await exportJWK(kp.publicKey);
  publicJwk.alg = 'RS256';
  publicJwk.kid = 'test-key-1';
  jwks = createLocalJWKSet({ keys: [publicJwk] });
});

async function mintJwt(opts: MintOptions = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    sub: 'ak-sub-abc123',
    name: opts.name ?? 'Test User',
    groups: opts.groups ?? []
  };
  if (opts.preferredUsername !== undefined) payload.preferred_username = opts.preferredUsername;
  if (opts.email !== null) payload.email = opts.email ?? 'jim@example.com';
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
    .setIssuedAt(now)
    .setIssuer(opts.iss ?? ISSUER)
    .setAudience(opts.aud ?? AUDIENCE)
    .setExpirationTime(now + (opts.expSecondsFromNow ?? 3600))
    .sign(privateKey);
}

interface FakeUser { username: string; email?: string; roles?: string[] }

function buildEngine(initialUsers: FakeUser[] = []) {
  const users: FakeUser[] = [...initialUsers];
  const created: Array<Record<string, unknown>> = [];
  const userManager = {
    getUserByEmail: async (email: string) =>
      users.find(u => u.email?.toLowerCase() === email.toLowerCase()) ?? null,
    getUser: async (username: string) =>
      users.find(u => u.username === username) ?? null,
    createUser: async (input: Record<string, unknown>) => {
      created.push(input);
      users.push({
        username: input.username as string,
        email: input.email as string | undefined,
        roles: input.roles as string[] | undefined
      });
      return input;
    }
  };
  const engine = {
    getManager: (name: string) => name === 'UserManager' ? userManager : null
  } as unknown as ConstructorParameters<typeof AuthentikBearerAuthProvider>[0];
  return { engine, userManager, users, created };
}

function buildProvider(engine: ReturnType<typeof buildEngine>['engine'], overrides: Partial<{
  groupMap: Record<string, string>;
  defaultRole: string;
}> = {}) {
  return new AuthentikBearerAuthProvider(engine, {
    issuer: ISSUER,
    jwksUrl: JWKS_URL,
    audience: AUDIENCE,
    defaultRole: overrides.defaultRole ?? 'occupant',
    groupMap: overrides.groupMap ?? {}
  }, jwks);
}

describe('AuthentikBearerAuthProvider (#818)', () => {
  test('valid JWT + known user (by email) → existing username, no JIT (decision A)', async () => {
    const { engine, created } = buildEngine([
      { username: 'jim', email: 'jim@example.com', roles: ['admin'] }
    ]);
    const provider = buildProvider(engine);
    const token = await mintJwt({ email: 'jim@example.com' });
    const result = await provider.verify({ token });
    expect(result).toEqual({ username: 'jim' });
    expect(created).toHaveLength(0);
  });

  test('valid JWT + unknown user → JIT-provisions with default role', async () => {
    const { engine, created } = buildEngine([]);
    const provider = buildProvider(engine);
    const token = await mintJwt({ email: 'newuser@example.com', name: 'New User' });
    const result = await provider.verify({ token });
    expect(result).toEqual({ username: 'newuser' });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      username: 'newuser',
      email: 'newuser@example.com',
      displayName: 'New User',
      password: '',
      roles: ['occupant'],
      isExternal: true,
      isActive: true
    });
  });

  test('preferred_username claim drives the provisioned username', async () => {
    const { engine, created } = buildEngine([]);
    const provider = buildProvider(engine);
    const token = await mintJwt({ email: 'svc@example.com', preferredUsername: 'svc-ingest-jim', name: 'Jim Willeke' });
    const result = await provider.verify({ token });
    expect(result).toEqual({ username: 'svc-ingest-jim' });
    expect(created[0]).toMatchObject({ username: 'svc-ingest-jim', displayName: 'Jim Willeke' });
  });

  test('group-map applied — Authentik groups translate to ngdpbase roles, defaultRole always included', async () => {
    const { engine, created } = buildEngine([]);
    const provider = buildProvider(engine, {
      defaultRole: 'occupant',
      groupMap: { developers: 'admin', employees: 'editor' }
    });
    const token = await mintJwt({
      email: 'dev@example.com',
      groups: ['developers', 'employees', 'unmapped-group']
    });
    const result = await provider.verify({ token });
    expect(result).toEqual({ username: 'dev' });
    expect(created[0].roles).toEqual(['occupant', 'admin', 'editor']);
  });

  test('username collision → suffixes the desired handle', async () => {
    const { engine, created } = buildEngine([
      { username: 'jim', email: 'oldjim@somewhere.com', roles: ['occupant'] }
    ]);
    const provider = buildProvider(engine);
    const token = await mintJwt({ email: 'jim@example.com' });
    const result = await provider.verify({ token });
    expect(result).toEqual({ username: 'jim1' });
    expect(created[0]).toMatchObject({ username: 'jim1', email: 'jim@example.com' });
  });

  test('missing token → null', async () => {
    const { engine } = buildEngine([]);
    const provider = buildProvider(engine);
    const result = await provider.verify({ token: undefined });
    expect(result).toBeNull();
  });

  test('invalid signature (wrong key) → null', async () => {
    const { engine } = buildEngine([]);
    const provider = buildProvider(engine);
    const otherKp = await generateKeyPair('RS256', { extractable: true });
    const badToken = await new SignJWT({ email: 'jim@example.com' })
      .setProtectedHeader({ alg: 'RS256', kid: 'wrong-key' })
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime('1h')
      .sign(otherKp.privateKey);
    const result = await provider.verify({ token: badToken });
    expect(result).toBeNull();
  });

  test('expired JWT → null', async () => {
    const { engine } = buildEngine([]);
    const provider = buildProvider(engine);
    const expired = await mintJwt({ email: 'jim@example.com', expSecondsFromNow: -3600 });
    const result = await provider.verify({ token: expired });
    expect(result).toBeNull();
  });

  test('wrong audience → null', async () => {
    const { engine } = buildEngine([]);
    const provider = buildProvider(engine);
    const token = await mintJwt({ email: 'jim@example.com', aud: 'some-other-aud' });
    const result = await provider.verify({ token });
    expect(result).toBeNull();
  });

  test('wrong issuer → null', async () => {
    const { engine } = buildEngine([]);
    const provider = buildProvider(engine);
    const token = await mintJwt({ email: 'jim@example.com', iss: 'https://evil.example.com/application/o/x/' });
    const result = await provider.verify({ token });
    expect(result).toBeNull();
  });

  test('JWT without email claim → null (cannot coordinate user)', async () => {
    const { engine } = buildEngine([]);
    const provider = buildProvider(engine);
    const token = await mintJwt({ email: null });
    const result = await provider.verify({ token });
    expect(result).toBeNull();
  });

  test('email lookup is case-insensitive', async () => {
    const { engine, created } = buildEngine([
      { username: 'jim', email: 'Jim@Example.com', roles: ['occupant'] }
    ]);
    const provider = buildProvider(engine);
    const token = await mintJwt({ email: 'jim@example.com' });
    const result = await provider.verify({ token });
    expect(result).toEqual({ username: 'jim' });
    expect(created).toHaveLength(0);
  });

  test('provider exposes id and displayName per AuthProvider contract', () => {
    const { engine } = buildEngine([]);
    const provider = buildProvider(engine);
    expect(provider.id).toBe('authentik-bearer');
    expect(provider.displayName).toBe('Authentik (Bearer)');
  });
});
