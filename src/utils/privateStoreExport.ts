/**
 * Building a person's takeout of their own private store (#1387).
 *
 * The decisions this implements, all recorded on #1387:
 *
 *   - **It is decrypted.** There is one form of takeout, and it is readable.
 *     Someone who leaves with their data can open it in any text editor on the
 *     laptop or phone they downloaded it to.
 *   - **It is a copy you can read, not a copy you can pour back.** Pages under
 *     their real titles and attachments under the names they were uploaded
 *     with; no `versions/`, no `deleted/`, none of the store's indexes, and no
 *     `user-keys.json` — a wrapped key guards nothing that is not already in
 *     the clear beside it. Restoring a store as it was is the instance
 *     backup's job, which does it better by keeping the encryption.
 *   - **Full frontmatter is kept.** Title, uuid, author, timestamps, keywords.
 *     It stays perfectly readable, and the uuid is what lets a later import
 *     (#1472) recognise a page as the same page rather than duplicating it.
 *   - **Nothing decrypted is written to the server's disk.** Everything here
 *     returns bytes in memory for the caller to stream.
 *
 * Reading goes through `storeFileIO`, which hands back plain or sealed I/O and
 * REFUSES an encrypted store whose key this context does not hold. A locked
 * store therefore throws rather than quietly producing an archive of
 * ciphertext or of nothing at all — a takeout that looks like it worked and
 * cannot be read is worse than an error.
 */

import path from 'path';
import fs from 'fs-extra';
import { parsePageFrontmatter } from './pageFrontmatter.js';
import { storeFileIO } from './privateStoreFiles.js';
import {
  privateStoreRoot,
  resolvePrivateStoreLayout,
  storeFileIndexPath,
  type PrivateStoreLayoutOverrides
} from './privateStorePath.js';
import type { ActorContext } from '../context/ActorContext.js';
import type { StoreFileEntry } from '../types/Provider.js';
import { normaliseTitle } from './pageTitleRule.js';
import { isSealedBytes } from './privateStoreCrypto.js';

/** One file of the takeout, ready for a packer. */
export type TakeoutFile = {
  /** Path inside the archive, `/`-separated. */
  path: string;
  bytes: Buffer;
  mtime: Date;
};

export type TakeoutOptions = {
  pagesDirectory: string;
  owner: string;
  store: string;
  /** Leave the attachments out — someone who wants their writing, not gigabytes of photos. */
  pagesOnly?: boolean;
  layout?: PrivateStoreLayoutOverrides;
};

export type Takeout = {
  owner: string;
  store: string;
  files: TakeoutFile[];
  pageCount: number;
  attachmentCount: number;
  totalBytes: number;
};

/**
 * A filename for a page title.
 *
 * The title is the point — someone opens the archive and sees their own page
 * names — so this changes as little as possible: only what a file system
 * cannot hold. `normaliseTitle` already encodes that rule for page titles, and
 * is reused rather than restated here.
 */
function pageFileName(title: string): string {
  // Not a defence against anything: the save door already refuses a title
  // holding `/` or `\\`, so no page saved through it can carry one. This is for
  // a title that reached DISK another way — a hand-edited file, a restored
  // backup, an import older than the rule — since a takeout is named from the
  // frontmatter it reads, not from the validated page name.
  //
  // Leading dots and dashes go for a plainer reason: a name beginning with `.`
  // is hidden on Unix, and a page missing from the extracted folder is a page
  // its owner thinks they lost.
  const safe = normaliseTitle(title).trim().replace(/^[.\-\s]+/, '').trim();
  return `${safe || 'Untitled'}.md`;
}

/**
 * A safe leaf name for an ARCHIVE entry, from a name a person chose.
 *
 * An uploaded file is stored on disk as `{generated-id}{ext}`, so its original
 * name never becomes a path on this server — `path.extname` takes the extension
 * of the basename, and a `/` cannot survive into it. But the original name IS
 * kept, and a takeout puts it in the archive, where it becomes a path on
 * SOMEONE ELSE'S machine.
 *
 * That is where a name harmless here turns dangerous there. On Linux `\` is an
 * ordinary character, so `x.\..\..\etc\passwd` is one strange filename; handed
 * to an extractor on Windows, it is a path that climbs out of the folder. So
 * both separators go, and so does any `..` segment — this is the one place the
 * name crosses from being data to being a path.
 */
function archiveFileName(raw: string): string {
  const leaf = raw
    .split(/[/\\]/)                       // both separators, whatever the platform thinks
    .filter(part => part && part !== '.' && part !== '..')
    .pop() ?? '';
  const safe = leaf.replace(/^[.\s]+/, '').trim();
  return safe || 'file';
}

/** Make `name` unique within `taken`, appending ` (2)`, ` (3)` … before the extension. */
function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name.toLowerCase())) {
    taken.add(name.toLowerCase());
    return name;
  }
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!taken.has(candidate.toLowerCase())) {
      taken.add(candidate.toLowerCase());
      return candidate;
    }
  }
}

/** The store's file index, or an empty one. Sealed exactly when the store is. */
async function readFileIndex(
  io: { readText(file: string): Promise<string> },
  indexFile: string
): Promise<StoreFileEntry[]> {
  if (!await fs.pathExists(indexFile)) return [];
  try {
    const parsed = JSON.parse(await io.readText(indexFile)) as { files?: Record<string, StoreFileEntry> };
    return parsed?.files ? Object.values(parsed.files) : [];
  } catch {
    // A takeout must not fail because an index is unreadable: the pages are
    // what matter, and the attachments are still on disk for a later attempt.
    return [];
  }
}

/**
 * Build a takeout of one store.
 *
 * Throws when the store is encrypted and `ctx` does not hold its key — the
 * caller turns that into "unlock your store first", never into an empty
 * archive.
 */
export async function buildStoreTakeout(
  ctx: ActorContext,
  options: TakeoutOptions
): Promise<Takeout> {
  const { pagesDirectory, owner, store, layout } = options;
  const L = resolvePrivateStoreLayout(layout);
  const root = privateStoreRoot(pagesDirectory, owner, store, layout);

  // Refuses a sealed store this context cannot open. Deliberately not caught.
  const io = await storeFileIO(ctx, { pagesDirectory, owner, store, layout });

  const files: TakeoutFile[] = [];
  const taken = new Set<string>();
  let pageCount = 0;
  let attachmentCount = 0;

  // ── Pages ────────────────────────────────────────────────────────────────
  // Only `.md` directly in the store root. `versions/` and `deleted/` are
  // directories and are therefore skipped by construction, which is what the
  // decision asks for.
  let rootEntries: string[];
  try {
    const dirents = await fs.readdir(root, { withFileTypes: true });
    rootEntries = dirents.filter(d => d.isFile() && d.name.toLowerCase().endsWith('.md')).map(d => d.name);
  } catch {
    rootEntries = [];
  }

  for (const entry of rootEntries.sort()) {
    const abs = path.join(root, entry);
    let bytes: Buffer;
    let mtime: Date;
    try {
      bytes = await io.readBytes(abs);
      mtime = (await fs.stat(abs)).mtime;
    } catch {
      // A page purged mid-build is simply not in this point-in-time copy.
      continue;
    }

    // The title is in the frontmatter; the file on disk is named by uuid.
    let title = path.basename(entry, path.extname(entry));
    try {
      const parsed = parsePageFrontmatter(bytes.toString('utf8'));
      const fromMatter = parsed.data?.title;
      if (typeof fromMatter === 'string' && fromMatter.trim()) title = fromMatter.trim();
    } catch {
      // Unparseable frontmatter: keep the page, name it by its file. Losing a
      // page from someone's takeout to save a filename would be the wrong trade.
    }

    files.push({ path: `${store}/${uniqueName(pageFileName(title), taken)}`, bytes, mtime });
    pageCount++;
  }

  // ── Attachments ──────────────────────────────────────────────────────────
  if (!options.pagesOnly) {
    const index = await readFileIndex(io, storeFileIndexPath(pagesDirectory, owner, store, layout));
    const attachmentNames = new Set<string>();

    for (const record of index) {
      const abs = path.join(root, L.attachmentsDir, record.fileName);
      let bytes: Buffer;
      let mtime: Date;
      try {
        bytes = await io.readBytes(abs);
        mtime = (await fs.stat(abs)).mtime;
      } catch {
        continue;
      }

      // The name it was uploaded with, not the uuid it is stored under.
      const wanted = archiveFileName(record.name || record.fileName);
      files.push({
        path: `${store}/${L.attachmentsDir}/${uniqueName(wanted, attachmentNames)}`,
        bytes,
        mtime
      });
      attachmentCount++;
    }
  }

  // A takeout is NEVER encrypted (operator, #1387). Everything above reads
  // through `storeFileIO`, which decrypts a sealed store, so this should be
  // impossible — which is exactly why it is checked. A takeout of ciphertext
  // looks like a takeout, downloads like one, and is found to be unreadable
  // long after the store it came from is gone, so the guarantee is enforced
  // here rather than left to hold by construction.
  const sealed = files.find(f => isSealedBytes(f.bytes));
  if (sealed) {
    throw new Error(`[privateStoreExport] "${sealed.path}" is still ciphertext — a takeout is never encrypted`);
  }

  return {
    owner,
    store,
    files,
    pageCount,
    attachmentCount,
    totalBytes: files.reduce((sum, f) => sum + f.bytes.length, 0)
  };
}
