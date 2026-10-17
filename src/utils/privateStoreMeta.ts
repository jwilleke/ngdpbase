/**
 * Per-store encrypt flag on disk (#1384).
 *
 * Lives on `pages/vaults/{user}/{store}/store.json`, not on PageManager.
 * Missing file = encrypt off (`default/` stays plaintext unless enabled).
 */

import fs from 'fs-extra';
import path from 'path';
import logger from './logger.js';
import type { StoreKeyRecord, WrappedBlob } from './privateStoreCrypto.js';
import {
  STORE_META_FILENAME,
  resolvePrivateStoreLayout,
  storeMetaPath,
  privateStoreRoot,
  type PrivateStoreLayout,
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

/**
 * How a vault stands against its kind (#1834). The vault's `store.json` says
 * whether this copy is sealed; the kind (the system-category's `encrypt`,
 * carried in the layout as `sealedVaults`) says whether it must be.
 *
 * - `plain`: the kind is not sealed and the copy is not either.
 * - `sealed`: the copy is sealed (`store.json` `encrypt: true`).
 * - `unopened`: the kind is sealed and there is no `store.json` — the owner
 *   has not walked through the vault door, so there is no key to seal with.
 * - `mismatch`: the kind is sealed and `store.json` says the copy is not
 *   (or cannot be read as sealed).
 *
 * Only `plain` and `sealed` may be read or written.
 */
export type VaultSealState = 'plain' | 'sealed' | 'unopened' | 'mismatch';

export function kindIsSealed(layout: PrivateStoreLayoutOverrides, store: string): boolean {
  return resolvePrivateStoreLayout(layout).sealedVaults.includes(store);
}

function sealStateOf(kindSealed: boolean, metaExists: boolean, encrypt: boolean): VaultSealState {
  if (encrypt) return 'sealed';
  if (!kindSealed) return 'plain';
  return metaExists ? 'mismatch' : 'unopened';
}

/** {@link VaultSealState} of `owner`'s `store`, with the record that decided it. */
export async function readVaultSealState(
  pagesDirectory: string,
  owner: string,
  store: string,
  layout: PrivateStoreLayout
): Promise<{ state: VaultSealState; meta: StoreKeyRecord }> {
  const kindSealed = kindIsSealed(layout, store);
  const metaExists = await fs.pathExists(storeMetaPath(pagesDirectory, owner, store, layout));
  let meta: StoreKeyRecord;
  try {
    meta = await readStoreMeta(pagesDirectory, owner, store, layout);
  } catch (err) {
    // An unreadable store.json under a sealed kind is a vault that cannot be
    // shown to be sealed: refused like any other mismatch, never plain.
    if (!kindSealed) throw err;
    meta = { encrypt: false };
  }
  return { state: sealStateOf(kindSealed, metaExists, meta.encrypt), meta };
}

/** The synchronous form of {@link readVaultSealState}, for synchronous page lookups. */
export function readVaultSealStateSync(
  pagesDirectory: string,
  owner: string,
  store: string,
  layout: PrivateStoreLayout
): VaultSealState {
  const metaFile = storeMetaPath(pagesDirectory, owner, store, layout);
  const metaExists = fs.existsSync(metaFile);
  let encrypt = false;
  if (metaExists) {
    const meta = fs.readJsonSync(metaFile, { throws: false }) as { encrypt?: unknown } | null;
    encrypt = meta?.encrypt === true;
  }
  return sealStateOf(kindIsSealed(layout, store), metaExists, encrypt);
}

/**
 * A read or write refused because the vault's kind is sealed and the vault
 * is not (#1834). Never answered with plain I/O: the bytes would be clear on
 * disk under a kind that says they are sealed.
 */
export class SealedVaultRefusedError extends Error {
  readonly code = 'sealed-vault-refused';
  constructor(
    readonly owner: string,
    readonly store: string,
    readonly reason: 'unopened' | 'mismatch'
  ) {
    super(reason === 'unopened'
      ? `Vault '${store}' is encrypted and has not been opened yet: open it at /stores/${store} first.`
      : `Vault '${store}' should be encrypted, but its stored copy is not, so it stays closed until an administrator resolves it.`);
    this.name = 'SealedVaultRefusedError';
  }
}

/**
 * Throw {@link SealedVaultRefusedError} for a state that may not be read or
 * written, logging it: an unopened vault is the owner's next step (warn), a
 * mismatch is the site's configuration and its disk disagreeing (error).
 * Names the owner and vault, never a page or its content.
 */
export function refuseUnsealedVault(owner: string, store: string, state: VaultSealState): void {
  if (state === 'unopened') {
    logger.warn(`[private-store] refused: ${owner}'s vault '${store}' is sealed by its kind but has not been opened (no store.json) — nothing written in the clear (#1834)`);
    throw new SealedVaultRefusedError(owner, store, 'unopened');
  }
  if (state === 'mismatch') {
    logger.error(`[private-store] refused: ${owner}'s vault '${store}' is sealed by its kind but its store.json is not sealed — not read or written (#1834)`);
    throw new SealedVaultRefusedError(owner, store, 'mismatch');
  }
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
