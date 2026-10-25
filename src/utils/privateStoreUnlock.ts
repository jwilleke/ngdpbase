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
  newPersonKey,
  openKekCopy,
  personPublicKey,
  rewrapPassword,
  sealKekCopy,
  rewrapPasswordWithKek,
  unwrapDek,
  unwrapKekWithMnemonic,
  unwrapKekWithPassword,
  type UserKeyEnvelope
} from './privateStoreCrypto.js';
import { readStoreMeta, readVaultSealState, refuseUnsealedVault } from './privateStoreMeta.js';
import { dropPendingWords } from './privateStoreDoor.js';
import {
  PRIVATE_USER_CATALOG_FILES,
  isValidStoreId,
  privateUserDir,
  privateUserKeysPath,
  type PrivateStoreLayout
} from './privateStorePath.js';
import { emptyUserCatalog, readUserCatalog, type UserCatalog } from './privateStoreCatalogs.js';
import { isJobContext, type ActorContext } from '../context/ActorContext.js';
import type { PermissionSubject } from '../managers/UserManager.js';
import { writeFileAtomic } from './atomicWrite.js';
import { SECRET_FILE_MODE } from './secretFileMode.js';
import { mixesProxyWithDelegation, proxyCarries } from './proxyClaim.js';
import type { LinkPublicKey, Lockbox } from './shareLockbox.js';

/**
 * Someone else's keys, opened from the copy a proxy grant carries (#1762
 * slice 5): the represented person's KEK and their encrypted stores' DEKs.
 * Held inside the ACTOR's own bag, so whatever ends the actor's keys —
 * sign-out, session end, `lockPrivateStores` — ends these too.
 */
interface KeyCopy {
  grantId: string;
  owner: string;
  kek: Buffer;
  deks: Map<string, Buffer>;
}

interface UnlockedBag {
  username: string;
  kek: Buffer;
  deks: Map<string, Buffer>;
  /**
   * The legacy sealed-page catalog (#1385), read once at unlock so
   * `adoptUserPageCatalog` can move its entries into each store's own index
   * (#1456) and delete the file. The `user-versions.json` and `user-trash.json`
   * catalogs that used to sit beside it were never read and went with #1459:
   * a store's versions and trash live in the store.
   */
  userIndex: UserCatalog;
  /** The key copy opened under a proxy grant this session acts under, if any (#1762 slice 5). */
  copy?: KeyCopy;
  /** A grant whose copy did not open for this bag: not retried on every request. */
  copyRefused?: string;
}

const bags = new Map<string, UnlockedBag>();
export function unlockPrivateStores(sessionId: string, username: string, kek: Buffer): void {
  bags.set(sessionId, {
    username,
    kek: Buffer.from(kek),
    deks: new Map(),
    userIndex: emptyUserCatalog()
  });
}

export function getSessionUserIndex(sessionId: string): UserCatalog | undefined {
  return bags.get(sessionId)?.userIndex;
}

/**
 * Replace a user-keys.json (#1625): the only copy of both wraps of the KEK, so
 * atomic (a crash leaves the old file or the new one, never a truncated one),
 * owner-only and flushed to the device.
 */
async function writeUserKeyEnvelope(file: string, envelope: unknown): Promise<void> {
  await writeFileAtomic(file, JSON.stringify(envelope), 'utf8', { mode: SECRET_FILE_MODE, fsync: true });
}

function wipeCopy(bag: UnlockedBag): void {
  if (!bag.copy) return;
  bag.copy.kek.fill(0);
  for (const dek of bag.copy.deks.values()) dek.fill(0);
  bag.copy.deks.clear();
  delete bag.copy;
}

export function lockPrivateStores(sessionId: string): void {
  const bag = bags.get(sessionId);
  if (bag) {
    wipeCopy(bag);
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
  const envelope = await readUserKeyEnvelope(args.pagesDirectory, args.username);
  if (!envelope) return;
  await unlockWithKek(args, envelope, await unwrapKekWithPassword(envelope, args.password));
}

/**
 * Unlock with the 12 recovery words instead of the password (#1453).
 *
 * The words unwrap the SAME key the password does — the envelope holds it
 * twice, once per wrap — so everything after the unwrap is the password
 * path's, shared. Wrong words fail the authenticated unwrap and return
 * `false`; nothing is unlocked and nothing is written. The words are never
 * logged, stored or returned.
 */
export async function unlockPrivateStoresWithMnemonic(args: {
  handle: string;
  username: string;
  words: string;
  pagesDirectory: string;
}): Promise<boolean> {
  const envelope = await readUserKeyEnvelope(args.pagesDirectory, args.username);
  if (!envelope) return false;
  let kek: Buffer;
  try {
    kek = unwrapKekWithMnemonic(envelope, args.words);
  } catch {
    return false;
  }
  await unlockWithKek(args, envelope, kek);
  return true;
}

/** The user's key envelope, or null when they have none (or it is not one). */
async function readUserKeyEnvelope(pagesDirectory: string, username: string): Promise<UserKeyEnvelope | null> {
  const keysPath = privateUserKeysPath(pagesDirectory, username);
  if (!await fs.pathExists(keysPath)) return null;
  const raw = await fs.readJson(keysPath) as unknown;
  return isUserKeyEnvelope(raw) ? raw : null;
}

/**
 * Everything an unlock does once it holds the user's key: the key into the
 * session's bag, each encrypted store's data key, and the user's catalogue.
 * One implementation, whichever wrap the key came out of.
 */
async function unlockWithKek(args: { handle: string; username: string; pagesDirectory: string }, envelope: UserKeyEnvelope, kek: Buffer): Promise<void> {
  unlockPrivateStores(args.handle, args.username, kek);
  for (const [store, dek] of await storeDeks(args.pagesDirectory, args.username, kek)) {
    setUnlockedDek(args.handle, store, dek);
    dek.fill(0);
  }
  try {
    await ensurePersonKey(args.pagesDirectory, args.username, envelope, kek);
  } catch {
    logger.warn('[private-store] the person key pair could not be made at unlock');
  }

  const bag = bags.get(args.handle);
  if (bag) {
    try {
      bag.userIndex = await readUserCatalog(args.pagesDirectory, args.username, kek);
    } catch {
      logger.warn('[private-store] the user page catalog stayed sealed after login');
    }
  }
}

/**
 * The data key of each of `username`'s encrypted stores that `kek` opens. One
 * walk of the container, for an unlock and for a proxy's key copy alike; a
 * store that does not open stays locked and is left out.
 */
async function storeDeks(pagesDirectory: string, username: string, kek: Buffer): Promise<Map<string, Buffer>> {
  const deks = new Map<string, Buffer>();
  const userDir = privateUserDir(pagesDirectory, username);
  if (!await fs.pathExists(userDir)) return deks;
  const entries = await fs.readdir(userDir, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (PRIVATE_USER_CATALOG_FILES.has(ent.name)) continue;
    // Only store folders: a folder whose name is not a store id is not a store,
    // and must not abort the unlock of the stores that are.
    if (!isValidStoreId(ent.name)) continue;
    const meta = await readStoreMeta(pagesDirectory, username, ent.name);
    if (meta.encrypt !== true) continue;
    try {
      deks.set(ent.name, unwrapDek(kek, meta));
    } catch {
      logger.warn('[private-store] an encrypted store stayed locked');
    }
  }
  return deks;
}

/**
 * Give the person a key pair if their envelope has none (#1762 slice 5):
 * enrolment makes one (`createUserKeys`); a person enrolled before it existed
 * gets theirs the first time their store is unlocked. Only the new field is
 * added; every wrap of the KEK is written back as it was read.
 */
async function ensurePersonKey(pagesDirectory: string, username: string, envelope: UserKeyEnvelope, kek: Buffer): Promise<void> {
  if (envelope.personKey) return;
  await writeUserKeyEnvelope(privateUserKeysPath(pagesDirectory, username), { ...envelope, personKey: await newPersonKey(kek) });
}

/** Whether `username` has keys at all, i.e. a store that can be encrypted. */
export async function hasUserKeys(pagesDirectory: string, username: string): Promise<boolean> {
  return (await readUserKeyEnvelope(pagesDirectory, username)) !== null;
}

/**
 * The public half of `username`'s key pair (#1762 slice 5), or null when they
 * have no keys or no pair yet. Public: anyone may seal to it.
 */
export async function personKeyOf(pagesDirectory: string, username: string): Promise<LinkPublicKey | null> {
  const envelope = await readUserKeyEnvelope(pagesDirectory, username);
  return envelope ? personPublicKey(envelope) : null;
}

/**
 * Seal a copy of this context's OWN unlocked KEK to `recipient` (#1762 slice
 * 5): what a proxy grant made while the owner's store is open carries. Null
 * when the context holds no key — a locked store, a token, a proxy (it holds
 * no KEK of its own through `kekFor`). The KEK copy taken here is zeroed.
 */
export async function sealKekCopyFor(ctx: ActorContext, recipient: LinkPublicKey): Promise<Lockbox | null> {
  const kek = kekFor(ctx);
  if (!kek) return null;
  try {
    return await sealKekCopy(recipient, kek);
  } finally {
    kek.fill(0);
  }
}

/**
 * Open the key copy a proxy grant carries (#1762 slice 5) into the actor's
 * own bag (`handle`), when the actor's store is unlocked: their KEK unwraps
 * their private key, which opens the copy of the owner's KEK, which opens the
 * owner's encrypted stores. Replaces any copy the bag held. False — nothing
 * held — when the actor's store is locked, the bag is not the actor's, or the
 * copy does not open (it is then not retried for this bag). No key byte is
 * returned or logged.
 */
export async function openKeyCopy(args: {
  handle: string;
  actor: string;
  grantId: string;
  owner: string;
  copy: Lockbox;
  pagesDirectory: string;
}): Promise<boolean> {
  const bag = bags.get(args.handle);
  if (!bag || bag.username !== args.actor) return false;
  if (bag.copy?.grantId === args.grantId && bag.copy.owner === args.owner) return true;
  if (bag.copyRefused === args.grantId) return false;
  wipeCopy(bag);
  const envelope = await readUserKeyEnvelope(args.pagesDirectory, args.actor);
  let kek: Buffer;
  try {
    if (!envelope) throw new Error('no keys');
    kek = await openKekCopy(envelope, bag.kek, args.copy);
  } catch {
    bag.copyRefused = args.grantId;
    return false;
  }
  const deks = await storeDeks(args.pagesDirectory, args.owner, kek);
  // The bag may have been locked while the stores were read.
  if (bags.get(args.handle) !== bag) {
    kek.fill(0);
    for (const dek of deks.values()) dek.fill(0);
    return false;
  }
  delete bag.copyRefused;
  bag.copy = { grantId: args.grantId, owner: args.owner, kek, deks };
  return true;
}

/** The grant and person whose key copy this handle's bag holds, if any — ids only, no key. */
export function heldKeyCopy(handle: unknown): { grantId: string; owner: string } | undefined {
  const copy = typeof handle === 'string' ? bags.get(handle)?.copy : undefined;
  return copy ? { grantId: copy.grantId, owner: copy.owner } : undefined;
}

/** Wipe the key copy this handle's bag holds (#1762 slice 5): switching back, or to someone else. The actor's own keys stay. */
export function dropKeyCopy(handle: unknown): void {
  if (typeof handle !== 'string') return;
  const bag = bags.get(handle);
  if (!bag) return;
  wipeCopy(bag);
  delete bag.copyRefused;
}

/** Wipe every copy opened under this grant, in every session (#1762 slice 5): the grant was revoked or its account closed. */
export function dropKeyCopiesOfGrant(grantId: string): number {
  let dropped = 0;
  for (const bag of bags.values()) {
    if (bag.copy?.grantId !== grantId) continue;
    wipeCopy(bag);
    dropped++;
  }
  return dropped;
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
  const next = await rewrapPassword(raw, args.oldPassword, args.newPassword);
  await fs.ensureDir(privateUserDir(args.pagesDirectory, args.username));
  await writeUserKeyEnvelope(keysPath, next);
}

/**
 * A forgotten password, reset with the recovery words (#1452): the words
 * unwrap the KEK, and the password wrap is replaced with one made from the
 * new password. The recovery wrap and the KEK are untouched.
 *
 * Returns `false` — writing nothing — when the user has no keys or the words
 * do not open them. The words are never logged or stored.
 */
export async function resetPasswordWrapWithMnemonic(args: {
  pagesDirectory: string;
  username: string;
  words: string;
  newPassword: string;
}): Promise<boolean> {
  const envelope = await readUserKeyEnvelope(args.pagesDirectory, args.username);
  if (!envelope) return false;
  let kek: Buffer;
  try {
    kek = unwrapKekWithMnemonic(envelope, args.words);
  } catch {
    return false;
  }
  try {
    await writeUserKeyEnvelope(privateUserKeysPath(args.pagesDirectory, args.username), await rewrapPasswordWithKek(envelope, kek, args.newPassword));
  } finally {
    kek.fill(0);
  }
  return true;
}

/** A fresh handle for a session's key bag: random, never the session id. */
export function newPrivateStoreHandle(): string {
  return randomUUID();
}

/**
 * The handle a context carries to its session's key bag. Only a password
 * session's request subject has one; a `JobContext`, a bearer-token request
 * and a share visitor carry none, so they reach no keys.
 *
 * A subject acting for someone (`viaProxy`, #1762) reaches none of the bag's
 * own keys, whatever handle it carries: the session's bag is the actor's own.
 * The represented person's encrypted stores open to it only through the key
 * copy its grant carries ({@link copyFor}).
 */
function handleOf(ctx: ActorContext | undefined): string | undefined {
  // A caller that passed no context reaches no keys — a refusal, not a crash.
  const subject = ctx as Partial<PermissionSubject> | undefined;
  return subject?.viaProxy ? undefined : subject?.privateStoreHandle;
}

/**
 * The key copy a proxy subject reaches (#1762 slice 5), or none. All of it
 * must hold: a `proxy` claim (never `impersonation`) carrying `vault-proxy`
 * and no token or share; the bag at its `keyHandle` belongs to the claim's
 * actor; and the copy there was opened under this very grant for the person
 * the subject represents. Whether the grant is still in force is the
 * request's (`AuthManager.subjectActingFor` rebuilds the claim from the live
 * grant and wipes the copy when it is not).
 */
function copyFor(ctx: ActorContext | undefined): KeyCopy | undefined {
  // A job carries no key (#2047): `jobContextFromRequest` drops the handle, and
  // a job context that still names one is refused here as well.
  if (!ctx || isJobContext(ctx)) return undefined;
  const subject = ctx as Partial<PermissionSubject> | undefined;
  const claim = subject?.viaProxy;
  if (!claim?.keyHandle || !proxyCarries(claim, 'vault-proxy') || mixesProxyWithDelegation(subject)) return undefined;
  const bag = bags.get(claim.keyHandle);
  if (!bag || bag.username !== claim.actor) return undefined;
  const copy = bag.copy;
  return copy && copy.grantId === claim.grantId && copy.owner === subject?.username ? copy : undefined;
}

/**
 * The DEK for `owner`'s `store` that this context holds, if any. Only from the
 * owner's own bag — DEKs are keyed by store id, and every user has a
 * `default` — or, for someone acting for the owner, from the key copy their
 * grant carries (#1762 slice 5).
 */
export function dekFor(ctx: ActorContext | undefined, owner: string, store: string): Buffer | undefined {
  const copy = copyFor(ctx);
  if (copy) {
    const dek = copy.owner === owner ? copy.deks.get(store) : undefined;
    return dek ? Buffer.from(dek) : undefined;
  }
  const handle = handleOf(ctx);
  if (!handle || bags.get(handle)?.username !== owner) return undefined;
  return getUnlockedDek(handle, store);
}

/**
 * The ids of the requester's OWN stores whose DEK its session holds (#1400) —
 * the encrypted stores it can open right now. Another user's, or a locked
 * store, is never listed; acting for someone, the represented person's stores
 * the grant's key copy opened (#1762 slice 5). Ids only: no key bytes leave
 * the bag.
 */
export function unlockedStoreIdsFor(ctx: ActorContext): string[] {
  const copy = copyFor(ctx);
  if (copy) return [...copy.deks.keys()];
  const handle = handleOf(ctx);
  const bag = handle ? bags.get(handle) : undefined;
  if (!bag || bag.username !== ctx.username) return [];
  return [...bag.deks.keys()];
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
  layout: PrivateStoreLayout;
}): Promise<void> {
  // #1834: a sealed kind's vault that is not sealed itself is refused, never
  // written in the clear; the kind is the layout's `sealedVaults`.
  const { state, meta } = await readVaultSealState(args.pagesDirectory, args.owner, args.store, args.layout);
  refuseUnsealedVault(args.owner, args.store, state);
  assertEncryptedStoreWritable({
    encrypt: meta.encrypt,
    dek: meta.encrypt ? dekFor(ctx, args.owner, args.store) : undefined
  });
}

/**
 * Whether this context's session holds an unlocked user key (#1448).
 *
 * A yes/no, deliberately. {@link kekFor} hands back a COPY of the key bytes,
 * which is right for a caller that is about to use them and wrong for one that
 * only needs to know they exist — every page render asks this, and none of
 * them should be copying key material into a buffer it then has to remember
 * to zero.
 */
export function hasUnlockedKey(ctx: ActorContext | undefined): boolean {
  const handle = handleOf(ctx);
  return !!handle && bags.get(handle)?.kek !== undefined;
}

/** The user KEK this context's session holds, if any. */
export function kekFor(ctx: ActorContext | undefined): Buffer | undefined {
  const handle = handleOf(ctx);
  return handle ? getUnlockedKek(handle) : undefined;
}

/**
 * The one door for a session ending (#1626): whatever ends it — logout, idle
 * timeout, a password change, an admin revoke, a new sign-in on the same
 * browser — calls this with the session's private-store handle before the
 * session is gone, so its keys are zeroed and dropped and no recovery words
 * stay pending. Takes the raw session value, so a caller never re-implements
 * the "is there a handle" check.
 */
export function endSessionKeys(handle: unknown): void {
  if (typeof handle !== 'string' || !handle) return;
  lockPrivateStores(handle);
  dropPendingWords(handle);
}

/**
 * Drop every unlocked bag whose handle no live session holds (#1626): a
 * session that expired in the store, or one destroyed by a path that could
 * not reach endSessionKeys, leaves its keys with no owner. Returns how many
 * bags were dropped.
 */
export function sweepOrphanedKeys(liveHandles: ReadonlySet<string>): number {
  let dropped = 0;
  for (const handle of [...bags.keys()]) {
    if (liveHandles.has(handle)) continue;
    endSessionKeys(handle);
    dropped++;
  }
  return dropped;
}

/** Test teardown only. */
export function clearUnlockedPrivateStores(): void {
  for (const id of [...bags.keys()]) lockPrivateStores(id);
}
