/**
 * Lockboxes for links to encrypted vaults (#1388).
 *
 * A link to an encrypted vault is `/share/{token}#{key}`. The part after `#`
 * is the link's private key; browsers never send it, so the server never sees
 * it. The key pair is made in the owner's browser, which sends the server
 * only the public half (`LinkPublicKey`).
 *
 * The server prepares each covered page, and the files it uses, and locks
 * them for that public key: a {@link Lockbox}. It can lock, never open. The
 * recipient's browser opens each lockbox with the private key from the link.
 *
 * The algorithm is WebCrypto's own, so the server (Node's `crypto.webcrypto`)
 * and the browser (`window.crypto.subtle`, public/js/share-viewer.js) run the
 * same steps: ECDH on P-256 between a fresh ephemeral key and the link's key,
 * HKDF-SHA-256 over the shared secret, AES-256-GCM over the content.
 */

import { webcrypto } from 'crypto';

const subtle = webcrypto.subtle;
const CURVE = 'P-256';
/** The HKDF salt and info; a lockbox of another version will not open with this one. */
const HKDF_LABEL = new TextEncoder().encode('ngdp-share-lockbox-v1');

/** The public half of a link's key pair: a P-256 point, as WebCrypto exports it in JWK. */
export interface LinkPublicKey {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
}

/** One locked item, as stored and as served. */
export interface Lockbox {
  v: 1;
  /** The ephemeral public key the content was locked with. */
  epk: LinkPublicKey;
  /** AES-GCM IV, base64url. */
  iv: string;
  /** AES-GCM ciphertext with its tag, base64url. */
  ct: string;
}

const B64URL = /^[A-Za-z0-9_-]+$/;

/**
 * The public key a browser sent, checked strictly: a P-256 point and nothing
 * else. Anything malformed is refused rather than stored.
 */
export function parseLinkPublicKey(value: unknown): LinkPublicKey | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.kty !== 'EC' || v.crv !== CURVE) return null;
  if (typeof v.x !== 'string' || typeof v.y !== 'string' || !B64URL.test(v.x) || !B64URL.test(v.y)) return null;
  // A P-256 coordinate is 32 bytes: 43 base64url characters.
  if (v.x.length !== 43 || v.y.length !== 43) return null;
  if ('d' in v) return null;
  return { kty: 'EC', crv: CURVE, x: v.x, y: v.y };
}

async function importPublic(key: LinkPublicKey): Promise<webcrypto.CryptoKey> {
  return subtle.importKey('jwk', { ...key, ext: true }, { name: 'ECDH', namedCurve: CURVE }, true, []);
}

async function contentKey(privateKey: webcrypto.CryptoKey, publicKey: webcrypto.CryptoKey, usage: 'encrypt' | 'decrypt'): Promise<webcrypto.CryptoKey> {
  const shared = await subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  const hkdf = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_LABEL, info: HKDF_LABEL },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  );
}

/** Lock `plaintext` for the link whose public key is `linkKey`. Only that link's private key opens it. */
export async function sealForLink(linkKey: LinkPublicKey, plaintext: Uint8Array): Promise<Lockbox> {
  const ephemeral = await subtle.generateKey({ name: 'ECDH', namedCurve: CURVE }, true, ['deriveBits']);
  const key = await contentKey(ephemeral.privateKey, await importPublic(linkKey), 'encrypt');
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  const epk = await subtle.exportKey('jwk', ephemeral.publicKey);
  return {
    v: 1,
    epk: { kty: 'EC', crv: CURVE, x: String(epk.x), y: String(epk.y) },
    iv: Buffer.from(iv).toString('base64url'),
    ct: Buffer.from(ct).toString('base64url')
  };
}

/**
 * The key part of a link, `{d}.{x}.{y}` in base64url: the private key the
 * owner's browser made. The server never holds one; this is for the tests,
 * and mirrors what the viewer does.
 */
export function linkKeyFromParts(jwk: { d: string; x: string; y: string }): string {
  return `${jwk.d}.${jwk.x}.${jwk.y}`;
}

/** Make a link key pair, as the owner's browser does. Tests only: production pairs are made in the browser. */
export async function newLinkKeyPair(): Promise<{ publicKey: LinkPublicKey; linkKey: string }> {
  const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: CURVE }, true, ['deriveBits']);
  const jwk = await subtle.exportKey('jwk', pair.privateKey);
  return {
    publicKey: { kty: 'EC', crv: CURVE, x: String(jwk.x), y: String(jwk.y) },
    linkKey: linkKeyFromParts({ d: String(jwk.d), x: String(jwk.x), y: String(jwk.y) })
  };
}

/** Open a lockbox with a link's key, as the recipient's browser does. */
export async function openLockbox(linkKey: string, box: Lockbox): Promise<Uint8Array> {
  const [d, x, y] = linkKey.split('.');
  if (!d || !x || !y) throw new Error('not a link key');
  const privateKey = await subtle.importKey('jwk', { kty: 'EC', crv: CURVE, d, x, y, ext: true }, { name: 'ECDH', namedCurve: CURVE }, false, ['deriveBits']);
  const key = await contentKey(privateKey, await importPublic(box.epk), 'decrypt');
  return new Uint8Array(await subtle.decrypt(
    { name: 'AES-GCM', iv: Buffer.from(box.iv, 'base64url') },
    key,
    Buffer.from(box.ct, 'base64url')
  ));
}

/** True when `value` has the shape of a stored lockbox. */
export function isLockbox(value: unknown): value is Lockbox {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.v === 1 && typeof v.iv === 'string' && typeof v.ct === 'string' && parseLinkPublicKey(v.epk) !== null;
}
