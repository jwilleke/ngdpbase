/**
 * #448 — the passkey provider's own rules. The WebAuthn ceremony itself is
 * @simplewebauthn/server's; this covers what ngdpbase decides around it.
 */
import { PasskeyAuthProvider, relyingPartyFrom } from '../PasskeyAuthProvider';
import type { CredentialRecord } from '../BaseCredentialsProvider';

const RP = { rpID: 'wiki.example.com', origin: 'https://wiki.example.com', rpName: 'Wiki' };
const store = (rows: CredentialRecord[] = []) => ({
  find: (id: string) => rows.find(r => r.subject === id) ?? null,
  used: vi.fn().mockResolvedValue(undefined)
});

describe('relyingPartyFrom (#448)', () => {
  test('https base-url: the host is the relying party', () => {
    expect(relyingPartyFrom('https://wiki.example.com:3000/x', 'Wiki')).toEqual({ rpID: 'wiki.example.com', origin: 'https://wiki.example.com:3000', rpName: 'Wiki' });
  });

  test('http is allowed only on localhost, as browsers allow WebAuthn', () => {
    expect(relyingPartyFrom('http://localhost:2121', 'W')?.rpID).toBe('localhost');
    expect(relyingPartyFrom('http://wiki.example.com', 'W')).toBeNull();
  });

  test('a malformed base-url gives no relying party', () => {
    expect(relyingPartyFrom('not a url', 'W')).toBeNull();
  });
});

describe('PasskeyAuthProvider (#448)', () => {
  test('declares a phishing-resistant AAL2 factor that can start a sign-in', () => {
    expect(new PasskeyAuthProvider(RP, store()).factor).toEqual({ amr: ['swk', 'user'], aal: 2, acr: 'phr', primary: true });
  });

  test('enrolment options: this relying party, user verification required, a discoverable key, existing keys excluded', async () => {
    const existing = [{ id: 'c1', username: 'molly', kind: 'passkey', subject: 'cred-abc', secret: JSON.stringify({ publicKey: 'x', counter: 0, transports: ['internal'] }), label: 'Phone', createdAt: '2026-10-03T00:00:00Z' }] as CredentialRecord[];
    const options = await new PasskeyAuthProvider(RP, store()).registrationOptions('molly', 'Molly', existing);
    expect(options.rp).toEqual({ name: 'Wiki', id: 'wiki.example.com' });
    expect(options.authenticatorSelection).toEqual(expect.objectContaining({ residentKey: 'required', userVerification: 'required' }));
    expect(options.excludeCredentials).toEqual([expect.objectContaining({ id: 'cred-abc' })]);
    expect(typeof options.challenge).toBe('string');
  });

  test('sign-in options ask for user verification and name no one', async () => {
    const options = await new PasskeyAuthProvider(RP, store()).authenticationOptions();
    expect(options.rpId).toBe('wiki.example.com');
    expect(options.userVerification).toBe('required');
    expect(options.allowCredentials ?? []).toEqual([]);
  });

  test('no assertion, or an unknown passkey, is no sign-in and records nothing', async () => {
    const s = store();
    const p = new PasskeyAuthProvider(RP, s);
    expect(await p.verify({})).toBeNull();
    expect(await p.verify({ webauthn: { response: { id: 'nobody' }, expectedChallenge: 'c' } })).toBeNull();
    expect(s.used).not.toHaveBeenCalled();
  });

  test('an assertion that does not verify is no sign-in, and the counter is untouched', async () => {
    const row = { id: 'c1', username: 'molly', kind: 'passkey', subject: 'cred-abc', secret: JSON.stringify({ publicKey: Buffer.from('not-a-key').toString('base64url'), counter: 5 }), label: 'Phone', createdAt: 't' } as CredentialRecord;
    const s = store([row]);
    const bogus = { id: 'cred-abc', rawId: 'cred-abc', type: 'public-key', response: { clientDataJSON: 'e30', authenticatorData: 'AA', signature: 'AA' }, clientExtensionResults: {} };
    expect(await new PasskeyAuthProvider(RP, s).verify({ webauthn: { response: bogus, expectedChallenge: 'c' } })).toBeNull();
    expect(s.used).not.toHaveBeenCalled();
  });

  test('an enrolment that does not verify stores nothing', async () => {
    const bogus = { id: 'x', rawId: 'x', type: 'public-key', response: { clientDataJSON: 'e30', attestationObject: 'AA' }, clientExtensionResults: {} };
    expect(await new PasskeyAuthProvider(RP, store()).verifyRegistration(bogus as never, 'c')).toBeNull();
  });
});
