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
  const uuid = assertPathSegment(page.uuid, 'page id');
  const vault = parsePrivatePageName(page.name);
  const dir = vault
    ? privateStoreNotesDir(roots.pagesDirectory, vault.owner, vault.store, roots.kind, roots.layout)
    : roots.publicDir;
  return {
    path: path.join(dir, roots.kind === 'footnotes' ? `${uuid}.json` : uuid),
    vault: vault ? { owner: vault.owner, store: vault.store } : null
  };
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

/**
 * The startup report for {@link findVaultPageNotesOutside}, made the way the
 * unsealed-vault check reports (#1834, #1836): an error in the log naming each
 * owner, vault and page uuid, the manager's degraded state (the subsystem
 * banner) and a system notification. Nothing is moved or deleted. A failing
 * check is logged, never thrown: it must not stop the manager starting.
 *
 * @param markDegraded - The manager's own; true when this is a new state
 */
export async function reportVaultPageNotesOutside(
  engine: EngineLike,
  roots: PageNotesRoots,
  markDegraded: (reason: string) => boolean
): Promise<void> {
  try {
    const found = await findVaultPageNotesOutside(roots);
    if (found.length === 0) return;
    const detail = found.map((f) => `${f.owner}/${f.vault} page ${f.uuid}`).join(', ');
    const reason = `${found.length} vault page(s) have ${roots.kind} stored outside their vault, unencrypted, in ${roots.publicDir}: ${detail}. ` +
      'They are not shown on the page and were left as they are; an administrator decides what to do with them (#1839)';
    logger.error(`📄 ${reason}`);
    if (markDegraded(reason)) {
      await engine.getManager<{ addNotification(n: { type: 'system'; level: 'error'; title: string; message: string }): Promise<string> }>('NotificationManager')
        ?.addNotification({ type: 'system', level: 'error', title: `Vault pages have ${roots.kind} outside their vault`, message: `${reason}.` });
    }
  } catch (err) {
    logger.error(`📄 The check for vault pages' ${roots.kind} outside their vault could not run (#1839):`, err);
  }
}
