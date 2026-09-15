/**
 * Encrypted user-level catalogs (#1385, epic #1382).
 *
 * `user-index.json`, `user-versions.json`, and `user-trash.json` are wrapped
 * with the user KEK. Login decrypts them into the process session bag.
 * Global `page-index.json` never receives sealed-store titles.
 *
 * Version and trash *blobs* stay in `private/{user}/{store}/`. This module is
 * the catalog only. Not a RecordManager — PageManager and AttachmentManager
 * call these helpers.
 */

import fs from 'fs-extra';
import { writeFileAtomic } from './atomicWrite.js';
import {
  decryptJson,
  encryptJson,
  type WrappedBlob
} from './privateStoreCrypto.js';
import { privateUserCatalogPath, privateUserDir, type UserCatalogKind } from './privateStorePath.js';

export interface UserCatalogPage {
  title: string;
  uuid: string;
  slug?: string;
  filename?: string;
  currentVersion: number;
  location: 'private';
  creator: string;
  store: string;
  lastModified: string;
  created?: string;
  editor: string;
  author?: string;
  hasVersions: boolean;
  audienceRoles?: string[];
  isPrivate: true;
  addon?: string;
  deletedAt?: string;
  deletedBy?: string;
  deletedFrom?: string;
}

export interface UserCatalog {
  version: 1;
  pages: Record<string, UserCatalogPage>;
}

interface EncryptedCatalogFile {
  version: 1;
  wrap: WrappedBlob;
}

function looksLikeWrap(value: unknown): value is WrappedBlob {
  if (!value || typeof value !== 'object') return false;
  const blob = value as Record<string, unknown>;
  return typeof blob.iv === 'string' && typeof blob.tag === 'string' && typeof blob.ct === 'string';
}

export function emptyUserCatalog(): UserCatalog {
  return { version: 1, pages: {} };
}

export function mergeIndexPages<T extends { title?: string }>(
  globalPages: Record<string, T>,
  overlay: Record<string, T>
): Record<string, T> {
  return { ...globalPages, ...overlay };
}

export async function readUserCatalog(
  pagesDirectory: string,
  username: string,
  kek: Buffer,
  kind: UserCatalogKind
): Promise<UserCatalog> {
  const file = privateUserCatalogPath(pagesDirectory, username, kind);
  if (!await fs.pathExists(file)) return emptyUserCatalog();
  const raw = await fs.readJson(file) as unknown;
  if (!raw || typeof raw !== 'object') return emptyUserCatalog();
  const rec = raw as { version?: unknown; wrap?: unknown };
  if (rec.version !== 1 || !looksLikeWrap(rec.wrap)) return emptyUserCatalog();
  const payload = decryptJson<UserCatalog>(kek, rec.wrap);
  if (!payload || payload.version !== 1 || !payload.pages || typeof payload.pages !== 'object') {
    return emptyUserCatalog();
  }
  return payload;
}

export async function writeUserCatalog(
  pagesDirectory: string,
  username: string,
  kek: Buffer,
  kind: UserCatalogKind,
  catalog: UserCatalog
): Promise<void> {
  await fs.ensureDir(privateUserDir(pagesDirectory, username));
  const file: EncryptedCatalogFile = {
    version: 1,
    wrap: encryptJson(kek, catalog)
  };
  await writeFileAtomic(
    privateUserCatalogPath(pagesDirectory, username, kind),
    JSON.stringify(file, null, 2),
    'utf8'
  );
}

export async function upsertUserIndexPage(
  pagesDirectory: string,
  username: string,
  kek: Buffer,
  page: UserCatalogPage
): Promise<UserCatalog> {
  const catalog = await readUserCatalog(pagesDirectory, username, kek, 'index');
  catalog.pages[page.uuid] = page;
  await writeUserCatalog(pagesDirectory, username, kek, 'index', catalog);
  return catalog;
}

export async function upsertUserVersionsPage(
  pagesDirectory: string,
  username: string,
  kek: Buffer,
  page: UserCatalogPage
): Promise<UserCatalog> {
  const catalog = await readUserCatalog(pagesDirectory, username, kek, 'versions');
  catalog.pages[page.uuid] = page;
  await writeUserCatalog(pagesDirectory, username, kek, 'versions', catalog);
  return catalog;
}

export async function upsertUserTrashPage(
  pagesDirectory: string,
  username: string,
  kek: Buffer,
  page: UserCatalogPage
): Promise<UserCatalog> {
  const catalog = await readUserCatalog(pagesDirectory, username, kek, 'trash');
  catalog.pages[page.uuid] = page;
  await writeUserCatalog(pagesDirectory, username, kek, 'trash', catalog);
  return catalog;
}

export async function removeUserIndexPage(
  pagesDirectory: string,
  username: string,
  kek: Buffer,
  uuid: string
): Promise<UserCatalogPage | undefined> {
  const catalog = await readUserCatalog(pagesDirectory, username, kek, 'index');
  const page = catalog.pages[uuid];
  if (!page) return undefined;
  delete catalog.pages[uuid];
  await writeUserCatalog(pagesDirectory, username, kek, 'index', catalog);
  return page;
}
