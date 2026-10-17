/**
 * The Sigstore trusted root, fetched through the guarded client (#1830).
 *
 * The trusted root (Fulcio certificate authorities, Rekor and CT log keys,
 * timestamp authorities) is distributed by Sigstore's TUF repository, which
 * signs and versions it so a stale or forged copy is refused. `tuf-js` does the
 * TUF verification. Its default fetcher is Node's global `fetch`, which would
 * open the network outside src/http and past the egress policy (#1133, #1139),
 * so a fetcher is supplied here that downloads through the function the caller
 * gives it — in AddonsManager, `guardedFetch`.
 *
 * The TUF cache starts from the root shipped inside `@sigstore/tuf` (its
 * `seeds.json`) and lives where the caller says (`<data>/addons/.sigstore`).
 */

import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import { createRequire } from 'module';
import { BaseFetcher, Updater } from 'tuf-js';

const require = createRequire(import.meta.url);

export const DEFAULT_TUF_MIRROR = 'https://tuf-repo-cdn.sigstore.dev';
const TRUSTED_ROOT_TARGET = 'trusted_root.json';

type Seeds = Record<string, { 'root.json': string; targets: Record<string, string> }>;
const loadSeeds = (): Seeds => require('@sigstore/tuf/seeds.json') as Seeds;

// tuf-js decides "no newer root" from this error's 403/404 status; it is not
// exported from the package index.
const { DownloadHTTPError } = require('tuf-js/dist/error.js') as { DownloadHTTPError: new (message: string, statusCode: number) => Error };

/** A GET that resolves to the status and body, or throws when the host cannot be reached. */
export type TufDownload = (url: string, maxBytes: number) => Promise<{ status: number; body: Buffer }>;

class GuardedTufFetcher extends BaseFetcher {
  constructor(private readonly download: TufDownload, private readonly maxBytes: number) {
    super();
  }

  async fetch(url: string): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
    const res = await this.download(url, this.maxBytes);
    if (res.status !== 200) throw new DownloadHTTPError(`Failed to download ${url}`, res.status);
    return new Blob([new Uint8Array(res.body)]).stream();
  }
}

/** The trusted root as shipped in `@sigstore/tuf`, with no network. For tests and as the TUF seed. */
export function seededTrustedRoot(mirrorUrl: string = DEFAULT_TUF_MIRROR): unknown {
  const seed = loadSeeds()[mirrorUrl];
  if (!seed?.targets[TRUSTED_ROOT_TARGET]) throw new Error(`no shipped Sigstore trusted root for ${mirrorUrl}`);
  return JSON.parse(Buffer.from(seed.targets[TRUSTED_ROOT_TARGET], 'base64').toString('utf8')) as unknown;
}

/**
 * The current trusted root, refreshed from the TUF repository through
 * `download` and verified by TUF. Throws when the repository cannot be reached
 * or does not verify.
 */
export async function fetchTrustedRoot(options: { cacheDir: string; mirrorUrl?: string; download: TufDownload; maxBytes: number }): Promise<unknown> {
  const mirrorUrl = (options.mirrorUrl ?? DEFAULT_TUF_MIRROR).replace(/\/+$/, '');
  const seed = loadSeeds()[mirrorUrl];
  if (!seed) throw new Error(`no shipped TUF root for ${mirrorUrl}`);

  const repoDir = path.join(options.cacheDir, crypto.createHash('sha256').update(mirrorUrl).digest('hex').slice(0, 16));
  const targetsDir = path.join(repoDir, 'targets');
  await fs.ensureDir(targetsDir);
  const rootPath = path.join(repoDir, 'root.json');
  if (!(await fs.pathExists(rootPath))) await fs.writeFile(rootPath, Buffer.from(seed['root.json'], 'base64'));

  const updater = new Updater({
    metadataBaseUrl: mirrorUrl,
    targetBaseUrl: `${mirrorUrl}/targets`,
    metadataDir: repoDir,
    targetDir: targetsDir,
    fetcher: new GuardedTufFetcher(options.download, options.maxBytes)
  });
  await updater.refresh();
  const info = await updater.getTargetInfo(TRUSTED_ROOT_TARGET);
  if (!info) throw new Error(`the TUF repository has no ${TRUSTED_ROOT_TARGET}`);
  const file = (await updater.findCachedTarget(info)) ?? (await updater.downloadTarget(info));
  return JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
}
