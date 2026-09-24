/**
 * The encrypted user-level page catalog (#1385, epic #1382).
 *
 * `user-index.json` is wrapped with the user KEK; login decrypts it into the
 * process session bag. Global `page-index.json` never receives sealed-store
 * titles.
 *
 * What is left here is a MIGRATION path, not a live index: a store keeps its
 * own page index (#1456), its own search index (#1458) and its own trash
 * (#1459), and `adoptUserPageCatalog` moves what this file still holds into
 * them and deletes it. The sibling `user-versions.json` and `user-trash.json`
 * catalogs this module also wrote were never read by anything and went with
 * #1459.
 */

import fs from 'fs-extra';
import { writeFileAtomic } from './atomicWrite.js';
import {
  decryptJson,
  encryptJson,
  type WrappedBlob
} from './privateStoreCrypto.js';
import { privateUserIndexPath, privateUserDir } from './privateStorePath.js';

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

export async function readUserCatalog(
  pagesDirectory: string,
  username: string,
  kek: Buffer
): Promise<UserCatalog> {
  const file = privateUserIndexPath(pagesDirectory, username);
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
  catalog: UserCatalog
): Promise<void> {
  await fs.ensureDir(privateUserDir(pagesDirectory, username));
  const file: EncryptedCatalogFile = {
    version: 1,
    wrap: encryptJson(kek, catalog)
  };
  await writeFileAtomic(
    privateUserIndexPath(pagesDirectory, username),
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
  const catalog = await readUserCatalog(pagesDirectory, username, kek);
  catalog.pages[page.uuid] = page;
  await writeUserCatalog(pagesDirectory, username, kek, catalog);
  return catalog;
}
