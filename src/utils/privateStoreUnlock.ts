/**
 * Process-level unlock bag for private-store keys (#1384, #1391).
 *
 * Keyed by an opaque random handle — never the session id — created at
 * password login ({@link newPrivateStoreHandle}), stored on the session as
 * `privateStoreHandle`, and carried on the request subject so a caller reaches
 * its keys through the context it was given ({@link dekFor}; security-posture
 * P1). Key bytes never go into express-session JSON, a context, or a record.
 * Logout calls {@link lockPrivateStores}.
 *
 * There is no ambient slot: `AsyncLocalStorage` is refused by P1 because the
 * call site does not show what identity it runs under. Every caller reaches
 * its keys through the context it was handed.
 */

import { randomUUID } from 'node:crypto';
import fs from 'fs-extra';
import logger from './logger.js';
import {
  assertEncryptedStoreWritable,
  rewrapPassword,
  unwrapDek,
  unwrapKekWithPassword,
  type UserKeyEnvelope
} from './privateStoreCrypto.js';
import { readStoreMeta } from './privateStoreMeta.js';
import {
  PRIVATE_USER_CATALOG_FILES,
  isValidStoreId,
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
import type { ActorContext } from '../context/ActorContext.js';
import type { PermissionSubject } from '../managers/UserManager.js';

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
export function sessionDekForStore(storeId: string, handle: string): Buffer | undefined {
  return getUnlockedDek(handle, storeId);
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
  /** The session's private-store handle ({@link newPrivateStoreHandle}), not its session id. */
  handle: string;
  username: string;
  password: string;
  pagesDirectory: string;
}): Promise<void> {
  const keysPath = privateUserKeysPath(args.pagesDirectory, args.username);
  if (!await fs.pathExists(keysPath)) return;
  const raw = await fs.readJson(keysPath) as unknown;
  if (!isUserKeyEnvelope(raw)) return;
  const kek = unwrapKekWithPassword(raw, args.password);
  unlockPrivateStores(args.handle, args.username, kek);

  const userDir = privateUserDir(args.pagesDirectory, args.username);
  const entries = await fs.readdir(userDir, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (PRIVATE_USER_CATALOG_FILES.has(ent.name)) continue;
    // Only store folders: a folder whose name is not a store id is not a store,
    // and must not abort the unlock of the stores that are.
    if (!isValidStoreId(ent.name)) continue;
    const meta = await readStoreMeta(args.pagesDirectory, args.username, ent.name);
    if (meta.encrypt !== true) continue;
    try {
      setUnlockedDek(args.handle, ent.name, unwrapDek(kek, meta));
    } catch {
      logger.warn('[private-store] encrypted store stayed locked after login');
    }
  }

  const bag = bags.get(args.handle);
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

/** A fresh handle for a session's key bag: random, never the session id. */
export function newPrivateStoreHandle(): string {
  return randomUUID();
}

/**
 * The handle a context carries to its session's key bag. Only a password
 * session's request subject has one; a `JobContext`, a bearer-token request
 * and a share visitor carry none, so they reach no keys.
 */
function handleOf(ctx: ActorContext | undefined): string | undefined {
  // A caller that passed no context reaches no keys — a refusal, not a crash.
  return (ctx as Partial<PermissionSubject> | undefined)?.privateStoreHandle;
}

/**
 * The DEK for `owner`'s `store` that this context holds, if any. Only from the
 * owner's own bag: DEKs are keyed by store id, and every user has a `default`.
 */
export function dekFor(ctx: ActorContext | undefined, owner: string, store: string): Buffer | undefined {
  const handle = handleOf(ctx);
  if (!handle || bags.get(handle)?.username !== owner) return undefined;
  return getUnlockedDek(handle, store);
}

/** The unlocked sealed-store page catalog this context's session holds, if any (#1385). */
export function userIndexFor(ctx: ActorContext | undefined): UserCatalog | undefined {
  const handle = handleOf(ctx);
  return handle ? getSessionUserIndex(handle) : undefined;
}

/**
 * Refuse a write into an encrypted store unless this context holds its DEK
 * (#1394). The context-carrying form of {@link assertCurrentSessionCanWriteStore}.
 */
export async function assertContextCanWriteStore(ctx: ActorContext, args: {
  pagesDirectory: string;
  owner: string;
  store: string;
  layout?: PrivateStoreLayoutOverrides;
}): Promise<void> {
  const meta = await readStoreMeta(args.pagesDirectory, args.owner, args.store, args.layout);
  assertEncryptedStoreWritable({
    encrypt: meta.encrypt,
    dek: meta.encrypt ? dekFor(ctx, args.owner, args.store) : undefined
  });
}

/** The user KEK this context's session holds, if any. */
export function kekFor(ctx: ActorContext | undefined): Buffer | undefined {
  const handle = handleOf(ctx);
  return handle ? getUnlockedKek(handle) : undefined;
}

/** Replace one user catalog in this context's session bag. */
export function replaceUserCatalogFor(ctx: ActorContext | undefined, kind: UserCatalogKind, catalog: UserCatalog): void {
  const handle = handleOf(ctx);
  if (handle) replaceSessionUserCatalog(handle, kind, catalog);
}

/** Put one page into this context's session page catalog. */
export function putUserIndexPageFor(ctx: ActorContext | undefined, page: UserCatalogPage): void {
  const handle = handleOf(ctx);
  if (!handle) return;
  const bag = bags.get(handle);
  if (bag) bag.catalogs.index.pages[page.uuid] = page;
}

/** Test teardown only. */
export function clearUnlockedPrivateStores(): void {
  for (const id of [...bags.keys()]) lockPrivateStores(id);
}
