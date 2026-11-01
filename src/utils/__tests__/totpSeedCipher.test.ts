/** #421 — TOTP seeds are sealed for one account under a subkey of the credentials key. */
import { openTotpSecret, sealTotpSecret } from '../totpSeedCipher';

const KEY = 'test-credentials-key-not-a-secret';

describe('totpSeedCipher (#421)', () => {
  test('a sealed value opens for its account and does not show the plain text', () => {
    const sealed = sealTotpSecret(KEY, 'molly', 'plain-seed-value');
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain('plain-seed-value');
    expect(openTotpSecret(KEY, 'molly', sealed)).toBe('plain-seed-value');
  });

  test('each seal uses a fresh IV', () => {
    expect(sealTotpSecret(KEY, 'molly', 'x')).not.toBe(sealTotpSecret(KEY, 'molly', 'x'));
  });

  test('it does not open for another account, under another key, or when altered', () => {
    const sealed = sealTotpSecret(KEY, 'molly', 'plain-seed-value');
    expect(openTotpSecret(KEY, 'sam', sealed)).toBeNull();
    expect(openTotpSecret('another-key', 'molly', sealed)).toBeNull();
    const [v, iv, body] = sealed.split('.');
    const flipped = Buffer.from(body, 'base64url');
    flipped[0] ^= 1;
    expect(openTotpSecret(KEY, 'molly', `${v}.${iv}.${flipped.toString('base64url')}`)).toBeNull();
    expect(openTotpSecret(KEY, 'molly', 'not-sealed')).toBeNull();
  });

  test('an empty credentials key is refused', () => {
    expect(() => sealTotpSecret('', 'molly', 'x')).toThrow(/NGDPBASE_CREDENTIALS_KEY/);
  });
});
