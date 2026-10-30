/**
 * `core.takeout` (#2118, ICE #1979): a download of a private store (#1387)
 * handed back, into its owner's private store (`core.private-store`). It
 * replaces the takeout import's own path (#1472).
 *
 * The engine unpacks the zip and hands each member here on its own, with the
 * archive beside it (`IceItem.archive`); this shim reads the takeout's
 * layout through that. What a takeout is, as #1387 writes it: one `{store}/`
 * folder holding each page as `{title}.md` with full frontmatter, files under
 * `attachments/`, and `files-index.json` mapping each file's id to its path
 * in the archive. The reader is lenient about the one thing people change,
 * the folder: someone who extracts a takeout and zips it again may add a
 * level, or zip the contents with no folder at all, so the takeout's root is
 * found rather than assumed.
 *
 * - A page (`.md` directly in the root) is one `takeout` item: its body as
 *   text, and in `data` its title, uuid and frontmatter, and the files of
 *   the takeout its body links to (`/attachments/{old id}`), so the
 *   receiver can store those first and point the links at their new ids.
 * - A file (directly in `attachments/`) is one `takeout` item: its bytes,
 *   and in `data` its old id, name, media type and description from the index.
 * - The file index is read through the archive by the members it names; on
 *   its own it holds nothing to import (`skip`). So does anything else in
 *   the archive: versions, the trash, footnotes and comments are not brought
 *   back, as before.
 *
 * Pure: no I/O, no access decision, no write. The receiver's door does those.
 */

import path from 'node:path';
import { parsePageFrontmatter } from '../../utils/pageFrontmatter.js';
import { TAKEOUT_FILE_INDEX } from '../../utils/privateStoreExport.js';
import type { StoreFileEntry } from '../../types/Provider.js';
import type { IceArchiveView, IceItem, IceShim, ShimReadResult } from '../types.js';

/** The kind this shim produces: one page or one file of a takeout. */
export const TAKEOUT_KIND = 'takeout';

/** The receiver a takeout goes into: its owner's private store. */
export const PRIVATE_STORE_RECEIVER = 'core.private-store';

const ATTACHMENTS_DIR = 'attachments';

/** A file of the takeout that a page links to, found through the archive. */
export interface TakeoutLinkedFile {
  /** Its id where it came from: what the page's links name. */
  oldId: string;
  /** Its path in the archive. */
  path: string;
  name: string;
  encodingFormat?: string;
  description?: string;
}

/** A page of a takeout: the `data` of its item; the body is the item's `text`. */
export interface TakeoutPageData {
  entry: 'page';
  /** From the frontmatter, else the file's name. */
  title: string;
  /** From the frontmatter. Absent for a page written by hand. */
  uuid?: string;
  /** The frontmatter, as written. */
  metadata: Record<string, unknown>;
  /** The takeout's files its body links to. */
  files: TakeoutLinkedFile[];
}

/** A file of a takeout: the `data` of its item; the bytes are the item's `bytes`. */
export interface TakeoutFileData {
  entry: 'file';
  /** Its id where it came from, when the file index names it. */
  oldId?: string;
  /** The name it was uploaded with. */
  name: string;
  encodingFormat?: string;
  description?: string;
}

export type TakeoutData = TakeoutPageData | TakeoutFileData;

/**
 * The folder the takeout lives in: the one holding the file index, else the
 * shallowest one holding a page. `''` is the archive's own root.
 */
export function takeoutRoot(paths: readonly string[]): string {
  const depth = (p: string): number => p.split('/').length;
  const index = paths.filter(p => path.posix.basename(p) === TAKEOUT_FILE_INDEX).sort((a, b) => depth(a) - depth(b))[0];
  const found = index ?? paths.filter(p => p.toLowerCase().endsWith('.md')).sort((a, b) => depth(a) - depth(b))[0];
  if (!found) return '';
  const dir = path.posix.dirname(found);
  return dir === '.' ? '' : dir;
}

/** `files` of a takeout's file index, keyed by path in the takeout; empty when unreadable. */
function readIndex(bytes: Buffer | undefined): Map<string, StoreFileEntry> {
  const byPath = new Map<string, StoreFileEntry>();
  if (!bytes) return byPath;
  try {
    const parsed = JSON.parse(bytes.toString('utf8')) as { files?: Record<string, StoreFileEntry> };
    for (const record of Object.values(parsed?.files ?? {})) {
      if (record && typeof record.id === 'string' && typeof record.fileName === 'string') {
        byPath.set(record.fileName, record);
      }
    }
  } catch {
    // An unreadable index costs the links, not the files: each file is still
    // imported, as a new one, under its own name.
  }
  return byPath;
}

/** What a takeout's layout is, worked out once per archive (#2162). */
interface TakeoutLayout {
  /** The takeout's folder, with its `/`; `''` at the archive's root. */
  prefix: string;
  /** The file index's records, by path in the takeout. */
  index: Map<string, StoreFileEntry>;
}

/**
 * Each archive's layout, keyed by its `paths`, which the engine shares among
 * every member of one archive (#2162). Parsing the index and finding the
 * root for every member would make one upload's cost the index's size times
 * its member count, all of it synchronous.
 */
const layouts = new WeakMap<readonly string[], TakeoutLayout>();

function layoutOf(archive: IceArchiveView): TakeoutLayout {
  const held = layouts.get(archive.paths);
  if (held) return held;
  const root = takeoutRoot(archive.paths);
  const prefix = root ? `${root}/` : '';
  const layout = { prefix, index: readIndex(archive.read(`${prefix}${TAKEOUT_FILE_INDEX}`)) };
  layouts.set(archive.paths, layout);
  return layout;
}

/**
 * A link to the file `id`, as `/attachments/{id}`: whole ids only, since an
 * id followed by more id characters is a different id.
 */
function attachmentLink(id: string, flags = ''): RegExp {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`/attachments/${escaped}(?![A-Za-z0-9_-])`, flags);
}

/** `body` with every `/attachments/{old}` link pointed at its new id. */
export function rewriteAttachmentLinks(body: string, ids: ReadonlyMap<string, string>): string {
  let out = body;
  for (const [from, to] of ids) {
    if (from === to) continue;
    out = out.replace(attachmentLink(from, 'g'), `/attachments/${to}`);
  }
  return out;
}

/** Whether `body` links to the file `id`. */
export function linksToAttachment(body: string, id: string): boolean {
  return attachmentLink(id).test(body);
}

/**
 * The first free title of `title`, `title (imported)`, `title (imported 2)` …
 * (operator, 2026-09-25): a DIFFERENT page already holding the title keeps
 * it, and the import lands beside it.
 */
export async function freeImportTitle(title: string, isTaken: (candidate: string) => Promise<boolean>): Promise<string> {
  if (!await isTaken(title)) return title;
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? `${title} (imported)` : `${title} (imported ${n})`;
    if (!await isTaken(candidate)) return candidate;
  }
}

/** A page member: its frontmatter, title and uuid, and the takeout's files its body links to. */
function readPage(input: IceItem, archive: IceArchiveView, inRoot: string, { prefix, index }: TakeoutLayout): IceItem {
  const stem = inRoot.slice(0, -'.md'.length);
  const text = (input.bytes ?? Buffer.alloc(0)).toString('utf8');
  let metadata: Record<string, unknown> = {};
  let body = text;
  try {
    const parsed = parsePageFrontmatter(text);
    metadata = { ...parsed.data };
    body = parsed.content;
  } catch {
    // Frontmatter that does not parse: the whole file is the body, and the
    // page is named by its file. Losing someone's page over YAML is the wrong trade.
  }
  const title = typeof metadata.title === 'string' && metadata.title.trim() ? metadata.title.trim() : stem;
  const uuid = typeof metadata.uuid === 'string' && metadata.uuid.trim() ? metadata.uuid.trim() : undefined;

  const files: TakeoutLinkedFile[] = [];
  for (const [inTakeout, record] of index) {
    const memberPath = `${prefix}${inTakeout}`;
    if (!linksToAttachment(body, record.id) || !archive.read(memberPath)) continue;
    files.push({
      oldId: record.id, path: memberPath, name: record.name || path.posix.basename(inTakeout),
      ...(record.encodingFormat ? { encodingFormat: record.encodingFormat } : {}),
      ...(record.description ? { description: record.description } : {})
    });
  }

  const data: TakeoutPageData = { entry: 'page', title, ...(uuid ? { uuid } : {}), metadata, files };
  // The archive travels with the page, so the receiver can read the files it links to.
  return { kind: TAKEOUT_KIND, name: input.name, text: body, data, archive };
}

/** Read one member of a takeout. */
async function read(input: IceItem): Promise<ShimReadResult> {
  const archive = input.archive;
  if (!archive) return { items: [], skip: 'not part of a takeout: a takeout is imported as the zip it was downloaded as' };
  // The engine unpacks a zip inside a zip too. A takeout's own files that are
  // zips arrive so, unpacked: they are not a takeout, and are left out.
  if (archive.name.includes('/')) return { items: [], skip: 'inside a zip within the takeout; a zip the store held is not brought back' };
  const layout = layoutOf(archive);
  const { prefix } = layout;
  if (!archive.path.startsWith(prefix)) return { items: [], skip: 'outside the takeout\'s folder; left out' };
  const inRoot = archive.path.slice(prefix.length);

  if (inRoot === TAKEOUT_FILE_INDEX) return { items: [], skip: 'the takeout\'s file index, read with the files it names' };
  if (!inRoot.includes('/') && inRoot.toLowerCase().endsWith('.md')) {
    return { items: [readPage(input, archive, inRoot, layout)] };
  }
  if (inRoot.startsWith(`${ATTACHMENTS_DIR}/`) && !inRoot.slice(ATTACHMENTS_DIR.length + 1).includes('/')) {
    const record = layout.index.get(inRoot);
    const name = record?.name || path.posix.basename(inRoot);
    const data: TakeoutFileData = {
      entry: 'file', name,
      ...(record ? { oldId: record.id } : {}),
      ...(record?.encodingFormat ? { encodingFormat: record.encodingFormat } : {}),
      ...(record?.description ? { description: record.description } : {})
    };
    const mediaType = record?.encodingFormat || input.mediaType;
    return { items: [{ kind: TAKEOUT_KIND, name: input.name, bytes: input.bytes ?? Buffer.alloc(0), data, ...(mediaType ? { mediaType } : {}) }] };
  }
  // Versions, the trash, footnotes, comments, anything else: not brought back (#1472).
  return { items: [], skip: 'neither a page nor a file of the takeout; left out' };
}

/** The takeout shim: every member of a zip, read as a takeout's layout says. */
export const takeoutShim: IceShim = {
  name: 'takeout',
  label: 'A download of your private store',
  direction: 'in',
  // A member of an archive: the layout is read through the archive. Only the
  // private-store receiver is handed what it produces, so no other import
  // reads a zip this way.
  accepts: { canRead: (input: IceItem) => !!input.archive },
  produces: TAKEOUT_KIND,
  receivers: [PRIVATE_STORE_RECEIVER],
  read
};
