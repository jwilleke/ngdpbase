/**
 * Encryption for TOTP seeds in the credentials store (#421).
 *
 * The store signs every row with `NGDPBASE_CREDENTIALS_KEY` but keeps it
 * readable; a TOTP seed is a shared secret, so a reader of the file must not
 * get it. The seed is AES-256-GCM encrypted under a subkey derived from the
 * same key by HKDF (decided on #1523, 2026-10-31), so there is no new key to
 * back up. The account name is the associated data: a sealed seed copied onto
 * another person's row does not open.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const INFO = 'ngdpbase totp seed v1';
const PREFIX = 'v1';

function subkey(credentialsKey: string): Buffer {
  if (!credentialsKey) throw new Error('A TOTP seed needs NGDPBASE_CREDENTIALS_KEY (#421)');
  return Buffer.from(hkdfSync('sha256', credentialsKey, Buffer.alloc(0), INFO, 32));
}

/** Seal `plain` for `username`; returns `v1.<iv>.<ciphertext+tag>`, base64url. */
export function sealTotpSecret(credentialsKey: string, username: string, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', subkey(credentialsKey), iv);
  cipher.setAAD(Buffer.from(username, 'utf8'));
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return `${PREFIX}.${iv.toString('base64url')}.${body.toString('base64url')}`;
}

/** Open a sealed value for `username`; null when it is malformed, for someone else, or under another key. */
export function openTotpSecret(credentialsKey: string, username: string, sealed: string): string | null {
  const parts = sealed.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const body = Buffer.from(parts[2], 'base64url');
    if (iv.length !== 12 || body.length < 16) return null;
    const decipher = createDecipheriv('aes-256-gcm', subkey(credentialsKey), iv);
    decipher.setAAD(Buffer.from(username, 'utf8'));
    decipher.setAuthTag(body.subarray(body.length - 16));
    return Buffer.concat([decipher.update(body.subarray(0, body.length - 16)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
