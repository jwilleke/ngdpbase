/**
 * The store door (#1414, epic #1382).
 *
 * A user's copy of a store kind is created when they first walk through its
 * door — never at login and never mid-save. Decisions in
 * docs/private-stores.md: "Recovery words: at first deliberate entry
 * into the store", "The words are confirmed before anything is committed",
 * "Core owns the door", "The door asks for the password when the user has no
 * key", "`store.json` shape".
 *
 * This module holds what the door does, not how it is shown: which kinds
 * exist, the words that are pending confirmation, and the commit. The route
 * renders; nothing here touches HTTP.
 *
 * What exists only while the words screen is open lives in a process Map keyed
 * by the session's private-store handle — never in express-session JSON, never
 * logged, never in a record. Abandon the flow and nothing was written.
 */

import fs from 'fs-extra';
import {
  createEncryptedStore,
  newRecoveryWords,
  sameMnemonic,
  unwrapDek,
  type UserKeyEnvelope
} from './privateStoreCrypto.js';
import {
  isValidStoreId,
  privateUserKeysPath,
  systemCategoryVaults,
  storeMetaPath,
  type PrivateStoreLayoutOverrides
} from './privateStorePath.js';
import type { StoreFileRecord } from './privateStoreMeta.js';
import { listPrivateOwners } from './privateStoreTakeout.js';
import { writeFileAtomic } from './atomicWrite.js';
import { SECRET_FILE_MODE } from './secretFileMode.js';

type GetProperty = (key: string, defaultValue: unknown) => unknown;

/**
 * A vault kind (#1505): a system-category entry that declares a vault
 * (`storageLocation.privatestore`). Its id is the vault id, the last folder
 * of `privatestore`; `encrypt` is the entry's own. `ngdpbase.stores.{kind}`
 * no longer defines kinds (operator, 2026-09-29).
 */
export interface StoreKind {
  id: string;
  /** Whether a copy of this kind is created sealed: the system-category's `encrypt`. */
  encrypt: boolean;
  /**
   * Who decides about this vault (operator, 2026-09-29): `admin` for the
   * site's own system-categories, or the slug of the add-on that declared it.
   * The owner's declaration stands — an add-on that declares its vault
   * `encrypt: true` (a health-record add-on, say) keeps it sealed; nobody else
   * turns that off. The system-category entry's `owner`; absent means `admin`.
   */
  owner: string;
}

/** The site itself, as the owner of its own vault kinds; no add-on may claim it. */
export const ADMIN_STORE_OWNER = 'admin';

const SYSTEM_CATEGORY_KEY = 'ngdpbase.system-category';

/**
 * The kind named `id`, or `null` when no system-category declares that vault.
 * `encrypt` is read as the boolean it is and nothing else (a string "true" is
 * not a switch).
 */
export function storeKindFromConfig(getProperty: GetProperty, id: string): StoreKind | null {
  if (!isValidStoreId(id)) return null;
  const categories = getProperty(SYSTEM_CATEGORY_KEY, null);
  const vault = systemCategoryVaults(categories).find((v) => v.vaultId === id);
  if (!vault) return null;
  const entry = (categories as Record<string, { encrypt?: unknown; owner?: unknown } | null>)[vault.key];
  const owner = typeof entry?.owner === 'string' && entry.owner ? entry.owner : ADMIN_STORE_OWNER;
  return { id, owner, encrypt: entry?.encrypt === true };
}

/** Where the addon that owns a kind stands, as the door needs to know it. */
export type StoreOwnerState = 'loaded' | 'failed' | 'disabled' | 'absent';

/**
 * Whether a kind's door is open (#1414). A kind the site owns is always open.
 * An addon's kind is open only while that addon is loaded; otherwise the kind
 * and every user's copy stay exactly as they are — nothing is removed — and
 * the door says why it is shut.
 */
export type StoreDoorState =
  | { open: true }
  | { open: false; reason: 'unavailable' | 'disabled' | 'not-installed'; message: string };

export function storeDoorState(kind: StoreKind, ownerState: StoreOwnerState | null): StoreDoorState {
  if (kind.owner === ADMIN_STORE_OWNER || ownerState === 'loaded') return { open: true };
  switch (ownerState) {
  case 'failed':
    return { open: false, reason: 'unavailable', message: 'This store is temporarily unavailable. Its data is untouched; try again later.' };
  case 'disabled':
    return { open: false, reason: 'disabled', message: 'The add-on that owns this store is turned off on this site. Its data is untouched.' };
  default:
    return { open: false, reason: 'not-installed', message: 'The add-on that owns this store is not installed on this site. Its data is untouched.' };
  }
}

/** Every vault kind, by id: the vault each system-category declares (#1505). */
export function storeKindIds(allProperties: Record<string, unknown>): string[] {
  return [...new Set(systemCategoryVaults(allProperties[SYSTEM_CATEGORY_KEY]).map((v) => v.vaultId))].sort();
}

/**
 * How many users hold a copy of a kind: whose `store.json` for it exists.
 * The copy is what the door creates, so this is "who has walked through".
 */
export async function countStoreCopies(
  pagesDirectory: string,
  kindId: string,
  layout?: PrivateStoreLayoutOverrides
): Promise<number> {
  let copies = 0;
  for (const owner of await listPrivateOwners(pagesDirectory, layout)) {
    if (await fs.pathExists(storeMetaPath(pagesDirectory, owner, kindId, layout))) copies++;
  }
  return copies;
}

/** Attempts at confirming the words: one, plus `ngdpbase.stores.recovery.confirmretries`. */
export function confirmAttempts(getProperty: GetProperty): number {
  const retries = getProperty('ngdpbase.stores.recovery.confirmretries', 1);
  return 1 + (typeof retries === 'number' && Number.isInteger(retries) && retries > 0 ? retries : 0);
}

interface PendingWords {
  username: string;
  store: string;
  kek: Buffer;
  envelope: UserKeyEnvelope;
  mnemonic: string;
  attemptsLeft: number;
  startedAt: number;
}

/** Words not confirmed within this time are forgotten, as an abandoned tab is. */
const PENDING_TTL_MS = 30 * 60 * 1000;

const pending = new Map<string, PendingWords>();

function forget(handle: string): void {
  const entry = pending.get(handle);
  if (entry) entry.kek.fill(0);
  pending.delete(handle);
}

function live(handle: string, username: string, store: string): PendingWords | undefined {
  const entry = pending.get(handle);
  if (!entry) return undefined;
  if (Date.now() - entry.startedAt > PENDING_TTL_MS || entry.username !== username || entry.store !== store) {
    forget(handle);
    return undefined;
  }
  return entry;
}

/**
 * Hold a new user KEK and its words while the user writes them down. Replaces
 * anything this session had pending: starting over is always allowed.
 */
export function holdWordsForConfirmation(handle: string, args: {
  username: string;
  store: string;
  kek: Buffer;
  envelope: UserKeyEnvelope;
  mnemonic: string;
  attempts: number;
}): void {
  forget(handle);
  pending.set(handle, {
    username: args.username,
    store: args.store,
    kek: Buffer.from(args.kek),
    envelope: args.envelope,
    mnemonic: args.mnemonic,
    attemptsLeft: Math.max(1, args.attempts),
    startedAt: Date.now()
  });
}

/** Whether this session is part-way through the words screen for `store`. */
export function hasPendingWords(handle: string, username: string, store: string): boolean {
  return live(handle, username, store) !== undefined;
}

export type ConfirmOutcome =
  | { status: 'confirmed'; kek: Buffer; envelope: UserKeyEnvelope }
  | { status: 'retry'; mnemonic: string; attemptsLeft: number }
  | { status: 'exhausted' }
  | { status: 'none' };

/**
 * Check the words the user typed back. A match hands over the KEK and envelope
 * to commit and forgets the words. A miss discards the words it showed — they
 * are never shown again — and, while attempts remain, makes a new set for the
 * same uncommitted KEK. No attempts left: everything is forgotten and nothing
 * was ever written.
 */
export function confirmWords(handle: string, username: string, store: string, entered: string): ConfirmOutcome {
  const entry = live(handle, username, store);
  if (!entry) return { status: 'none' };
  if (sameMnemonic(entered, entry.mnemonic)) {
    const kek = Buffer.from(entry.kek);
    const envelope = entry.envelope;
    forget(handle);
    return { status: 'confirmed', kek, envelope };
  }
  entry.attemptsLeft -= 1;
  if (entry.attemptsLeft <= 0) {
    forget(handle);
    return { status: 'exhausted' };
  }
  const fresh = newRecoveryWords(entry.kek);
  entry.mnemonic = fresh.mnemonic;
  entry.envelope = { ...entry.envelope, recoveryWrap: fresh.recoveryWrap };
  return { status: 'retry', mnemonic: fresh.mnemonic, attemptsLeft: entry.attemptsLeft };
}

/** Logout, or a new login in this session: nothing pending survives it. */
export function dropPendingWords(handle: string): void {
  forget(handle);
}

/** Test teardown only. */
export function clearPendingWords(): void {
  for (const handle of [...pending.keys()]) forget(handle);
}

async function writeExclusive(file: string, value: unknown): Promise<void> {
  // An existing file is a refusal, never an overwrite: replacing a store.json
  // loses the wrapped DEK — and with it every byte of the store. Atomic, owner
  // only and flushed (#1625): a crash mid-write leaves no truncated key file.
  await writeFileAtomic(file, JSON.stringify(value), 'utf8', { exclusive: true, mode: SECRET_FILE_MODE, fsync: true });
}

/** Whether `username` already has a copy of `store` — the door is then just a way in. */
export async function storeCopyExists(args: {
  pagesDirectory: string;
  username: string;
  store: string;
  layout?: PrivateStoreLayoutOverrides;
}): Promise<boolean> {
  return fs.pathExists(storeMetaPath(args.pagesDirectory, args.username, args.store, args.layout));
}

/** Whether `username` has a user KEK on disk. */
export async function userKeysExist(args: {
  pagesDirectory: string;
  username: string;
  layout?: PrivateStoreLayoutOverrides;
}): Promise<boolean> {
  return fs.pathExists(privateUserKeysPath(args.pagesDirectory, args.username, args.layout));
}

/**
 * Write the user's copy of a store kind: `user-keys.json` first when this
 * commit creates the user's KEK, then `store.json` — each written only if it
 * does not exist yet. Returns the store DEK for a sealed copy, so the caller
 * can put it in the session that walked through the door.
 */
export async function commitStoreCopy(args: {
  pagesDirectory: string;
  username: string;
  kind: StoreKind;
  /** The user KEK — required for a sealed copy. */
  kek?: Buffer;
  /** The new envelope, when this commit creates the user's KEK. */
  newEnvelope?: UserKeyEnvelope;
  layout?: PrivateStoreLayoutOverrides;
  now?: Date;
}): Promise<{ dek?: Buffer }> {
  const created = (args.now ?? new Date()).toISOString();
  if (args.kind.encrypt && !args.kek) throw new Error('encrypted store is locked: missing KEK');
  const keysFile = privateUserKeysPath(args.pagesDirectory, args.username, args.layout);
  if (args.newEnvelope) await writeExclusive(keysFile, args.newEnvelope);
  try {
    const metaFile = storeMetaPath(args.pagesDirectory, args.username, args.kind.id, args.layout);
    if (!args.kind.encrypt) {
      const record: StoreFileRecord = { kind: args.kind.id, encrypt: false, created };
      await writeExclusive(metaFile, record);
      return {};
    }
    const sealed = createEncryptedStore(args.kek as Buffer);
    const record: StoreFileRecord = { kind: args.kind.id, encrypt: true, created, dekWrap: sealed.dekWrap };
    await writeExclusive(metaFile, record);
    return { dek: unwrapDek(args.kek as Buffer, sealed) };
  } catch (err) {
    // A key must never outlive the store it was made for: no orphan key.
    if (args.newEnvelope) await fs.remove(keysFile);
    throw err;
  }
}
