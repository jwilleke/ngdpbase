/**
 * Reading a private store back out, byte for byte (#1387, epic #1382).
 *
 * Two features need the same thing and must not grow two answers to it:
 *
 *   - the instance backup, which copies every store so a disk failure is
 *     survivable, and
 *   - a user's own download, which is how someone leaves with their data.
 *
 * What they share is this module: walk a store directory and hand back every
 * file in it as bytes. Packaging and permission are the callers' business.
 *
 * ## Bytes, never text
 *
 * `FileSystemProvider.backup()` reads pages with an encoding, which is right
 * for a public page and destroys a private one: a sealed store's `.md` files
 * are ciphertext, and decoding them as UTF-8 substitutes U+FFFD for every byte
 * that is not valid UTF-8. The file would still be in the backup, and would
 * still look like a file, and would never decrypt again.
 *
 * So everything here is `Buffer`. A caller that wants text can decode what it
 * knows to be text; nothing in this module ever does.
 *
 * ## The whole store, including its keys
 *
 * A store is self-contained by design (see `privateStorePath`), so a takeout is
 * "copy this directory" — pages, their versions, the trash, the attachments and
 * every index. The user's `user-keys.json` is copied too, deliberately: it is a
 * WRAPPED key, useless without the password or the twelve words, and without it
 * a restored sealed store could never be opened again by anyone, including its
 * owner. Copying the wrapped key does not make the copier a keyholder.
 */

import path from 'path';
import fs from 'fs-extra';
import {
  privateUserDir,
  privateStoreRoot,
  resolvePrivateStoreLayout,
  type PrivateStoreLayoutOverrides
} from './privateStorePath.js';

/** One file of a store, exactly as it sits on disk. */
export type StoreFile = {
  /** Path relative to what was walked, with `/` separators on every platform. */
  path: string;
  /** The file's bytes. Ciphertext stays ciphertext. */
  bytes: Buffer;
  /** Last-modified time, so a restore can preserve it. */
  mtime: Date;
};

/** A store found on disk, and everything in it. */
export type StoreTakeout = {
  owner: string;
  store: string;
  /** Files of the store directory itself, relative to the store root. */
  files: StoreFile[];
  /** Total bytes, for a caller that wants to refuse an unreasonable download. */
  totalBytes: number;
};

/** Recursively list every file under `dir`, relative to it, `/`-separated. */
async function walkFiles(dir: string, prefix = ''): Promise<string[]> {
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const out: string[] = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...await walkFiles(path.join(dir, entry.name), rel));
    } else if (entry.isFile()) {
      out.push(rel);
    }
    // Anything else — a symlink, a socket — is not a store file. Following a
    // symlink here would copy whatever it points at into a takeout.
  }
  return out;
}

/** Read the named files under `root` as bytes, skipping any that vanish mid-walk. */
async function readAll(root: string, relPaths: string[]): Promise<StoreFile[]> {
  const files: StoreFile[] = [];
  for (const rel of relPaths) {
    const abs = path.join(root, ...rel.split('/'));
    try {
      const [bytes, stat] = await Promise.all([fs.readFile(abs), fs.stat(abs)]);
      files.push({ path: rel, bytes, mtime: stat.mtime });
    } catch {
      // A page purged while the walk was running is not an error: the takeout
      // is a point-in-time copy, and the file is simply no longer part of it.
    }
  }
  return files;
}

/**
 * Every file of one store, as bytes.
 *
 * Returns an empty file list when the store does not exist, so a caller can ask
 * about a store without first proving it is there.
 */
export async function collectStore(
  pagesDirectory: string,
  owner: string,
  store: string,
  layout?: PrivateStoreLayoutOverrides
): Promise<StoreTakeout> {
  const root = privateStoreRoot(pagesDirectory, owner, store, layout);
  const files = await readAll(root, await walkFiles(root));
  return {
    owner,
    store,
    files,
    totalBytes: files.reduce((sum, f) => sum + f.bytes.length, 0)
  };
}

/** The store ids a user has on disk, in directory order. */
export async function listStoreIds(
  pagesDirectory: string,
  owner: string,
  layout?: PrivateStoreLayoutOverrides
): Promise<string[]> {
  const userDir = privateUserDir(pagesDirectory, owner, layout);
  try {
    const entries = await fs.readdir(userDir, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return [];
  }
}

/** The users who have a private directory on disk, in directory order. */
export async function listPrivateOwners(
  pagesDirectory: string,
  layout?: PrivateStoreLayoutOverrides
): Promise<string[]> {
  const L = resolvePrivateStoreLayout(layout);
  try {
    const entries = await fs.readdir(path.join(pagesDirectory, L.privateRoot), { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return [];
  }
}

/**
 * Everything one user keeps privately: each of their stores, plus the files
 * that sit at the user level beside them (`user-keys.json` and any legacy
 * catalogue still there).
 *
 * This is the unit both callers work in — an instance backup asks for it once
 * per owner, and a user's own download asks for it once, for themselves.
 */
export async function collectUser(
  pagesDirectory: string,
  owner: string,
  layout?: PrivateStoreLayoutOverrides
): Promise<{ owner: string; userFiles: StoreFile[]; stores: StoreTakeout[]; totalBytes: number }> {
  const userDir = privateUserDir(pagesDirectory, owner, layout);

  // Files directly in the user directory — not the store directories.
  let topLevel: string[];
  try {
    const entries = await fs.readdir(userDir, { withFileTypes: true });
    topLevel = entries.filter(e => e.isFile()).map(e => e.name);
  } catch {
    topLevel = [];
  }

  const userFiles = await readAll(userDir, topLevel);
  const stores: StoreTakeout[] = [];
  for (const store of await listStoreIds(pagesDirectory, owner, layout)) {
    stores.push(await collectStore(pagesDirectory, owner, store, layout));
  }

  const totalBytes =
    userFiles.reduce((sum, f) => sum + f.bytes.length, 0) +
    stores.reduce((sum, s) => sum + s.totalBytes, 0);

  return { owner, userFiles, stores, totalBytes };
}
