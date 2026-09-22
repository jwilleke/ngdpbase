/**
 * Reading and writing the bytes of a private store (#1415, epic #1382).
 *
 * The store DEK "encrypts every byte in `private/{user}/{store}/`"
 * (docs/planning/private-stores.md, Keys). This is the one place that turns
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
import { assertEncryptedStoreWritable, openBytes, sealBytes } from './privateStoreCrypto.js';
import { readStoreMeta } from './privateStoreMeta.js';
import { parsePrivateStoreRel, storeMetaPath, type PrivateStoreLayoutOverrides } from './privateStorePath.js';
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
