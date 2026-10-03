/**
 * #448 — a passkey enrolled and used end to end, against a software
 * authenticator: a real P-256 key, real attestation and assertion bytes, the
 * real @simplewebauthn/server checks, AuthManager and a FileCredentialsProvider
 * in a temp directory (the only thing removed afterwards).
 */
vi.unmock('../../providers/FileCredentialsProvider');

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encodeCBOR } from '@levischuck/tiny-cbor';
import AuthManager from '../AuthManager';
import { CREDENTIALS_KEY_ENV } from '../../providers/BaseCredentialsProvider';

const ORIGIN = 'https://wiki.example.com';
const RP_ID = 'wiki.example.com';
const b64url = (b: Uint8Array | Buffer): string => Buffer.from(b).toString('base64url');
const sha256 = (b: Uint8Array | string): Buffer => crypto.createHash('sha256').update(b).digest();
const u32 = (n: number): Buffer => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };

/** A minimal platform authenticator: one key, a counter, user present and verified. */
function softwareAuthenticator(rpId = RP_ID, origin = ORIGIN) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const credId = crypto.randomBytes(16);
  let counter = 0;
  const flags = (attested: boolean) => Buffer.from([0x01 | 0x04 | (attested ? 0x40 : 0)]);
  return {
    credentialId: b64url(credId),
    create(challenge: string) {
      const cose = encodeCBOR(new Map<number, number | Uint8Array>([
        [1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]
      ]));
      const len = Buffer.alloc(2); len.writeUInt16BE(credId.length);
      const authData = Buffer.concat([sha256(rpId), flags(true), u32(counter), Buffer.alloc(16), len, credId, Buffer.from(cose)]);
      const attestationObject = encodeCBOR(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]) as never);
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin, crossOrigin: false }));
      return { id: b64url(credId), rawId: b64url(credId), type: 'public-key', response: { clientDataJSON: b64url(clientDataJSON), attestationObject: b64url(attestationObject), transports: ['internal'] }, clientExtensionResults: {} };
    },
    get(challenge: string, replayCounter?: number) {
      if (replayCounter === undefined) counter += 1;
      const authData = Buffer.concat([sha256(rpId), flags(false), u32(replayCounter ?? counter)]);
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin, crossOrigin: false }));
      const signature = crypto.sign('sha256', Buffer.concat([authData, sha256(clientDataJSON)]), privateKey);
      return { id: b64url(credId), rawId: b64url(credId), type: 'public-key', response: { clientDataJSON: b64url(clientDataJSON), authenticatorData: b64url(authData), signature: b64url(signature) }, clientExtensionResults: {} };
    }
  };
}

describe('passkeys end to end (#448)', () => {
  let dir: string;
  const savedKey = process.env[CREDENTIALS_KEY_ENV];
  const molly = { username: 'molly', roles: ['reader'], isAuthenticated: true } as never;

  const started = async (baseUrl = ORIGIN, explicit = true) => {
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (k: string, d: unknown) => (k === 'ngdpbase.auth.factors' ? [{ authproviderid: 'passkey' }, { authproviderid: 'password' }] : k === 'ngdpbase.application-name' ? 'Wiki' : d),
        getCustomProperty: () => undefined,
        getResolvedDataPath: (k: string, d: string) => (k === 'ngdpbase.auth.credentials.file' ? path.join(dir, 'credentials.json') : d),
        isBaseUrlExplicit: () => explicit,
        getBaseURL: () => baseUrl
      },
      PolicyDecisionPoint: { permits: () => Promise.resolve(true) },
      UserManager: { getUser: () => Promise.resolve({ username: 'molly', password: 'scrypt$x' }) },
      AuditManager: { logAuditEvent: () => Promise.resolve('a') }
    };
    const am = new AuthManager({ getManager: (n: string) => managers[n] ?? null });
    await am.initialize();
    return am;
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-448-'));
    process.env[CREDENTIALS_KEY_ENV] = 'test-credentials-key-not-a-secret';
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env[CREDENTIALS_KEY_ENV]; else process.env[CREDENTIALS_KEY_ENV] = savedKey;
    // Only the per-test temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const enrol = async (am: AuthManager, device = softwareAuthenticator()) => {
    const options = await am.passkeyRegistrationOptions(molly, 'molly', 'Molly') as { challenge: string };
    const id = await am.passkeyRegister(molly, 'molly', device.create(options.challenge), options.challenge, 'Test phone');
    return { id, device };
  };

  const signIn = async (am: AuthManager, device: ReturnType<typeof softwareAuthenticator>, replay?: number) => {
    const options = await am.passkeyAuthenticationOptions() as { challenge: string };
    return am.authenticate('passkey', { webauthn: { response: device.get(options.challenge, replay), expectedChallenge: options.challenge } });
  };

  test('enrol, then sign in: AAL2, phishing-resistant, counter recorded', async () => {
    const am = await started();
    const { id, device } = await enrol(am);
    expect(id).toEqual(expect.any(String));
    expect((await am.listCredentials(molly, 'molly'))[0]).toEqual(expect.objectContaining({ kind: 'passkey', label: 'Test phone', subject: device.credentialId }));

    const result = await signIn(am, device);
    expect(result).toEqual(expect.objectContaining({ success: true, username: 'molly', provider: 'passkey' }));
    expect(am.signInRecord(result)).toEqual(expect.objectContaining({ aal: 2, acr: 'phr' }));
    expect((await am.listCredentials(molly, 'molly'))[0].lastUsedAt).toEqual(expect.any(String));
  });

  test('a replayed assertion (counter not moving forward) is refused', async () => {
    const am = await started();
    const { device } = await enrol(am);
    expect((await signIn(am, device)).success).toBe(true);
    expect((await signIn(am, device, 1)).success).toBe(false);
  });

  test('an assertion for another challenge is refused', async () => {
    const am = await started();
    const { device } = await enrol(am);
    const options = await am.passkeyAuthenticationOptions() as { challenge: string };
    const result = await am.authenticate('passkey', { webauthn: { response: device.get('some-other-challenge'), expectedChallenge: options.challenge } });
    expect(result.success).toBe(false);
  });

  test('a passkey made for another host does not sign in here', async () => {
    const am = await started();
    await enrol(am);
    const phished = softwareAuthenticator('evil.example', 'https://evil.example');
    // Planted directly would fail the store signature; here it was simply never enrolled for this host.
    expect((await signIn(am, phished)).success).toBe(false);
  });

  test('an enrolment answered for another host is not stored', async () => {
    const am = await started();
    const options = await am.passkeyRegistrationOptions(molly, 'molly', 'Molly') as { challenge: string };
    const wrongHost = softwareAuthenticator('evil.example', 'https://evil.example');
    expect(await am.passkeyRegister(molly, 'molly', wrongHost.create(options.challenge), options.challenge, 'x')).toBeNull();
    expect(await am.listCredentials(molly, 'molly')).toEqual([]);
  });

  test('passkeys stay off without an explicit base-url, and on plain http other than localhost', async () => {
    expect((await started(ORIGIN, false)).passkeyRelyingParty()).toBeNull();
    expect((await started('http://wiki.example.com')).passkeyRelyingParty()).toBeNull();
    expect((await started('http://localhost:2121')).passkeyRelyingParty()?.rpID).toBe('localhost');
  });
});
