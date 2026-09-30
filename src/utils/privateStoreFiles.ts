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
import { assertEncryptedStoreWritable, isItemSealedBytes, isSealedBytes, itemKeyOf, newItemKey, openBytes, sealBytes, sealItemBytes } from './privateStoreCrypto.js';
import { readStoreMeta } from './privateStoreMeta.js';
import {
  isValidStoreId,
  parsePrivateStoreRel,
  privateStoreAttachmentsDir,
  privateStoreRoot,
  privateUserDir,
  storeMetaPath,
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
  /**
   * Write a page or a file of the vault: in an encrypted vault, sealed with a
   * key of its own that it keeps across every later write, so a share link
   * carrying that key goes on opening it (#1388). History and indexes use
   * `writeText` / `writeBytes`, sealed with the vault key.
   */
  writeItemText(file: string, text: string, encoding?: BufferEncoding): Promise<void>;
  writeItemBytes(file: string, bytes: Buffer): Promise<void>;
  /** The key a page or file was sealed with, or null (not encrypted, or not yet an item file). */
  itemKey(file: string): Promise<Buffer | null>;
}

/** Files outside any encrypted store: read and written as they are. */
export const PLAIN_FILE_IO: StoreFileIO = {
  sealed: false,
  readText: (file, encoding = 'utf8') => fs.readFile(file, encoding),
  writeText: (file, text, encoding = 'utf8') => writeFileAtomic(file, text, encoding),
  readBytes: (file) => fs.readFile(file),
  writeBytes: (file, bytes) => writeFileAtomic(file, bytes),
  writeItemText: (file, text, encoding = 'utf8') => writeFileAtomic(file, text, encoding),
  writeItemBytes: (file, bytes) => writeFileAtomic(file, bytes),
  itemKey: () => Promise.resolve(null)
};

function sealedFileIO(dek: Buffer): StoreFileIO {
  /** The item's key as it is on disk, or a fresh one: an item keeps its key for life. */
  const keyFor = async (file: string): Promise<Buffer> => {
    const existing = await fs.readFile(file).catch(() => null);
    return (existing && isItemSealedBytes(existing) ? itemKeyOf(dek, existing) : null) ?? newItemKey();
  };
  const writeItem = async (file: string, bytes: Buffer): Promise<void> => {
    const itemKey = await keyFor(file);
    try {
      await writeFileAtomic(file, sealItemBytes(dek, itemKey, bytes));
    } finally {
      itemKey.fill(0);
    }
  };
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
    },
    writeItemText: (file, text, encoding = 'utf8') => writeItem(file, Buffer.from(text, encoding)),
    writeItemBytes: (file, bytes) => writeItem(file, bytes),
    async itemKey(file) {
      const existing = await fs.readFile(file).catch(() => null);
      return existing ? itemKeyOf(dek, existing) : null;
    }
  };
}

/**
 * The I/O for `owner`'s `store`, as this context may use it. Plain for a store
 * that is not encrypted; sealed with the store DEK when it is. An encrypted
 * store whose DEK this context does not hold is refused — a read as much as a
 * write, so a locked store never falls back to reading or writing in the clear.
 */
export async function storeFileIO(ctx: ActorContext | undefined, args: {
  pagesDirectory: string;
  owner: string;
  store: string;
  layout?: PrivateStoreLayoutOverrides;
}): Promise<StoreFileIO> {
  const meta = await readStoreMeta(args.pagesDirectory, args.owner, args.store, args.layout);
  if (!meta.encrypt) return PLAIN_FILE_IO;
  const dek = dekFor(ctx, args.owner, args.store);
  assertEncryptedStoreWritable({ encrypt: true, dek });
  return sealedFileIO(dek as Buffer);
}

/**
 * Read one text file of `owner`'s `store` synchronously, as this context may:
 * plain for a store that is not encrypted, opened with the store DEK when it
 * is. Null when the file does not exist, or the store is encrypted and this
 * context does not hold its DEK — a locked store reads as nothing, never in
 * the clear (#1456: a store's page index is small, and page lookups are
 * synchronous).
 */
export function readStoreTextSync(ctx: ActorContext | undefined, args: {
  pagesDirectory: string;
  owner: string;
  store: string;
  file: string;
  layout?: PrivateStoreLayoutOverrides;
}): string | null {
  if (!fs.existsSync(args.file)) return null;
  let encrypt = false;
  const metaFile = storeMetaPath(args.pagesDirectory, args.owner, args.store, args.layout);
  if (fs.existsSync(metaFile)) {
    const meta = fs.readJsonSync(metaFile, { throws: false }) as { encrypt?: unknown } | null;
    encrypt = meta?.encrypt === true;
  }
  if (!encrypt) return fs.readFileSync(args.file, 'utf8');
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
  layout?: PrivateStoreLayoutOverrides;
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

/**
 * Re-seal an encrypted vault's pages, or its files, with keys of their own
 * (#1388, slice 2): `pages` is `{vault}/{uuid}.md`, `files` is
 * `{vault}/attachments/…`. Each one still sealed with the vault key is opened
 * and written back as an item file;
 * one already an item file is left as it is, so a second run writes nothing.
 * History, trash and the vault's indexes stay sealed with the vault key.
 *
 * Needs a context that can open the vault — its owner's unlocked session. A
 * vault that is not encrypted has nothing to convert.
 *
 * @returns How many files were re-sealed
 */
export async function convertStoreToItemFiles(ctx: ActorContext, which: 'pages' | 'files', args: {
  pagesDirectory: string;
  owner: string;
  store: string;
  layout?: PrivateStoreLayoutOverrides;
}): Promise<number> {
  const io = await storeFileIO(ctx, args);
  if (!io.sealed) return 0;
  const root = privateStoreRoot(args.pagesDirectory, args.owner, args.store, args.layout);
  const attachments = privateStoreAttachmentsDir(args.pagesDirectory, args.owner, args.store, args.layout);
  const listFiles = async (dir: string, keep: (name: string) => boolean): Promise<string[]> =>
    await fs.pathExists(dir)
      ? (await fs.readdir(dir, { withFileTypes: true })).filter((d) => d.isFile() && keep(d.name)).map((d) => path.join(dir, d.name))
      : [];
  const files = which === 'pages'
    ? await listFiles(root, (name) => name.endsWith('.md'))
    : await listFiles(attachments, () => true);
  let converted = 0;
  for (const file of files) {
    const raw = await fs.readFile(file);
    if (!isSealedBytes(raw) || isItemSealedBytes(raw)) continue;
    await io.writeItemBytes(file, await io.readBytes(file));
    converted++;
  }
  return converted;
}
