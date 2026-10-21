/**
 * Where a page's footnotes and comments are kept, and through which I/O (#1839).
 *
 * A public page's are in the managers' own folders (`ngdpbase.footnotes.storagedir`,
 * `ngdpbase.comments.storagedir`), as before. A vault page's — a page named
 * `vaults/{owner}/{store}/{title}` — are inside that vault
 * (`{store}/footnotes/{uuid}.json`, `{store}/comments/{uuid}/`), read and
 * written through the vault's store I/O: sealed exactly when its pages are,
 * refused when the vault is locked or is a sealed kind's vault that hasn't been
 * opened. Nothing of a vault page is kept outside the vault (operator, 2026-10-16).
 *
 * The place is decided by the page's NAME, never by a uuid alone: a vault page
 * is in no shared index, so its uuid says nothing about where it is. Who may
 * read or write a page's notes is the caller's to decide (the page's own read
 * and edit doors); nothing here decides access.
 */

import fs from 'fs-extra';
import path from 'path';
import type { ActorContext } from '../context/ActorContext.js';
import { PLAIN_FILE_IO, moveStoreFile, moveStoreFolder, storeFileIO, type StoreFileIO } from './privateStoreFiles.js';
import {
  assertPathSegment,
  isSafePathSegment,
  isValidStoreId,
  parsePrivatePageName,
  privateStoreLayoutFromConfig,
  privateStoreNotesDir,
  privateStoreRoot,
  privateUserDir,
  type PrivateStoreLayout
} from './privateStorePath.js';
import { listPrivateOwners } from './privateStoreTakeout.js';
import logger from './logger.js';

export type PageNotesKind = 'footnotes' | 'comments';

/** The page a footnote or comment belongs to: its name says where it is, its uuid which file. */
export interface PageRef {
  /** The page's name: a public title, or its vault name `vaults/{owner}/{store}/{title}`. */
  name: string;
  uuid: string;
}

/** Where one kind of note lives: the manager's public folder, and the vaults. */
export interface PageNotesRoots {
  kind: PageNotesKind;
  /** The manager's own folder, for public pages. */
  publicDir: string;
  pagesDirectory: string;
  layout: PrivateStoreLayout;
}

export interface PageNotesPath {
  /** Footnotes: the page's `{uuid}.json`. Comments: the page's `{uuid}/` folder. */
  path: string;
  /** The vault the page is in; null for a public page. */
  vault: { owner: string; store: string } | null;
}

interface ConfigLike {
  getProperty(key: string, defaultValue: unknown): unknown;
  getResolvedDataPath(key: string, defaultValue: string): string;
}

interface EngineLike {
  getManager<T = unknown>(name: string): T | undefined | null;
}

/**
 * The roots for `kind`: the manager's own folder, and the vaults where the
 * page provider keeps them (its `storagedir` and the configured layout), read
 * when asked rather than kept.
 */
export function pageNotesRoots(engine: EngineLike, kind: PageNotesKind, publicDir: string): PageNotesRoots {
  const config = engine.getManager<ConfigLike>('ConfigurationManager');
  return {
    kind,
    publicDir,
    pagesDirectory: config?.getResolvedDataPath('ngdpbase.page.provider.filesystem.storagedir', './data/pages') ?? './data/pages',
    layout: privateStoreLayoutFromConfig((key, fallback) => config ? config.getProperty(key, fallback) : fallback)
  };
}

/** Where `page`'s notes of this kind are on disk. Pure: no I/O, no key. */
export function pageNotesPath(page: PageRef, roots: PageNotesRoots): PageNotesPath {
  const vault = parsePrivatePageName(page.name);
  return notesPathIn(vault ? { owner: vault.owner, store: vault.store } : null, page.uuid, roots);
}

/** The notes of page `uuid` in `vault` (null: the public folder). The vault decides the place, never the title. */
function notesPathIn(vault: { owner: string; store: string } | null, pageUuid: string, roots: PageNotesRoots): PageNotesPath {
  const uuid = assertPathSegment(pageUuid, 'page id');
  const dir = vault
    ? privateStoreNotesDir(roots.pagesDirectory, vault.owner, vault.store, roots.kind, roots.layout)
    : roots.publicDir;
  return { path: path.join(dir, roots.kind === 'footnotes' ? `${uuid}.json` : uuid), vault };
}

async function ioFor(ctx: ActorContext, place: PageNotesPath, roots: PageNotesRoots): Promise<StoreFileIO> {
  if (!place.vault) return PLAIN_FILE_IO;
  return storeFileIO(ctx, {
    pagesDirectory: roots.pagesDirectory,
    owner: place.vault.owner,
    store: place.vault.store,
    layout: roots.layout
  });
}

/**
 * Where `page`'s notes are and the I/O to use there, as `ctx` may. A vault
 * that refuses `ctx` (locked, or a sealed kind's vault not yet opened) throws,
 * for a read as for a write: a vault page's notes are never read or written
 * in the clear.
 */
export async function pageNotesPlace(
  ctx: ActorContext,
  page: PageRef,
  roots: PageNotesRoots
): Promise<PageNotesPath & { io: StoreFileIO }> {
  const place = pageNotesPath(page, roots);
  return { ...place, io: await ioFor(ctx, place, roots) };
}

/**
 * Whether `kind` is on for a page (#1951, docs/system-category.md): THE rule,
 * said once. The page's own frontmatter (`comments:` / `footnotes:`) wins;
 * without it, its system-category entry's field of the same name decides;
 * unset is on. Only a boolean counts, and only `false` turns it off.
 *
 * Pure. {@link pageNotesAllowed} gathers the page's metadata and entry for it.
 */
export function pageNotesOn(
  kind: PageNotesKind,
  pageMetadata: Record<string, unknown> | null | undefined,
  categoryEntry: Record<string, unknown> | null | undefined
): boolean {
  const own = pageMetadata?.[kind];
  if (typeof own === 'boolean') return own;
  return categoryEntry?.[kind] !== false;
}

interface PageMetadataReader {
  getPageMetadata(identifier: string, ctx: ActorContext): Promise<Record<string, unknown> | null>;
}

interface CategoryReader {
  getCategoryConfig(label: string): Record<string, unknown> | null;
  getDefaultSystemCategory(): string;
}

/**
 * {@link pageNotesOn} for `page`, as `ctx` reads it (#1951): its metadata
 * (`metadata` when the caller already holds it, else the stored page's) and
 * its system-category entry, the default system-category's when the page
 * names none. A page not stored yet has no metadata, so its system-category
 * decides. The managers' `isAllowedOn` doors are this; nothing else calls it.
 */
export async function pageNotesAllowed(
  engine: EngineLike,
  kind: PageNotesKind,
  page: PageRef,
  ctx: ActorContext,
  metadata?: Record<string, unknown> | null
): Promise<boolean> {
  const meta = metadata ?? await engine.getManager<PageMetadataReader>('PageManager')?.getPageMetadata?.(page.name, ctx) ?? null;
  const categories = engine.getManager<CategoryReader>('ValidationManager');
  const declared = meta?.['system-category'];
  const label = typeof declared === 'string' && declared ? declared : categories?.getDefaultSystemCategory?.();
  const entry = label ? categories?.getCategoryConfig?.(label) ?? null : null;
  return pageNotesOn(kind, meta, entry);
}

/** A footnote or comment write refused because that kind is turned off for the page (#1951). Routes answer it with 403. */
export class PageNotesTurnedOffError extends Error {
  readonly kind: PageNotesKind;
  constructor(kind: PageNotesKind) {
    super(kind === 'comments' ? 'Comments are turned off for this page.' : 'Footnotes are turned off for this page.');
    this.name = 'PageNotesTurnedOffError';
    this.kind = kind;
  }
}

/**
 * Move a page's notes when the page changes place — into a vault, out of one,
 * or between two — through both sides' I/O, as its history moves: sealed going
 * into a sealed vault, opened coming out, never copied in the clear into a
 * sealed one. A rename within one place moves nothing (the files are keyed by
 * uuid). Both I/Os are resolved before anything moves.
 *
 * @returns true when something was moved
 */
export async function movePageNotes(
  ctx: ActorContext,
  uuid: string,
  fromName: string,
  toName: string,
  roots: PageNotesRoots
): Promise<boolean> {
  const from = pageNotesPath({ name: fromName, uuid }, roots);
  const to = pageNotesPath({ name: toName, uuid }, roots);
  if (from.path === to.path || !await fs.pathExists(from.path)) return false;
  const [fromIO, toIO] = await Promise.all([ioFor(ctx, from, roots), ioFor(ctx, to, roots)]);
  if (roots.kind === 'footnotes') await moveStoreFile(from.path, to.path, fromIO, toIO);
  else await moveStoreFolder(from.path, to.path, fromIO, toIO);
  return true;
}

/**
 * Move a vault page's notes left in the public folder before #1839 into its
 * vault (the #1842 repair), through the vault's I/O: sealed when the vault is.
 * Where the vault has none of this kind yet, this is the move
 * {@link movePageNotes} makes. Where it already has some (written since
 * #1839), the two are merged and the vault's own entries win; a comment file
 * the vault already holds is never overwritten. The vault side is written
 * before the public copy is removed, so a failure leaves two copies, never none.
 *
 * The vault's I/O is resolved first, so a locked vault, or a sealed kind's
 * vault not yet opened, throws and nothing moves. Who may ask is the caller's
 * to decide, and so is that `uuid` is a page of that vault.
 *
 * @param opts.dryRun - Count what would move, and move nothing
 * @returns how many notes were (or would be) moved: footnotes, or comment files
 */
export async function moveOutsideNotesIntoVault(
  ctx: ActorContext,
  vault: { owner: string; store: string },
  uuid: string,
  roots: PageNotesRoots,
  opts: { dryRun?: boolean } = {}
): Promise<number> {
  const from = notesPathIn(null, uuid, roots);
  const to = notesPathIn(vault, uuid, roots);
  if (!await fs.pathExists(from.path)) return 0;
  const toIO = await ioFor(ctx, to, roots);
  const footnotes = roots.kind === 'footnotes';
  const outsideFiles = footnotes ? [] : await filesIn(from.path);
  let outsideMap: Record<string, unknown> = {};
  if (footnotes) {
    try {
      outsideMap = JSON.parse(await PLAIN_FILE_IO.readText(from.path)) as Record<string, unknown>;
    } catch {
      outsideMap = {};
    }
  }
  const count = footnotes ? Object.keys(outsideMap).length : outsideFiles.length;
  if (opts.dryRun) return count;

  if (!await fs.pathExists(to.path)) {
    if (footnotes) await moveStoreFile(from.path, to.path, PLAIN_FILE_IO, toIO);
    else await moveStoreFolder(from.path, to.path, PLAIN_FILE_IO, toIO);
    return count;
  }
  if (footnotes) {
    const inside = JSON.parse(await toIO.readText(to.path)) as Record<string, unknown>;
    await toIO.writeText(to.path, JSON.stringify({ ...outsideMap, ...inside }, null, 2));
  } else {
    for (const source of outsideFiles) {
      const target = path.join(to.path, path.relative(from.path, source));
      if (await fs.pathExists(target)) continue;
      await fs.ensureDir(path.dirname(target));
      await toIO.writeBytes(target, await PLAIN_FILE_IO.readBytes(source));
    }
  }
  await fs.remove(from.path);
  return count;
}

/** Every regular file under `dir`, recursively. */
async function filesIn(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const ent of await fs.readdir(dir, { recursive: true, withFileTypes: true })) {
    if (ent.isFile()) out.push(path.join(ent.parentPath, ent.name));
  }
  return out;
}

/** A vault page whose notes of one kind are outside its vault (#1839). */
export interface VaultPageNotesOutside {
  owner: string;
  vault: string;
  /** The page, by uuid: a vault page's title is its owner's and is not logged. */
  uuid: string;
}

const PAGE_FILE = /^(.+)\.md$/;

/** The uuids of a vault's pages, live and in its trash, from their file names: no key needed. */
async function vaultPageUuids(root: string, layout: PrivateStoreLayout): Promise<string[]> {
  const uuids: string[] = [];
  for (const dir of [root, path.join(root, layout.deletedDir)]) {
    let names: string[];
    try {
      names = (await fs.readdir(dir, { withFileTypes: true })).filter((d) => d.isFile()).map((d) => d.name);
    } catch {
      continue;
    }
    for (const name of names) {
      const m = PAGE_FILE.exec(name);
      if (m) uuids.push(m[1]);
    }
  }
  return uuids;
}

/**
 * Every vault page whose notes of `roots.kind` are in the manager's public
 * folder rather than in its vault (#1839): written before notes moved into
 * vaults, in the clear. A page is known by its file name (`{uuid}.md`), so the
 * check needs no key and reads no page. Read only: nothing is moved, sealed or
 * deleted; an administrator decides what to do with the files.
 */
export async function findVaultPageNotesOutside(roots: PageNotesRoots): Promise<VaultPageNotesOutside[]> {
  const found: VaultPageNotesOutside[] = [];
  if (!await fs.pathExists(roots.publicDir)) return found;
  for (const owner of await listPrivateOwners(roots.pagesDirectory, roots.layout)) {
    let vaults: string[];
    try {
      vaults = (await fs.readdir(privateUserDir(roots.pagesDirectory, owner, roots.layout), { withFileTypes: true }))
        .filter((d) => d.isDirectory() && isValidStoreId(d.name))
        .map((d) => d.name);
    } catch {
      continue;
    }
    for (const vault of vaults) {
      const root = privateStoreRoot(roots.pagesDirectory, owner, vault, roots.layout);
      for (const uuid of await vaultPageUuids(root, roots.layout)) {
        let outside: string;
        try {
          // The public place for this uuid: the same rule a public page's notes are written by.
          outside = pageNotesPath({ name: uuid, uuid }, roots).path;
        } catch {
          continue;
        }
        if (await fs.pathExists(outside)) found.push({ owner, vault, uuid });
      }
    }
  }
  return found;
}

/** Whether `uuid` is a page of `owner`'s vault `store`, live or in its trash: known by its file name, no key needed. */
export async function isVaultPageUuid(
  pagesDirectory: string,
  layout: PrivateStoreLayout,
  vault: { owner: string; store: string },
  uuid: string
): Promise<boolean> {
  if (!isValidStoreId(vault.store) || !isSafePathSegment(vault.owner) || !isSafePathSegment(uuid)) return false;
  const root = privateStoreRoot(pagesDirectory, vault.owner, vault.store, layout);
  return (await vaultPageUuids(root, layout)).includes(uuid);
}

/** The manager state a startup check sets and clears: the manager's own (BaseManager). */
export interface CheckStateHooks {
  /** True when this is a new state. The pages work; an admin moves the notes in, so it needs attention, not down (#1946). */
  markNeedsAttention(reason: string): boolean;
  /** Clears the degraded state only while it is still `reason`, so another fault stays reported. */
  markReadyIfDegradedBy(reason: string): boolean;
}

/**
 * The check for {@link findVaultPageNotesOutside}, made the way the
 * unsealed-vault check reports (#1834, #1836): an error in the log naming each
 * owner, vault and page uuid, the manager's degraded state (the subsystem
 * banner) and, at startup, a system notification. Nothing is moved or
 * deleted. A failing check is logged, never thrown: it must not stop the
 * manager starting.
 *
 * Run again after a repair (#1842), it keeps what it found for the repair
 * actions to offer, and clears the degraded state it set once nothing is left.
 */
export class VaultPageNotesCheck {
  private found: VaultPageNotesOutside[] = [];
  private reason: string | null = null;

  constructor(
    private readonly engine: EngineLike,
    private readonly roots: () => PageNotesRoots,
    private readonly state: CheckStateHooks
  ) {}

  /** What the last run found. */
  findings(): VaultPageNotesOutside[] {
    return [...this.found];
  }

  /**
   * @param opts.notify - Send the system notification on a new state: at startup; a re-run after a repair does not
   */
  async run(opts: { notify: boolean }): Promise<VaultPageNotesOutside[]> {
    const roots = this.roots();
    try {
      this.found = await findVaultPageNotesOutside(roots);
    } catch (err) {
      logger.error(`📄 The check for vault pages' ${roots.kind} outside their vault could not run (#1839):`, err);
      return this.findings();
    }
    if (this.found.length === 0) {
      if (this.reason !== null) this.state.markReadyIfDegradedBy(this.reason);
      this.reason = null;
      return [];
    }
    const detail = this.found.map((f) => `${f.owner}/${f.vault} page ${f.uuid}`).join(', ');
    const reason = `${this.found.length} vault page(s) have ${roots.kind} stored outside their vault, unencrypted, in ${roots.publicDir}: ${detail}. ` +
      'They are not shown on the page and were left as they are; "Move into vault" on the admin dashboard, or on the owner\'s profile for a sealed vault, moves them in (#1839, #1842)';
    logger.error(`📄 ${reason}`);
    this.reason = reason;
    if (this.state.markNeedsAttention(reason) && opts.notify) {
      try {
        await this.engine.getManager<{ addNotification(n: { type: 'system'; level: 'error'; title: string; message: string }): Promise<string> }>('NotificationManager')
          ?.addNotification({ type: 'system', level: 'error', title: `Vault pages have ${roots.kind} outside their vault`, message: `${reason}.` });
      } catch (err) {
        logger.error(`📄 The notification for vault pages' ${roots.kind} outside their vault could not be sent (#1839):`, err);
      }
    }
    return this.findings();
  }
}
