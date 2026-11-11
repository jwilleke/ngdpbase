/**
 * `core.search`: a search's results as an export source (ICE).
 *
 * The ref is the search itself, the page search's own parameters as JSON
 * ({@link searchExportParams}). The search is run again when the export starts,
 * as the user who asked, so what is exported is what that user may read now:
 *
 * - pages come from SearchManager, which keeps only pages the user may open,
 *   and each is read again through PageManager's door (`page-read`);
 * - a page is also checked the way exporting it alone is ({@link SearchExportDeps.mayExportPage}),
 *   so a private page or a shared folder's page the user may read but not export is left out;
 * - files are the attachments and media-library files the search finds, each
 *   checked with the rule its own door uses (the download rule for an
 *   attachment, the media library's own for a media file) and handed over as
 *   its original;
 * - people are not files: they are counted and left out;
 * - the site's limits (`max-items` pages and files together, `max-bytes`) end
 *   the list, and the source says how many readable matches that left out.
 *
 * What an item the user may not read is never revealed: it is not in the zip
 * and not in any count.
 */
import fs from 'fs-extra';
import type { ActorContext } from '../context/ActorContext.js';
import { EXPORT_FILE_KIND, type ExportReadInfo, type IceExportSource, type IceItem } from './types.js';

/** The most matches looked at, so a huge site cannot make one export read it all. Reaching it is said on the finished screen. */
const LOOK_AHEAD = 5000;

/** The media library's id among the asset providers. */
const MEDIA_LIBRARY = 'media-library';

/** Core's search export source. */
export const SEARCH_EXPORT_SOURCE = 'core.search';

const MIME_CATEGORIES = ['image', 'video', 'audio', 'document', 'other'] as const;

/** A search, as the page search takes it: the fields `/search` and `/api/assets/search` read. */
export interface SearchExportParams {
  q?: string;
  types?: string;
  mimeCategory?: string;
  year?: number;
  category?: string[];
  keywords?: string[];
  systemKeywords?: string[];
  status?: string[];
  searchIn?: string[];
  since?: string;
  until?: string;
  date?: string;
}

const TEXT_FIELDS = ['q', 'types', 'mimeCategory', 'since', 'until', 'date'] as const;
const LIST_FIELDS = ['category', 'keywords', 'systemKeywords', 'status', 'searchIn'] as const;

/** The search's parameters from a query string or a body: known fields only, empty ones left out. */
export function searchExportParams(src: Record<string, unknown> | null | undefined): SearchExportParams {
  const out: SearchExportParams & Record<string, unknown> = {};
  const from = src ?? {};
  for (const key of TEXT_FIELDS) {
    const raw = Array.isArray(from[key]) ? (from[key] as unknown[])[0] : from[key];
    if (typeof raw === 'string' && raw.trim()) out[key] = raw.trim();
  }
  const year = parseInt(String(Array.isArray(from['year']) ? from['year'][0] : from['year'] ?? ''), 10);
  if (year > 0) out['year'] = year;
  for (const key of LIST_FIELDS) {
    const raw = from[key];
    const list = (Array.isArray(raw) ? raw : [raw]).filter((v): v is string => typeof v === 'string' && v.trim() !== '');
    if (list.length) out[key] = list;
  }
  return out;
}

/** What `read` and `mayExport` take as `ref`. */
export const searchExportRef = (src: Record<string, unknown> | null | undefined): string => JSON.stringify(searchExportParams(src));

function parseRef(ref: string): SearchExportParams | null {
  try {
    const parsed: unknown = JSON.parse(ref);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? searchExportParams(parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A value as text when it is a string or a number, else empty. */
const text = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

/** A page as an NCM item: its text and what a document made from it shows. */
export function pageItem(name: string, content: string, metadata: Record<string, unknown>): IceItem {
  return {
    kind: 'ncm',
    name,
    text: content,
    metadata: {
      title: name,
      ...(text(metadata['lastModified']) ? { lastModified: text(metadata['lastModified']) } : {}),
      ...(text(metadata['system-category']) ? { 'system-category': text(metadata['system-category']) } : {}),
      ...(Array.isArray(metadata['user-keywords']) ? { 'user-keywords': metadata['user-keywords'] } : {})
    }
  };
}

interface Manager { getManager<M>(name: string): M | null | undefined }
type PageHit = { name: string };
type FileHit = { id: string; providerId?: string; filename?: string; name?: string };
interface PageManagerLike {
  mayShowPage(ref: string, ctx: ActorContext): Promise<boolean>;
  readPage(ref: string, ctx: ActorContext): Promise<{ ok: true; name: string; metadata: Record<string, unknown>; value: { content: string } } | { ok: false }>;
}
interface AttachmentLike {
  /** May this user read the file, by the rule serving it uses? */
  mayReadAttachment(id: string, ctx: ActorContext): Promise<boolean>;
  readAttachmentFor(id: string, ctx: ActorContext): Promise<{ buffer: Buffer; metadata: { name?: unknown; encodingFormat?: unknown } } | null>;
}

interface MediaLike {
  /** The media item when the user in `wikiContext` may read it, else null. */
  getItem(id: string, wikiContext: unknown): Promise<{ filePath: string; mimeType?: string; filename?: string } | null>;
}

export interface SearchExportDeps {
  engine: Manager;
  /** May this user export this page alone (`page-export` for it, in its private store or shared folder)? */
  mayExportPage(ctx: ActorContext, pageName: string): Promise<boolean>;
  limits(): { maxItems: number; maxBytes: number };
  /** Is the Export action for a search offered to this user (page-export held)? */
  offered(ctx: ActorContext): Promise<boolean>;
  /** Does this user hold `page-export` now? Throws the step-up answer when it needs a fresh sign-in. */
  allowed(ctx: ActorContext): Promise<boolean>;
  permits(ctx: ActorContext, permission: string): Promise<boolean>;
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/** A size in words: `25 MB`, or `1 KB` for a small one. */
function sizeWords(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${Math.round(bytes / 1024 / 1024)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** A name for a file in a zip: its own, with no folder in it and nothing a file system refuses. */
function zipFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = name.split(/[\\/]/).pop()!.replace(/[:*?"<>|\u0000-\u001f]+/g, '-').trim();
  return /^\.*$/.test(clean) ? 'file' : clean;
}

export function searchExportSource(deps: SearchExportDeps): IceExportSource {
  const pageManager = (): PageManagerLike | null => deps.engine.getManager<PageManagerLike>('PageManager') ?? null;
  const attachments = (): AttachmentLike | null => deps.engine.getManager<AttachmentLike>('AttachmentManager') ?? null;

  /** The matches: page names and file ids in the order the search lists them, and how many people matched. */
  async function find(p: SearchExportParams, ctx: ActorContext): Promise<{ pages: PageHit[]; files: FileHit[]; people: number; capped: boolean }> {
    const types = p.types ?? '';
    const all = types === '' || types === 'all';
    const narrowed = Boolean(p.mimeCategory) || Boolean(p.year);
    // The search page's own rules: a file facet leaves pages and people out of "all sources".
    const wantPages = types === 'page' || (all && !narrowed);
    const wantPeople = types === 'user' || (all && !narrowed);
    const wantFiles = all || types === 'local' || types === 'attachment' || types === 'media' || types === 'media-library';
    // All sources asks every file store; a narrower search asks that one.
    const providers = all ? undefined : types === 'media' || types === 'media-library' ? ['media-library'] : ['local'];
    // shortcut: the search only needs a context's user; this stands in for the request's WikiContext.
    const wikiContext = { userContext: ctx } as never;
    const out = { pages: [] as PageHit[], files: [] as FileHit[], people: 0, capped: false };

    const search = deps.engine.getManager<{ advancedSearchWithContext?(c: unknown, o: Record<string, unknown>): Promise<PageHit[]> }>('SearchManager');
    if (wantPages && search?.advancedSearchWithContext && await deps.permits(ctx, 'search-page')) {
      out.pages = await search.advancedSearchWithContext(wikiContext, {
        query: p.q ?? '',
        categories: p.category ?? [],
        userKeywords: p.keywords ?? [],
        systemKeywords: p.systemKeywords ?? [],
        ...(p.status?.length ? { statuses: p.status } : {}),
        searchIn: p.searchIn?.length ? p.searchIn : ['title'],
        ...(p.date || p.since || p.until ? { dateRange: { ...(p.date || p.since ? { from: p.date || p.since } : {}), ...(p.date || p.until ? { to: p.date || p.until } : {}) } } : {}),
        maxResults: LOOK_AHEAD
      });
      if (out.pages.length >= LOOK_AHEAD) out.capped = true;
    }

    const users = deps.engine.getManager<{ searchUsers?(q: string, o: object, c: ActorContext): Promise<unknown[]> }>('UserManager');
    if (wantPeople && users?.searchUsers && await deps.permits(ctx, 'search-user')) {
      out.people = (await users.searchUsers(p.q ?? '', { limit: LOOK_AHEAD, activeOnly: true }, ctx)).length;
      if (out.people >= LOOK_AHEAD) out.capped = true;
    }

    const assets = deps.engine.getManager<{ search(o: Record<string, unknown>, c: ActorContext): Promise<{ results: FileHit[] }> }>('AssetService');
    if (wantFiles && assets && await deps.permits(ctx, 'asset-upload')) {
      const mimeCategory = MIME_CATEGORIES.find(c => c === p.mimeCategory);
      out.files = (await assets.search({
        query: p.q ?? '', ...(providers ? { types: providers } : {}), mimeCategory, year: p.year, pageSize: LOOK_AHEAD, offset: 0, sort: 'date', order: 'asc',
        wikiContext, userRoles: (ctx as { roles?: string[] }).roles ?? [], username: ctx.username
      }, ctx))?.results ?? [];
      if (out.files.length >= LOOK_AHEAD) out.capped = true;
    }
    return out;
  }

  return {
    name: 'search',
    label: 'Search results',
    yields: 'ncm',
    zipAs: 'search-results',

    mayExport: async (ref, ctx) => parseRef(ref) !== null && await deps.offered(ctx),

    read: async (ref: string, ctx: ActorContext, info: ExportReadInfo): Promise<IceItem[] | null> => {
      const params = parseRef(ref);
      if (!params || !await deps.allowed(ctx)) return null;
      const { maxItems, maxBytes } = deps.limits();
      const found = await find(params, ctx);
      const pm = pageManager();
      const am = attachments();
      const media = deps.engine.getManager<MediaLike>('MediaManager');
      const wikiContext = { userContext: ctx };

      type Candidate = { page: string } | { file: FileHit };
      const candidates: Candidate[] = [...found.pages.map(h => ({ page: h.name })), ...found.files.map(file => ({ file }))];
      const mayRead = async (c: Candidate): Promise<boolean> =>
        'page' in c
          ? Boolean(await pm?.mayShowPage(c.page, ctx)) && await deps.mayExportPage(ctx, c.page)
          : c.file.providerId === MEDIA_LIBRARY ? Boolean(await media?.getItem(c.file.id, wikiContext)) : Boolean(await am?.mayReadAttachment(c.file.id, ctx));

      const items: IceItem[] = [];
      let used = 0;
      let leftOut = 0;
      let reason: string | null = null;
      for (const c of candidates) {
        if (reason) {
          if (await mayRead(c)) leftOut++;
          continue;
        }
        if (items.length >= maxItems) {
          if (await mayRead(c)) {
            leftOut++;
            reason = `this site exports at most ${maxItems} ${plural(maxItems, 'item', 'items')} at a time.`;
          }
          continue;
        }
        let item: IceItem | null = null;
        if ('page' in c) {
          if (!await deps.mayExportPage(ctx, c.page)) continue;
          const read = await pm?.readPage(c.page, ctx);
          if (read?.ok) item = pageItem(read.name, read.value.content, read.metadata);
        } else if (c.file.providerId === MEDIA_LIBRARY) {
          const found = await media?.getItem(c.file.id, wikiContext);
          const size = found ? (await fs.stat(found.filePath).catch(() => null))?.size : undefined;
          if (found && size !== undefined) {
            if (used + size > maxBytes) {
              leftOut++;
              reason = `the export would be larger than the ${sizeWords(maxBytes)} this site allows.`;
              continue;
            }
            item = {
              kind: EXPORT_FILE_KIND,
              name: zipFileName(found.filename || c.file.filename || c.file.name || c.file.id),
              mediaType: found.mimeType || 'application/octet-stream',
              bytes: await fs.readFile(found.filePath)
            };
          }
        } else {
          const file = await am?.readAttachmentFor(c.file.id, ctx);
          if (file) {
            item = {
              kind: EXPORT_FILE_KIND,
              name: zipFileName(text(file.metadata.name) || c.file.filename || c.file.name || c.file.id),
              mediaType: text(file.metadata.encodingFormat) || 'application/octet-stream',
              bytes: file.buffer
            };
          }
        }
        if (!item) continue;
        const size = (item.bytes?.length ?? 0) + (item.text ? Buffer.byteLength(item.text) : 0);
        if (used + size > maxBytes) {
          leftOut++;
          reason = `the export would be larger than the ${sizeWords(maxBytes)} this site allows.`;
          continue;
        }
        used += size;
        items.push(item);
      }
      if (leftOut > 0) info.note(`${leftOut} matching ${plural(leftOut, 'item was', 'items were')} left out: ${reason}`);
      if (found.capped) info.note(`${LOOK_AHEAD} or more matches; only the first ${LOOK_AHEAD} were looked at.`);
      if (found.people > 0) info.note(`${found.people} ${plural(found.people, 'person was', 'people were')} left out.`);
      return items;
    }
  };
}
