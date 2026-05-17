/**
 * NCM embedded-image → attachment rule (#728 spec §2.2, Phase 2 Slice 4)
 *
 * `normalizeToNcm` stays synchronous and dependency-free; image localization
 * is inherently async (outbound fetch) and engine-coupled (AttachmentManager,
 * a target page), so it is a **separate post-pass** with **injected I/O**.
 * That keeps S1/S2 pure and this slice unit-testable with fakes; S5 wires the
 * real fetch (`ngdpbase.fetch-timeout-ms`) + `AttachmentManager.uploadAttachment`.
 *
 * For every `![alt](src)` whose `src` is a remote `http(s)` URL or a `data:`
 * URI:
 *  - host on the ad/tracker deny-list  → drop  (`img-rejected: adhost`)
 *  - fetch fails / times out           → drop  (`img-rejected: fetch`)
 *  - magic-byte sniff not in the strict raster allowlist (jpeg/png/gif/webp;
 *    **SVG/RAW excluded — never trust the extension or `Content-Type`**)
 *                                      → drop  (`img-rejected: type`)
 *  - decoded bytes exceed the size cap → drop  (`img-rejected: size`)
 *  - otherwise → store + rewrite to the local ref (`img-attached`)
 * Every drop also leaves a deterministic §3.3 placeholder. Local/relative
 * srcs are left untouched, so the pass is idempotent.
 *
 * @module converters/ncm/images
 */

import { NcmWarning } from './types.js';
import { formatDroppedPlaceholder } from './placeholder.js';

/** Config for the image rule (size cap reuses ngdpbase.attachment.maxsize). */
export interface NcmImageConfig {
  maxBytes: number;
  adDenyList: string[];
  fetchTimeoutMs: number;
}

/** Injected I/O so the rule is pure-testable; S5 supplies the real impls. */
export interface NcmImageDeps {
  /** Fetch raw bytes with the given timeout. Reject/throw or return error. */
  fetchBytes(url: string, timeoutMs: number): Promise<Buffer>;
  /** Persist the image; return the local reference to put in `![alt](ref)`. */
  storeAttachment(input: { bytes: Buffer; mime: string; sourceUrl: string }): Promise<string>;
}

/** Fixed NCM raster allowlist — NOT configurable (spec: tighten, never loosen). */
function sniffRasterMime(b: Buffer): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
    && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 6 && b.toString('ascii', 0, 4) === 'GIF8'
    && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'image/gif';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF'
    && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null; // svg(text)/bmp/tiff/heic/raw/polyglot → rejected
}

/** Decode a `data:` URI to bytes, or null if it isn't one / is malformed. */
function decodeDataUri(src: string): Buffer | null {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/is.exec(src);
  if (!m) return null;
  try {
    return m[2]
      ? Buffer.from(m[3], 'base64')
      : Buffer.from(decodeURIComponent(m[3]), 'utf8');
  } catch {
    return null;
  }
}

/** True if `url` matches any deny entry (host, host suffix, or host+path substring). */
function isAdHost(url: string, denyList: string[]): boolean {
  let host = '';
  let hostPath = url.toLowerCase();
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    hostPath = (u.hostname + u.pathname).toLowerCase();
  } catch { /* fall back to raw substring match below */ }
  return denyList.some(raw => {
    const e = raw.trim().toLowerCase();
    if (!e) return false;
    if (e.includes('/')) return hostPath.includes(e);
    return host === e || host.endsWith('.' + e) || hostPath.includes(e);
  });
}

// ![alt](src) with optional ("title"); src has no spaces/parens.
const MD_IMAGE = /!\[([^\]]*)\]\(\s*([^()\s]+)(?:\s+"[^"]*")?\s*\)/g;

/**
 * Localize embedded remote/data images in an NCM document.
 * Pure aside from the injected `deps`; idempotent.
 */
export async function localizeNcmImages(
  ncm: string,
  cfg: NcmImageConfig,
  deps: NcmImageDeps
): Promise<{ content: string; warnings: NcmWarning[] }> {
  const warnings: NcmWarning[] = [];
  const matches = [...ncm.matchAll(MD_IMAGE)];
  if (matches.length === 0) return { content: ncm, warnings };

  let out = '';
  let last = 0;

  for (const m of matches) {
    const [full, , src] = m;
    const start = m.index ?? 0;
    out += ncm.slice(last, start);
    last = start + full.length;

    const isData = /^data:/i.test(src);
    const isHttp = /^https?:\/\//i.test(src);
    if (!isData && !isHttp) {
      out += full; // local/relative — already an attachment ref; leave as-is
      continue;
    }

    const drop = (reason: string): void => {
      warnings.push({ kind: 'img-rejected', detail: `${reason}: ${src}` });
      out += formatDroppedPlaceholder('img', `${reason} (${src})`);
    };

    if (isHttp && isAdHost(src, cfg.adDenyList)) { drop('adhost'); continue; }

    let bytes: Buffer | null;
    if (isData) {
      bytes = decodeDataUri(src);
      if (!bytes) { drop('decode'); continue; }
    } else {
      try {
        bytes = await deps.fetchBytes(src, cfg.fetchTimeoutMs);
      } catch {
        drop('fetch');
        continue;
      }
    }

    const mime = sniffRasterMime(bytes);
    if (!mime) { drop('type'); continue; }
    if (bytes.length > cfg.maxBytes) { drop('size'); continue; }

    try {
      const ref = await deps.storeAttachment({ bytes, mime, sourceUrl: src });
      const alt = m[1] ?? '';
      out += `![${alt}](${ref})`;
      warnings.push({ kind: 'img-attached', detail: `${src} → ${ref}` });
    } catch {
      drop('store');
    }
  }
  out += ncm.slice(last);
  return { content: out, warnings };
}
