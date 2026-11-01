/**
 * #421 — the TOTP provider: a second factor only, the drift window, and a code
 * that cannot be used twice. Codes are made with the same library from the
 * seed the provider offered; no seed or code is printed.
 */
import { Secret, TOTP } from 'otpauth';
import { TotpAuthProvider } from '../TotpAuthProvider';
import type { CredentialRecord } from '../BaseCredentialsProvider';

const KEY = 'test-credentials-key-not-a-secret';
const T0 = Date.UTC(2026, 10, 1, 12, 0, 0);

const codeAt = (seed: string, at: number) => new TOTP({ secret: Secret.fromBase32(seed), digits: 6, period: 30, algorithm: 'SHA1' }).generate({ timestamp: at });

function setup() {
  let now = T0;
  const rows: CredentialRecord[] = [];
  const provider = new TotpAuthProvider(KEY, 'Test wiki', {
    rows: (u) => rows.filter(r => r.username === u && r.kind === 'totp'),
    used: (id, at, secret) => {
      const row = rows.find(r => r.id === id)!;
      row.lastUsedAt = at;
      row.secret = secret;
      return Promise.resolve();
    }
  }, () => now);
  const enrol = (username: string): string => {
    const { seed } = provider.newEnrolment(username);
    const sealed = provider.confirmEnrolment(username, seed, codeAt(seed, now));
    expect(sealed).not.toBeNull();
    rows.push({ id: `row-${rows.length}`, username, kind: 'totp', subject: `s-${rows.length}`, secret: sealed!, label: 'App', createdAt: new Date(now).toISOString() });
    return seed;
  };
  return { provider, rows, enrol, setNow: (t: number) => { now = t; } };
}

describe('TotpAuthProvider (#421)', () => {
  test('a second factor only: otp, AAL1, not phishing-resistant', () => {
    const { provider } = setup();
    expect(provider.id).toBe('totp');
    expect(provider.factor).toEqual({ amr: ['otp'], aal: 1, primary: false });
    expect(provider.factor.acr).toBeUndefined();
  });

  test('the enrolment URI names the issuer and account; the stored secret does not show the seed', () => {
    const { provider, rows, enrol } = setup();
    expect(provider.newEnrolment('molly').uri).toMatch(/^otpauth:\/\/totp\/Test%20wiki:molly\?/);
    const seed = enrol('molly');
    expect(rows[0].secret).not.toContain(seed);
  });

  test('a wrong confirming code does not enrol', () => {
    const { provider } = setup();
    const { seed } = provider.newEnrolment('molly');
    const right = codeAt(seed, T0);
    const wrong = right === '000000' ? '111111' : '000000';
    expect(provider.confirmEnrolment('molly', seed, wrong)).toBeNull();
    expect(provider.confirmEnrolment('molly', 'not base32!', right)).toBeNull();
  });

  test('the next code signs in; the confirming code cannot', async () => {
    const { provider, enrol, setNow } = setup();
    const seed = enrol('molly');
    expect(await provider.verify({ username: 'molly', code: codeAt(seed, T0) })).toBeNull();
    setNow(T0 + 30_000);
    expect(await provider.verify({ username: 'molly', code: codeAt(seed, T0 + 30_000) })).toEqual({ username: 'molly' });
  });

  test('a code is refused the second time, even within its window', async () => {
    const { provider, enrol, setNow } = setup();
    const seed = enrol('molly');
    setNow(T0 + 60_000);
    const code = codeAt(seed, T0 + 60_000);
    expect(await provider.verify({ username: 'molly', code })).not.toBeNull();
    setNow(T0 + 70_000);
    expect(await provider.verify({ username: 'molly', code })).toBeNull();
  });

  test('two requests with the same code at once: only one passes', async () => {
    const { provider, enrol, setNow } = setup();
    const seed = enrol('molly');
    setNow(T0 + 60_000);
    const code = codeAt(seed, T0 + 60_000);
    const results = await Promise.all([provider.verify({ username: 'molly', code }), provider.verify({ username: 'molly', code })]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  test('one step of drift either way is accepted; two is not', async () => {
    const { provider, enrol, setNow } = setup();
    const seed = enrol('molly');
    setNow(T0 + 120_000);
    expect(await provider.verify({ username: 'molly', code: codeAt(seed, T0 + 150_000) })).not.toBeNull(); // app one step ahead
    setNow(T0 + 300_000);
    expect(await provider.verify({ username: 'molly', code: codeAt(seed, T0 + 240_000) })).toBeNull(); // two steps behind
  });

  test('a step before the last one used is refused, even inside the window', async () => {
    const { provider, enrol, setNow } = setup();
    const seed = enrol('molly');
    setNow(T0 + 120_000);
    expect(await provider.verify({ username: 'molly', code: codeAt(seed, T0 + 120_000) })).not.toBeNull();
    expect(await provider.verify({ username: 'molly', code: codeAt(seed, T0 + 90_000) })).toBeNull();
  });

  test("another account's code, a malformed code, or no account signs no one in", async () => {
    const { provider, enrol, setNow } = setup();
    const seed = enrol('molly');
    enrol('sam');
    setNow(T0 + 60_000);
    expect(await provider.verify({ username: 'sam', code: codeAt(seed, T0 + 60_000) })).toBeNull();
    expect(await provider.verify({ username: 'molly', code: '12345' })).toBeNull();
    expect(await provider.verify({ code: codeAt(seed, T0 + 60_000) })).toBeNull();
  });

  test('a row moved onto another account does not open', async () => {
    const { provider, rows, enrol, setNow } = setup();
    const seed = enrol('molly');
    rows[0].username = 'sam';
    setNow(T0 + 60_000);
    expect(await provider.verify({ username: 'sam', code: codeAt(seed, T0 + 60_000) })).toBeNull();
  });
});
