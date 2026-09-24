/**
 * Per-store encrypt flag on disk (#1384).
 *
 * Lives on `pages/private/{user}/{store}/store.json`, not on PageManager.
 * Missing file = encrypt off (`default/` stays plaintext unless enabled).
 */

import fs from 'fs-extra';
import path from 'path';
import type { StoreKeyRecord, WrappedBlob } from './privateStoreCrypto.js';
import {
  STORE_META_FILENAME,
  storeMetaPath,
  privateStoreRoot,
  type PrivateStoreLayoutOverrides
} from './privateStorePath.js';

function looksLikeWrap(value: unknown): value is WrappedBlob {
  if (!value || typeof value !== 'object') return false;
  const blob = value as Record<string, unknown>;
  return typeof blob.iv === 'string' && typeof blob.tag === 'string' && typeof blob.ct === 'string';
}

export async function readStoreMeta(
  pagesDirectory: string,
  creator: string,
  store: string,
  layout?: PrivateStoreLayoutOverrides
): Promise<StoreKeyRecord> {
  const file = storeMetaPath(pagesDirectory, creator, store, layout);
  if (!await fs.pathExists(file)) return { encrypt: false };
  const raw = await fs.readJson(file) as unknown;
  if (!raw || typeof raw !== 'object') return { encrypt: false };
  const rec = raw as { encrypt?: unknown; dekWrap?: unknown };
  if (rec.encrypt === true) {
    return {
      encrypt: true,
      dekWrap: looksLikeWrap(rec.dekWrap) ? rec.dekWrap : { iv: '', tag: '', ct: '' }
    };
  }
  return { encrypt: false };
}

/** True when `dir` is a store directory with encrypt on (`store.json`). */
export async function storeDirectoryIsEncrypted(
  dir: string,
  metaFilename: string = STORE_META_FILENAME
): Promise<boolean> {
  const file = path.join(dir, metaFilename);
  if (!await fs.pathExists(file)) return false;
  try {
    const raw = await fs.readJson(file) as { encrypt?: unknown };
    return raw?.encrypt === true;
  } catch {
    return false;
  }
}

/**
 * `store.json` as the door writes it (#1414, docs/private-stores.md,
 * "`store.json` shape"): the kind this copy was created under, whether this
 * copy is sealed, when the user walked through the door, and the wrapped DEK
 * when it is sealed. Per-user state and key material only — never policy.
 */
export type StoreFileRecord = StoreKeyRecord & { kind?: string; created?: string };

export async function writeStoreMeta(
  pagesDirectory: string,
  creator: string,
  store: string,
  record: StoreFileRecord,
  layout?: PrivateStoreLayoutOverrides
): Promise<void> {
  await fs.ensureDir(privateStoreRoot(pagesDirectory, creator, store, layout));
  await fs.writeJson(storeMetaPath(pagesDirectory, creator, store, layout), record);
}
