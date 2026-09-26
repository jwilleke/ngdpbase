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
import path from 'path';
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
  storeMetaPath,
  type PrivateStoreLayoutOverrides
} from './privateStorePath.js';
import type { StoreFileRecord } from './privateStoreMeta.js';

type GetProperty = (key: string, defaultValue: unknown) => unknown;

/** A store kind as configuration defines it (`ngdpbase.stores.{id}.*`). */
export interface StoreKind {
  id: string;
  /** Whether a copy of this kind is created sealed — the kind owner's call. */
  encrypt: boolean;
  /** `admin`, or the slug of the addon that owns the kind. */
  owner: string;
}

/**
 * The kind named `id`, or `null` when configuration defines no such kind. A
 * kind exists when it has an owner; `encrypt` is read as the boolean it is and
 * nothing else (a string "true" is not a switch).
 */
export function storeKindFromConfig(getProperty: GetProperty, id: string): StoreKind | null {
  if (!isValidStoreId(id) || RESERVED_STORE_IDS.includes(id)) return null;
  const owner = getProperty(`ngdpbase.stores.${id}.owner`, undefined);
  if (typeof owner !== 'string' || owner.length === 0) return null;
  return { id, owner, encrypt: getProperty(`ngdpbase.stores.${id}.encrypt`, false) === true };
}

/** The owner slug the site itself uses; no addon may claim it. */
export const ADMIN_STORE_OWNER = 'admin';

/**
 * Ids under `ngdpbase.stores.*` that are instance settings, not kinds
 * (`recovery.confirmretries`, `import.maxsize`). A kind by these names would
 * share its keys with a setting, so none may be declared.
 */
export const RESERVED_STORE_IDS: readonly string[] = ['recovery', 'import'];

/** One kind as an addon declares it in its `package.json` `ngdpbase.stores`. */
export interface StoreDeclaration {
  id: string;
  encrypt: boolean;
}

/**
 * The well-formed declarations in a manifest's `stores` value, and a reason
 * for each one that is not. An `encrypt` that is not a boolean is refused
 * rather than read as false: it is the one field that says whether a
 * person's data is sealed.
 */
export function readStoreDeclarations(raw: unknown): { declarations: StoreDeclaration[]; problems: string[] } {
  const declarations: StoreDeclaration[] = [];
  const problems: string[] = [];
  if (raw === undefined || raw === null) return { declarations, problems };
  if (!Array.isArray(raw)) return { declarations, problems: ['`stores` must be an array'] };
  for (const entry of raw as unknown[]) {
    const e = entry as { id?: unknown; encrypt?: unknown } | null;
    const id = typeof e?.id === 'string' ? e.id : '';
    if (!id || !isValidStoreId(id)) { problems.push(`store id ${JSON.stringify(e?.id)} is not a valid store id`); continue; }
    if (RESERVED_STORE_IDS.includes(id)) { problems.push(`store id "${id}" is reserved for an instance setting`); continue; }
    if (typeof e?.encrypt !== 'boolean') { problems.push(`store "${id}": encrypt must be true or false`); continue; }
    declarations.push({ id, encrypt: e.encrypt });
  }
  return { declarations, problems };
}

/**
 * What loading an addon does with one of its declarations (#1414).
 *
 * - `persist` — no kind by this id yet: write it, owned by this addon.
 * - `match` — already this addon's, and the manifest agrees.
 * - `stale` — already this addon's, but the manifest now says otherwise.
 *   Config wins; the declaration is ignored and reported, the addon loads.
 * - `denied` — another owner holds this id. One addon reaching into another's
 *   container: refused, and reported loudly.
 */
export type DeclarationPlan =
  | { action: 'persist' }
  | { action: 'match' }
  | { action: 'stale'; configEncrypt: boolean }
  | { action: 'denied'; owner: string };

export function planStoreDeclaration(getProperty: GetProperty, slug: string, decl: StoreDeclaration): DeclarationPlan {
  if (slug === ADMIN_STORE_OWNER) return { action: 'denied', owner: ADMIN_STORE_OWNER };
  const existing = storeKindFromConfig(getProperty, decl.id);
  if (!existing) return { action: 'persist' };
  if (existing.owner !== slug) return { action: 'denied', owner: existing.owner };
  if (existing.encrypt !== decl.encrypt) return { action: 'stale', configEncrypt: existing.encrypt };
  return { action: 'match' };
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
  await fs.ensureDir(path.dirname(file));
  // `wx`: an existing file is a refusal, never an overwrite. Replacing a
  // store.json loses the wrapped DEK — and with it every byte of the store.
  await fs.writeFile(file, JSON.stringify(value), { flag: 'wx' });
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
