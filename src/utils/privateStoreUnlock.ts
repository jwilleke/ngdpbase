/**
 * Process-level unlock bag for private-store keys (#1384, #1391).
 *
 * Keyed by session id so every PageManager/provider in the process sees the
 * same unlock. Not express-session JSON. Not fields on PageManager.
 * Logout calls {@link lockPrivateStores}.
 *
 * Any manager or provider calls these helpers. There is no RecordManager.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'fs-extra';
import logger from './logger.js';
import {
  assertEncryptedStoreWritable,
  rewrapPassword,
  unwrapDek,
  unwrapKekWithPassword,
  type EncryptedStoreRecord,
  type UserKeyEnvelope
} from './privateStoreCrypto.js';
import { readStoreMeta } from './privateStoreMeta.js';
import {
  PRIVATE_USER_CATALOG_FILES,
  privateUserDir,
  privateUserKeysPath,
  type PrivateStoreLayoutOverrides,
  type UserCatalogKind
} from './privateStorePath.js';
import {
  emptyUserCatalog,
  readUserCatalog,
  type UserCatalog,
  type UserCatalogPage
} from './privateStoreCatalogs.js';

interface UnlockedBag {
  username: string;
  kek: Buffer;
  deks: Map<string, Buffer>;
  catalogs: {
    index: UserCatalog;
    versions: UserCatalog;
    trash: UserCatalog;
  };
}

function emptySessionCatalogs(): UnlockedBag['catalogs'] {
  return {
    index: emptyUserCatalog(),
    versions: emptyUserCatalog(),
    trash: emptyUserCatalog()
  };
}

const bags = new Map<string, UnlockedBag>();
const sessionAls = new AsyncLocalStorage<string>();

export function runWithPrivateStoreSession<T>(sessionId: string, fn: () => T): T {
  return sessionAls.run(sessionId, fn);
}

export function currentPrivateStoreSessionId(): string | undefined {
  return sessionAls.getStore();
}

export function unlockPrivateStores(sessionId: string, username: string, kek: Buffer): void {
  bags.set(sessionId, {
    username,
    kek: Buffer.from(kek),
    deks: new Map(),
    catalogs: emptySessionCatalogs()
  });
}

export function getSessionUserIndex(sessionId: string): UserCatalog | undefined {
  return bags.get(sessionId)?.catalogs.index;
}

export function replaceSessionUserCatalog(
  sessionId: string,
  kind: UserCatalogKind,
  catalog: UserCatalog
): void {
  const bag = bags.get(sessionId);
  if (!bag) return;
  bag.catalogs[kind] = catalog;
}

export function putSessionUserIndexPage(page: UserCatalogPage): void {
  const sid = currentPrivateStoreSessionId();
  if (!sid) return;
  const bag = bags.get(sid);
  if (!bag) return;
  bag.catalogs.index.pages[page.uuid] = page;
}

export function lockPrivateStores(sessionId: string): void {
  const bag = bags.get(sessionId);
  if (bag) {
    bag.kek.fill(0);
    for (const dek of bag.deks.values()) dek.fill(0);
    bag.deks.clear();
    bags.delete(sessionId);
  }
}

export function getUnlockedKek(sessionId: string): Buffer | undefined {
  const kek = bags.get(sessionId)?.kek;
  return kek ? Buffer.from(kek) : undefined;
}

export function setUnlockedDek(sessionId: string, storeId: string, dek: Buffer): void {
  const bag = bags.get(sessionId);
  if (!bag) throw new Error('private stores are locked for this session');
  bag.deks.set(storeId, Buffer.from(dek));
}

export function getUnlockedDek(sessionId: string, storeId: string): Buffer | undefined {
  const dek = bags.get(sessionId)?.deks.get(storeId);
  return dek ? Buffer.from(dek) : undefined;
}

/** DEK from the process bag for this request's session (or an explicit id). */
export function sessionDekForStore(storeId: string, sessionId?: string): Buffer | undefined {
  const sid = sessionId ?? currentPrivateStoreSessionId();
  if (!sid) return undefined;
  return getUnlockedDek(sid, storeId);
}

function isUserKeyEnvelope(value: unknown): value is UserKeyEnvelope {
  if (!value || typeof value !== 'object') return false;
  const rec = value as Record<string, unknown>;
  return rec.version === 1 && rec.passwordWrap !== undefined && rec.kdf !== undefined;
}

/**
 * After password login: unwrap the user KEK into the bag and load store DEKs.
 * No-ops when the user has no envelope yet. Never writes key bytes to session JSON.
 */
export async function unlockPrivateStoresWithPassword(args: {
  sessionId: string;
  username: string;
  password: string;
  pagesDirectory: string;
}): Promise<void> {
  const keysPath = privateUserKeysPath(args.pagesDirectory, args.username);
  if (!await fs.pathExists(keysPath)) return;
  const raw = await fs.readJson(keysPath) as unknown;
  if (!isUserKeyEnvelope(raw)) return;
  const kek = unwrapKekWithPassword(raw, args.password);
  unlockPrivateStores(args.sessionId, args.username, kek);

  const userDir = privateUserDir(args.pagesDirectory, args.username);
  const entries = await fs.readdir(userDir, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (PRIVATE_USER_CATALOG_FILES.has(ent.name)) continue;
    const meta = await readStoreMeta(args.pagesDirectory, args.username, ent.name);
    if (meta.encrypt !== true) continue;
    try {
      setUnlockedDek(args.sessionId, ent.name, unwrapDek(kek, meta as EncryptedStoreRecord));
    } catch {
      logger.warn('[private-store] encrypted store stayed locked after login');
    }
  }

  const bag = bags.get(args.sessionId);
  if (bag) {
    try {
      bag.catalogs.index = await readUserCatalog(args.pagesDirectory, args.username, kek, 'index');
      bag.catalogs.versions = await readUserCatalog(args.pagesDirectory, args.username, kek, 'versions');
      bag.catalogs.trash = await readUserCatalog(args.pagesDirectory, args.username, kek, 'trash');
    } catch {
      logger.warn('[private-store] user catalogs stayed sealed after login');
    }
  }
}

/**
 * Password change: re-wrap the user envelope. Recovery wrap is unchanged.
 * No-ops when there is no envelope yet. Not a manager — any caller can use this.
 */
export async function rewrapUserKeysOnPasswordChange(args: {
  pagesDirectory: string;
  username: string;
  oldPassword: string;
  newPassword: string;
}): Promise<void> {
  const keysPath = privateUserKeysPath(args.pagesDirectory, args.username);
  if (!await fs.pathExists(keysPath)) return;
  const raw = await fs.readJson(keysPath) as unknown;
  if (!isUserKeyEnvelope(raw)) return;
  const next = rewrapPassword(raw, args.oldPassword, args.newPassword);
  await fs.ensureDir(privateUserDir(args.pagesDirectory, args.username));
  await fs.writeJson(keysPath, next);
}

/**
 * Encrypt-on write gate for a store. Providers call this; not a PageManager field.
 */
export async function assertCurrentSessionCanWriteStore(args: {
  pagesDirectory: string;
  creator: string;
  store: string;
  sessionId?: string;
  layout?: PrivateStoreLayoutOverrides;
}): Promise<void> {
  const meta = await readStoreMeta(args.pagesDirectory, args.creator, args.store, args.layout);
  assertEncryptedStoreWritable({
    encrypt: meta.encrypt,
    dek: sessionDekForStore(args.store, args.sessionId)
  });
}

/** Test teardown only. */
export function clearUnlockedPrivateStores(): void {
  for (const id of [...bags.keys()]) lockPrivateStores(id);
}
