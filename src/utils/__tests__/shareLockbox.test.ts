/**
 * Lockboxes for links to encrypted vaults — #1388.
 *
 * The server locks for a link's public key; only that link's private key,
 * which the server never holds, opens it.
 */
import { isLockbox, newLinkKeyPair, openLockbox, parseLinkPublicKey, sealForLink } from '../shareLockbox';

const text = (b: Uint8Array) => new TextDecoder().decode(b);
const bytes = (s: string) => new TextEncoder().encode(s);

describe('share lockboxes (#1388)', () => {
  test('the link\'s key opens what was locked for it, and the lockbox does not contain the content', async () => {
    const link = await newLinkKeyPair();
    const box = await sealForLink(link.publicKey, bytes('<p>secret page</p>'));
    expect(isLockbox(box)).toBe(true);
    expect(JSON.stringify(box)).not.toContain('secret page');
    expect(text(await openLockbox(link.linkKey, box))).toBe('<p>secret page</p>');
  });

  test('another link\'s key opens nothing', async () => {
    const a = await newLinkKeyPair();
    const b = await newLinkKeyPair();
    const box = await sealForLink(a.publicKey, bytes('for a'));
    await expect(openLockbox(b.linkKey, box)).rejects.toThrow();
  });

  test('a tampered lockbox does not open', async () => {
    const link = await newLinkKeyPair();
    const box = await sealForLink(link.publicKey, bytes('x'));
    const flipped = Buffer.from(box.ct, 'base64url');
    flipped[0] ^= 1;
    await expect(openLockbox(link.linkKey, { ...box, ct: flipped.toString('base64url') })).rejects.toThrow();
  });

  test('two lockboxes of the same content differ (fresh key and IV each time)', async () => {
    const link = await newLinkKeyPair();
    const one = await sealForLink(link.publicKey, bytes('same'));
    const two = await sealForLink(link.publicKey, bytes('same'));
    expect(one.ct).not.toBe(two.ct);
    expect(one.epk.x).not.toBe(two.epk.x);
  });

  test('only a P-256 public key is accepted from a browser; a private key or junk is refused', async () => {
    const link = await newLinkKeyPair();
    expect(parseLinkPublicKey(link.publicKey)).toEqual(link.publicKey);
    expect(parseLinkPublicKey({ ...link.publicKey, d: 'x' })).toBeNull();
    expect(parseLinkPublicKey({ ...link.publicKey, crv: 'P-384' })).toBeNull();
    expect(parseLinkPublicKey({ ...link.publicKey, x: 'short' })).toBeNull();
    expect(parseLinkPublicKey('nope')).toBeNull();
  });
});
