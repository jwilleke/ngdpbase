/**
 * Tests for NCM S4 — embedded image → attachment rule (#728 §2.2).
 * Injected fake fetch/store; no network, no engine.
 */

import { localizeNcmImages } from '../ncm/images';
import type { NcmImageConfig, NcmImageDeps } from '../ncm/images';
import { isDroppedPlaceholderLine } from '../ncm/placeholder';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8');

const cfg: NcmImageConfig = {
  maxBytes: 1000,
  adDenyList: ['doubleclick.net', 'facebook.com/tr', 'googlesyndication.com'],
  fetchTimeoutMs: 5000
};

describe('NCM image → attachment (§2.2)', () => {
  test('valid remote image is fetched, stored, and rewritten to the local ref', async () => {
    const d: NcmImageDeps = {
      fetchBytes: async () => PNG,
      storeAttachment: async () => 'attachments/img-1.png'
    };
    const r = await localizeNcmImages('![pic](https://cdn.example.com/a.png)', cfg, d);
    expect(r.content).toBe('![pic](attachments/img-1.png)');
    expect(r.warnings).toEqual([{ kind: 'img-attached', detail: 'https://cdn.example.com/a.png → attachments/img-1.png' }]);
  });

  test('ad/tracker host is dropped without fetching', async () => {
    const fetched: string[] = [];
    const d: NcmImageDeps = {
      fetchBytes: async (u) => { fetched.push(u); return PNG; },
      storeAttachment: async () => 'x'
    };
    const r = await localizeNcmImages('![a](https://googlesyndication.com/ad.png)', cfg, d);
    expect(fetched).toHaveLength(0);
    expect(r.warnings[0].kind).toBe('img-rejected');
    expect(r.warnings[0].detail).toMatch(/^adhost:/);
    expect(isDroppedPlaceholderLine(r.content)).toBe(true);
  });

  test('host+path deny entry matches (facebook.com/tr)', async () => {
    const d: NcmImageDeps = { fetchBytes: async () => PNG, storeAttachment: async () => 'x' };
    const r = await localizeNcmImages('![p](https://www.facebook.com/tr?id=1)', cfg, d);
    expect(r.warnings[0].detail).toMatch(/^adhost:/);
  });

  test('fetch failure → dropped with placeholder', async () => {
    const d: NcmImageDeps = {
      fetchBytes: async () => { throw new Error('timeout'); },
      storeAttachment: async () => 'x'
    };
    const r = await localizeNcmImages('![a](https://slow.example.com/x.png)', cfg, d);
    expect(r.warnings[0]).toEqual({ kind: 'img-rejected', detail: 'fetch: https://slow.example.com/x.png' });
    expect(isDroppedPlaceholderLine(r.content)).toBe(true);
  });

  test('non-raster bytes rejected by magic-byte sniff (not the label)', async () => {
    const d: NcmImageDeps = { fetchBytes: async () => SVG, storeAttachment: async () => 'x' };
    const r = await localizeNcmImages('![a](https://x.com/evil.png)', cfg, d);
    expect(r.warnings[0].detail).toMatch(/^type:/);
  });

  test('oversize image rejected', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(2000)]);
    const d: NcmImageDeps = { fetchBytes: async () => big, storeAttachment: async () => 'x' };
    const r = await localizeNcmImages('![a](https://x.com/big.png)', cfg, d);
    expect(r.warnings[0].detail).toMatch(/^size:/);
  });

  test('data: URI base64 PNG is decoded and attached (no fetch)', async () => {
    const fetched: string[] = [];
    const d: NcmImageDeps = {
      fetchBytes: async (u) => { fetched.push(u); return PNG; },
      storeAttachment: async () => 'attachments/d.png'
    };
    const uri = `data:image/png;base64,${PNG.toString('base64')}`;
    const r = await localizeNcmImages(`![d](${uri})`, cfg, d);
    expect(fetched).toHaveLength(0);
    expect(r.content).toBe('![d](attachments/d.png)');
    expect(r.warnings[0].kind).toBe('img-attached');
  });

  test('data: URI claiming image/png but carrying SVG is rejected (label not trusted)', async () => {
    const d: NcmImageDeps = { fetchBytes: async () => PNG, storeAttachment: async () => 'x' };
    const uri = `data:image/png;base64,${SVG.toString('base64')}`;
    const r = await localizeNcmImages(`![d](${uri})`, cfg, d);
    expect(r.warnings[0].detail).toMatch(/^type:/);
  });

  test('local/relative image is left untouched, nothing fetched', async () => {
    const fetched: string[] = [];
    const d: NcmImageDeps = {
      fetchBytes: async (u) => { fetched.push(u); return PNG; },
      storeAttachment: async () => 'x'
    };
    const src = '![keep](attachments/existing.png) and ![rel](../img/y.png)';
    const r = await localizeNcmImages(src, cfg, d);
    expect(r.content).toBe(src);
    expect(r.warnings).toHaveLength(0);
    expect(fetched).toHaveLength(0);
  });

  test('idempotent — second pass is a no-op', async () => {
    const d: NcmImageDeps = { fetchBytes: async () => PNG, storeAttachment: async () => 'attachments/i.png' };
    const once = await localizeNcmImages('![a](https://x.com/a.png) ![b](https://doubleclick.net/b.png)', cfg, d);
    const twice = await localizeNcmImages(once.content, cfg, d);
    expect(twice.content).toBe(once.content);
    expect(twice.warnings).toHaveLength(0);
  });
});
