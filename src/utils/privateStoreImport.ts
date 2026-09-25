/**
 * Reading a takeout handed back for import (#1472) — the mirror of
 * `privateStoreExport.ts`.
 *
 * Pure: entries in, a description of what they hold out. No I/O, no access
 * decision, no write. The door that acts on it is
 * `ImportManager.importOwnStoreTakeout`.
 *
 * What a takeout is, as #1387 writes it: one `{store}/` folder holding each
 * page as `{title}.md` with full frontmatter, files under `attachments/`, and
 * `files-index.json` mapping each file's id to its path in the archive. The
 * reader is lenient about the one thing people change — the folder. Someone
 * who extracts a takeout and zips it again may add a level, or zip the
 * contents with no folder at all, so the takeout's root is found rather than
 * assumed.
 */

import path from 'path';
import { parsePageFrontmatter } from './pageFrontmatter.js';
import { TAKEOUT_FILE_INDEX } from './privateStoreExport.js';
import type { ZipEntry } from './zipArchive.js';
import type { StoreFileEntry } from '../types/Provider.js';

/** One page of a takeout. */
export type TakeoutPage = {
  /** Where it was in the archive — how the report names a page that failed. */
  archivePath: string;
  /** From the frontmatter, else the file's name. */
  title: string;
  /** From the frontmatter. Absent for a page written by hand. */
  uuid?: string;
  /** The frontmatter, as written. */
  metadata: Record<string, unknown>;
  body: string;
};

/** One file of a takeout. */
export type TakeoutFile = {
  archivePath: string;
  /** Its id where it came from, when the file index names it. */
  oldId?: string;
  /** The name it was uploaded with. */
  name: string;
  encodingFormat?: string;
  description?: string;
  bytes: Buffer;
};

export type ParsedTakeout = {
  pages: TakeoutPage[];
  files: TakeoutFile[];
  /** Archive members that are neither a page nor a file, left alone. */
  ignored: string[];
};

const ATTACHMENTS_DIR = 'attachments';

/**
 * The folder the takeout lives in: the one holding the file index, else the
 * shallowest one holding a page. `''` is the archive's own root.
 */
function findRoot(entries: readonly ZipEntry[]): string {
  const index = entries
    .map(e => e.path)
    .filter(p => path.posix.basename(p) === TAKEOUT_FILE_INDEX)
    .sort((a, b) => a.split('/').length - b.split('/').length)[0];
  if (index) return path.posix.dirname(index) === '.' ? '' : path.posix.dirname(index);

  const page = entries
    .map(e => e.path)
    .filter(p => p.toLowerCase().endsWith('.md'))
    .sort((a, b) => a.split('/').length - b.split('/').length)[0];
  if (!page) return '';
  const dir = path.posix.dirname(page);
  return dir === '.' ? '' : dir;
}

/** `files` of a takeout's file index, keyed by path in the takeout; empty when unreadable. */
function readIndex(entry: ZipEntry | undefined): Map<string, StoreFileEntry> {
  const byPath = new Map<string, StoreFileEntry>();
  if (!entry) return byPath;
  try {
    const parsed = JSON.parse(entry.bytes.toString('utf8')) as { files?: Record<string, StoreFileEntry> };
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

/** What a takeout's entries hold. */
export function readTakeout(entries: readonly ZipEntry[]): ParsedTakeout {
  const root = findRoot(entries);
  const prefix = root ? `${root}/` : '';
  const index = readIndex(entries.find(e => e.path === `${prefix}${TAKEOUT_FILE_INDEX}`));

  const pages: TakeoutPage[] = [];
  const files: TakeoutFile[] = [];
  const ignored: string[] = [];

  for (const entry of entries) {
    if (!entry.path.startsWith(prefix)) {
      ignored.push(entry.path);
      continue;
    }
    const inRoot = entry.path.slice(prefix.length);
    if (inRoot === TAKEOUT_FILE_INDEX) continue;

    if (!inRoot.includes('/') && inRoot.toLowerCase().endsWith('.md')) {
      pages.push(readPage(entry, inRoot));
    } else if (inRoot.startsWith(`${ATTACHMENTS_DIR}/`) && !inRoot.slice(ATTACHMENTS_DIR.length + 1).includes('/')) {
      const record = index.get(inRoot);
      files.push({
        archivePath: entry.path,
        ...(record ? { oldId: record.id } : {}),
        name: record?.name || path.posix.basename(inRoot),
        ...(record?.encodingFormat ? { encodingFormat: record.encodingFormat } : {}),
        ...(record?.description ? { description: record.description } : {}),
        bytes: entry.bytes
      });
    } else {
      ignored.push(entry.path);
    }
  }

  return { pages, files, ignored };
}

function readPage(entry: ZipEntry, fileName: string): TakeoutPage {
  const stem = fileName.slice(0, -'.md'.length);
  const text = entry.bytes.toString('utf8');
  let metadata: Record<string, unknown> = {};
  let body = text;
  try {
    const parsed = parsePageFrontmatter(text);
    metadata = { ...parsed.data };
    body = parsed.content;
  } catch {
    // Frontmatter that does not parse: the whole file is the body, and the
    // page is named by its file. Losing someone's page over YAML is the wrong
    // trade.
  }
  const title = typeof metadata.title === 'string' && metadata.title.trim() ? metadata.title.trim() : stem;
  const uuid = typeof metadata.uuid === 'string' && metadata.uuid.trim() ? metadata.uuid.trim() : undefined;
  return { archivePath: entry.path, title, ...(uuid ? { uuid } : {}), metadata, body };
}

/**
 * A link to the file `id`, as `/attachments/{id}` — whole ids only: an id
 * followed by more id characters is a different id.
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
 * (operator, 2026-09-25): a DIFFERENT page already holding the title keeps it,
 * and the import lands beside it.
 */
export async function freeImportTitle(title: string, isTaken: (candidate: string) => Promise<boolean>): Promise<string> {
  if (!await isTaken(title)) return title;
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? `${title} (imported)` : `${title} (imported ${n})`;
    if (!await isTaken(candidate)) return candidate;
  }
}
