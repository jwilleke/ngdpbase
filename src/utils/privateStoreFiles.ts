/**
 * Reading and writing the bytes of a private store (#1415, epic #1382).
 *
 * The store DEK "encrypts every byte in `private/{user}/{store}/`"
 * (docs/private-stores.md, Keys). This is the one place that turns
 * that rule into file I/O: a caller asks for the store's {@link StoreFileIO}
 * once, through its context, and every read and write it makes with it is
 * ciphertext at rest when the store is encrypted. Providers do not decide the
 * policy; they are handed an I/O that already carries it.
 *
 * `store.json` is the one file in a store that is never sealed — it holds the
 * wrapped DEK needed to open the rest.
 */

import fs from 'fs-extra';
import path from 'path';
import { writeFileAtomic } from './atomicWrite.js';
import logger from './logger.js';
import { assertEncryptedStoreWritable, openBytes, sealBytes } from './privateStoreCrypto.js';
import { kindIsSealed, readVaultSealState, readVaultSealStateSync, refuseUnsealedVault } from './privateStoreMeta.js';
import {
  isValidStoreId,
  parsePrivateStoreRel,
  privateUserDir,
  type PrivateStoreLayout,
  type PrivateStoreLayoutOverrides
} from './privateStorePath.js';
import { dekFor } from './privateStoreUnlock.js';
import type { ActorContext } from '../context/ActorContext.js';

export interface StoreFileIO {
  /** True when this store's files are ciphertext at rest. */
  readonly sealed: boolean;
  readText(file: string, encoding?: BufferEncoding): Promise<string>;
  writeText(file: string, text: string, encoding?: BufferEncoding): Promise<void>;
  /** A store file's bytes — attachments (#1400) are binary, pages are text. */
  readBytes(file: string): Promise<Buffer>;
  writeBytes(file: string, bytes: Buffer): Promise<void>;
}

/** Files outside any encrypted store: read and written as they are. */
export const PLAIN_FILE_IO: StoreFileIO = {
  sealed: false,
  readText: (file, encoding = 'utf8') => fs.readFile(file, encoding),
  writeText: (file, text, encoding = 'utf8') => writeFileAtomic(file, text, encoding),
  readBytes: (file) => fs.readFile(file),
  writeBytes: (file, bytes) => writeFileAtomic(file, bytes)
};

function sealedFileIO(dek: Buffer): StoreFileIO {
  return {
    sealed: true,
    async readText(file, encoding = 'utf8') {
      return openBytes(dek, await fs.readFile(file)).toString(encoding);
    },
    async writeText(file, text, encoding = 'utf8') {
      await writeFileAtomic(file, sealBytes(dek, Buffer.from(text, encoding)));
    },
    async readBytes(file) {
      return openBytes(dek, await fs.readFile(file));
    },
    async writeBytes(file, bytes) {
      await writeFileAtomic(file, sealBytes(dek, bytes));
    }
  };
}

/**
 * The I/O for `owner`'s `store`, as this context may use it. Plain for a store
 * that is not encrypted; sealed with the store DEK when it is. An encrypted
 * store whose DEK this context does not hold is refused — a read as much as a
 * write, so a locked store never falls back to reading or writing in the clear.
 *
 * Whether the store is encrypted is asked of both its kind and its copy
 * (#1834): `layout` is the configured one, whose `sealedVaults` are the kinds
 * that are sealed. A vault of a sealed kind with no `store.json` (its door not
 * yet opened) or a `store.json` that is not sealed is refused, read and write
 * alike, with `SealedVaultRefusedError` — never handed plain I/O.
 */
export async function storeFileIO(ctx: ActorContext | undefined, args: {
  pagesDirectory: string;
  owner: string;
  store: string;
  layout: PrivateStoreLayout;
}): Promise<StoreFileIO> {
  const { state } = await readVaultSealState(args.pagesDirectory, args.owner, args.store, args.layout);
  refuseUnsealedVault(args.owner, args.store, state);
  if (state === 'plain') return PLAIN_FILE_IO;
  const dek = dekFor(ctx, args.owner, args.store);
  assertEncryptedStoreWritable({ encrypt: true, dek });
  return sealedFileIO(dek as Buffer);
}

const unsealedReadsReported = new Set<string>();

/**
 * Read one text file of `owner`'s `store` synchronously, as this context may:
 * plain for a store that is not encrypted, opened with the store DEK when it
 * is. Null when the file does not exist, or the store is encrypted and this
 * context does not hold its DEK — a locked store reads as nothing, never in
 * the clear (#1456: a store's page index is small, and page lookups are
 * synchronous).
 *
 * A vault of a sealed kind that is not itself sealed (#1834) reads as nothing
 * too, with a warning: its files, if any, were written in the clear and are
 * not served as if they were sealed.
 */
export function readStoreTextSync(ctx: ActorContext | undefined, args: {
  pagesDirectory: string;
  owner: string;
  store: string;
  file: string;
  layout: PrivateStoreLayout;
}): string | null {
  if (!fs.existsSync(args.file)) return null;
  const state = readVaultSealStateSync(args.pagesDirectory, args.owner, args.store, args.layout);
  if (state === 'unopened' || state === 'mismatch') {
    // Page lookups ask this on every request: said once per vault, not per lookup.
    const said = `${args.owner}/${args.store}`;
    if (!unsealedReadsReported.has(said)) {
      unsealedReadsReported.add(said);
      logger.warn(`[private-store] not read: ${args.owner}'s vault '${args.store}' is sealed by its kind but holds files that are not (${state}) (#1834)`);
    }
    return null;
  }
  if (state === 'plain') return fs.readFileSync(args.file, 'utf8');
  const dek = dekFor(ctx, args.owner, args.store);
  if (!dek) return null;
  return openBytes(dek, fs.readFileSync(args.file)).toString('utf8');
}

/**
 * Every store id in `owner`'s container, whether or not it can be opened (#1460).
 *
 * Which stores EXIST is a question about a folder, not about keys: an
 * unencrypted store has no DEK for a session to hold, so
 * `unlockedStoreIdsFor` — which answers from the session's key bag — can only
 * ever name the encrypted ones. A caller that wants all of the owner's stores
 * asks here and then opens each through {@link storeFileIO}, which refuses the
 * encrypted ones it holds no key for.
 *
 * Empty for a user with no container. Nothing here decides access: the
 * container rule (`mayActInPrivateContainer`) is the caller's to apply, as it
 * is at the page door.
 */
export async function privateStoreIdsOf(
  pagesDirectory: string,
  owner: string,
  layout?: PrivateStoreLayoutOverrides
): Promise<string[]> {
  const dir = privateUserDir(pagesDirectory, owner, layout);
  if (!await fs.pathExists(dir)) return [];
  return (await fs.readdir(dir, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && isValidStoreId(d.name))
    .map((d) => d.name);
}

/** The I/O for whichever store holds `file`; plain for a file in no store. */
export async function storeFileIOForPath(ctx: ActorContext | undefined, args: {
  pagesDirectory: string;
  file: string;
  layout: PrivateStoreLayout;
}): Promise<StoreFileIO> {
  const where = parsePrivateStoreRel(
    path.relative(args.pagesDirectory, args.file).split(path.sep),
    args.layout
  );
  if (!where) return PLAIN_FILE_IO;
  return storeFileIO(ctx, {
    pagesDirectory: args.pagesDirectory,
    owner: where.creator,
    store: where.store,
    layout: args.layout
  });
}

/** The vault `file` lies in — `{privateroot}/{owner}/{store}/…` — or null for a file in no vault. */
export function vaultOfFile(
  pagesDirectory: string,
  file: string,
  layout: PrivateStoreLayout
): { owner: string; store: string } | null {
  const where = parsePrivateStoreRel(path.relative(pagesDirectory, file).split(path.sep), layout);
  return where ? { owner: where.creator, store: where.store } : null;
}

/**
 * Whether `owner`'s `store` holds, or must hold, only sealed bytes (#1836):
 * its kind is sealed, or its `store.json` is. A `store.json` that cannot be
 * read counts as sealed — the answer that never lets plaintext in.
 *
 * For the paths that put bytes into a vault without its store I/O (a backup
 * restore, a legacy migration, a tombstone put back): they hold no DEK, so
 * where this is true they write only bytes that are already sealed, or refuse.
 */
export async function vaultMustBeSealed(
  pagesDirectory: string,
  owner: string,
  store: string,
  layout: PrivateStoreLayout
): Promise<boolean> {
  if (kindIsSealed(layout, store)) return true;
  try {
    return (await readVaultSealState(pagesDirectory, owner, store, layout)).state !== 'plain';
  } catch {
    return true;
  }
}

/**
 * Move a folder of store files — a page's history — from one place to another
 * through each side's I/O (#1836): every file is read as its source stores it
 * and written as its destination does, so history moved into a sealed vault
 * is sealed with that vault's DEK, history moved out of one is opened, and a
 * move between two sealed vaults is re-sealed. Two plain sides are a plain
 * rename, as before.
 *
 * The copy is staged beside `toDir` and renamed into place only when every
 * file is written, so a failure leaves the source whole and no half history
 * at the destination. The source is removed last.
 */
export async function moveStoreFolder(
  fromDir: string,
  toDir: string,
  fromIO: StoreFileIO,
  toIO: StoreFileIO
): Promise<void> {
  await fs.ensureDir(path.dirname(toDir));
  if (!fromIO.sealed && !toIO.sealed) {
    await fs.move(fromDir, toDir);
    return;
  }
  const staging = `${toDir}.moving-${process.pid}-${Date.now()}`;
  try {
    await fs.ensureDir(staging);
    for (const ent of await fs.readdir(fromDir, { recursive: true, withFileTypes: true })) {
      if (!ent.isFile()) continue;
      const source = path.join(ent.parentPath, ent.name);
      const target = path.join(staging, path.relative(fromDir, source));
      await fs.ensureDir(path.dirname(target));
      await toIO.writeBytes(target, await fromIO.readBytes(source));
    }
    await fs.rename(staging, toDir);
  } catch (err) {
    await fs.remove(staging);
    throw err;
  }
  await fs.remove(fromDir);
}

/**
 * Move one store file — a page's footnotes (#1839) — through each side's I/O,
 * as {@link moveStoreFolder} moves a folder: read as its source stores it,
 * written as its destination does, so a file moved into a sealed vault is
 * sealed there and one moved out is opened. Two plain sides are a plain move.
 * The destination is written (atomically) before the source is removed.
 */
export async function moveStoreFile(
  fromFile: string,
  toFile: string,
  fromIO: StoreFileIO,
  toIO: StoreFileIO
): Promise<void> {
  await fs.ensureDir(path.dirname(toFile));
  if (!fromIO.sealed && !toIO.sealed) {
    await fs.move(fromFile, toFile, { overwrite: true });
    return;
  }
  await toIO.writeBytes(toFile, await fromIO.readBytes(fromFile));
  await fs.remove(fromFile);
}
