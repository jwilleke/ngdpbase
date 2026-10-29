/**
 * SharedFolderManager — the organization's shared folders (#1775). Slice 1
 * (#2124): their keys and the organization's recovery words. Slice 2
 * (#2125): the folders themselves, `/shared/<name>`, which hold pages and
 * files through the page and file doors (PageManager, AttachmentManager) as
 * the container `shared-folders`' vaults (`SHARED_FOLDER_OWNER`), sealed with
 * each folder's key, opened by permission (`utils/sharedFolderAccess.ts`).
 *
 * It owns one fact, the key material (`<ngdpbase.shared-folders.storagedir>/keys.json`,
 * owner-only, backed up with the site as the part `shared-folders`):
 *
 * - __Each folder's own key__ (a random DEK, decision 2), wrapped under the
 *   server key `NGDPBASE_SHARED_FOLDERS_KEY` (decision 1), read once at start.
 *   The wrap is the private-store one (`createEncryptedStore` / `unwrapDek`),
 *   not a second scheme.
 * - __The recovery words__ (decision 4): 12 BIP39 words, made on an admin's
 *   action and shown to them once. They do not wrap each folder key
 *   directly — the server never holds the words after showing them, so it
 *   could not wrap a later folder's key under them. Instead the words wrap a
 *   key pair's private half (the private-store recovery wrap and person key,
 *   `newRecoveryWords` / `newPersonKey`), and each folder key is sealed to its
 *   public half (`sealKekCopy`). So every folder key is wrapped twice, under
 *   the server key and under the words, and only the words open the second.
 * - __The server key's fingerprint__, recorded with the first key material,
 *   so a different key at start says so on the dashboard instead of failing
 *   later.
 *
 * It asks for everything else: who may act is the PDP's (`admin-system` to
 * make words and folders; `shared-folder-read` / `shared-folder-file` on the
 * folder to open it or add to it), what a folder holds is PageManager's and
 * AttachmentManager's, the
 * admin's "I have saved the words" is ConsentManager's
 * (`shared-folders-recovery-words`), the audit records are AuditManager's,
 * and whether the key is saved off the server is BackupManager's.
 *
 * Never logs or records a key, a wrapped key or a word.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { promises as fsp, existsSync } from 'node:fs';
import path from 'node:path';
import BaseManager, { type BackupFolder } from './BaseManager.js';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import { actorOf, type ActorContext } from '../context/ActorContext.js';
import { recordAuditEvent, type AuditEventSink } from '../utils/auditEvents.js';
import { AUDIT_EVENT } from '../utils/auditEventNames.js';
import { KeyedSerial } from '../utils/keyedSerial.js';
import {
  createEncryptedStore,
  newPersonKey,
  newRecoveryWords,
  openKekCopy,
  recoveryWordsId,
  sealKekCopy,
  unwrapDek,
  unwrapKekWithMnemonic,
  type PersonKey,
  type WrappedBlob
} from '../utils/privateStoreCrypto.js';
import type { Lockbox } from '../utils/shareLockbox.js';
import { isValidStoreId, privateStoreLayoutFromConfig, SHARED_FOLDER_OWNER, storeMetaPath } from '../utils/privateStorePath.js';
import {
  permitsInSharedFolder,
  setSharedFolderKeySource,
  SHARED_FOLDER_READ,
  sharedFolderResource
} from '../utils/sharedFolderAccess.js';
import type { VaultDecider } from '../utils/privateStoreAccess.js';
import { SHARED_FOLDERS_WORDS_CONSENT_SCOPE } from '../types/Consent.js';
import {
  currentSharedFoldersKey,
  SHARED_FOLDERS_KEY_ENV,
  sharedFoldersKeyFingerprint,
  sharedFoldersWrapKey
} from '../utils/sharedFoldersKey.js';

const STORAGE_KEY = 'ngdpbase.shared-folders.storagedir';
const PENDING_MINUTES_KEY = 'ngdpbase.shared-folders.words-pending-minutes';
/** The shipped default for `words-pending-minutes`, stated once (the shipped config carries the same). */
const DEFAULT_PENDING_MINUTES = 15;
const KEYS_FILE = 'keys.json';

/** A folder id: lower case letters, digits and hyphens, as in `/shared/<id>`. */
const FOLDER_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** The folder every signed-in user may open (decision; the shipped `shared-folder-default` policy). */
export const DEFAULT_SHARED_FOLDER = 'default';

/** Where pages live: a folder is kept under it, as the `shared-folders` container's vault. */
const PAGES_DIR_KEY = 'ngdpbase.page.provider.filesystem.storagedir';

/** The organization's recovery words, as kept: never the words. */
interface RecoveryRecord {
  /** A random key wrapped under the words (`newRecoveryWords`). */
  recoveryWrap: WrappedBlob;
  /** A key pair: its private half wrapped under that key, its public half what each folder key is sealed to. */
  personKey: PersonKey;
  /** When they were made (ISO 8601). */
  madeAt: string;
  /** The admin they were shown to: the one whose "I have saved them" counts. */
  shownTo: string;
}

/** One folder's key, as kept: never the key. */
interface FolderKeyRecord {
  createdAt: string;
  createdBy: string;
  /** The folder key wrapped under the server key (`createEncryptedStore`). */
  serverWrap: WrappedBlob;
  /** The folder key sealed to the recovery key pair: what the words open. */
  recoveryCopy: Lockbox;
  /** Which set of words `recoveryCopy` is for. */
  wordsId: string;
}

interface KeysFile {
  version: 1;
  /** The fingerprint of the server key everything here is wrapped under. */
  serverKeyFingerprint: string;
  recovery: RecoveryRecord | null;
  folders: Record<string, FolderKeyRecord>;
}

/** The recovery words shown to an admin and not yet saved. Held in memory only. */
interface PendingWords {
  token: string;
  recoveryWrap: WrappedBlob;
  personKey: PersonKey;
  expiresAt: number;
}

/** What Admin → Backup shows about the organization's recovery words: never the words. */
export interface SharedFoldersWordsInfo {
  /** Which set (`recoveryWordsId`): what the admin's confirmation is bound to. */
  wordsId: string;
  madeAt: string;
  shownTo: string;
  /** Whether any folder key is sealed for this set: such a set can never be discarded. */
  protectsFolders: boolean;
}

/** The door said no: not allowed, or the request does not fit the state. Nothing was changed. */
export class SharedFolderRefusedError extends Error {
  override readonly name = 'SharedFolderRefusedError';
}

/** The keys cannot be used right now (no server key, or not the one they were made under); the message says why. */
export class SharedFoldersUnavailableError extends Error {
  override readonly name = 'SharedFoldersUnavailableError';
}

interface ConsentReader {
  documents(scope: string): Promise<unknown[]>;
  pendingFor(username: string, scope: string, subject?: string): Promise<unknown[]>;
}

interface Pdp {
  permits(subject: ActorContext, action: string): Promise<boolean>;
}

/** The permission every door here asks in this slice. */
const ADMIN_PERMISSION = 'admin-system';

class SharedFolderManager extends BaseManager {
  readonly description = 'The organization\'s shared folders: each folder\'s key, the organization key and the recovery words (#1775, #2124)';

  private storageDir: string | null = null;
  /** The 32-byte wrap key derived from `NGDPBASE_SHARED_FOLDERS_KEY`, read once at start; null without one. */
  private wrapKey: Buffer | null = null;
  private keyFingerprint: string | null = null;
  /** Why the keys cannot be used, or null when they can. */
  private unavailable: string | null = null;
  private file: KeysFile | null = null;
  private readonly pending = new Map<string, PendingWords>();
  private readonly serial = new KeyedSerial();

  constructor(engine: WikiEngine) {
    super(engine);
  }

  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);
    const dir = this.configuredStorageDir();
    this.storageDir = dir;
    if (!dir || !this.preflightConfiguredPath(STORAGE_KEY, dir).ok) {
      this.unavailable = 'There is no usable folder for the shared-folders keys';
      return;
    }
    // Decision 1: read at start; nobody types anything.
    const key = currentSharedFoldersKey();
    if (!key) {
      this.unavailable = `${SHARED_FOLDERS_KEY_ENV} is not set, so no shared folder can be opened. Set it in the instance .env (a restart makes one when it is missing)`;
      this.markDegraded(this.unavailable, SHARED_FOLDERS_KEY_ENV);
      return;
    }
    this.wrapKey = sharedFoldersWrapKey(key);
    this.keyFingerprint = sharedFoldersKeyFingerprint(key);
    try {
      this.file = await this.readKeysFile();
    } catch (err) {
      this.unavailable = `The shared-folders keys could not be read: ${(err as Error).message}`;
      this.markDegraded(this.unavailable, STORAGE_KEY);
      return;
    }
    if (this.file && this.file.serverKeyFingerprint !== this.keyFingerprint) {
      this.unavailable = `${SHARED_FOLDERS_KEY_ENV} is not the key the shared folders were made under (fingerprint ${this.keyFingerprint}, expected ${this.file.serverKeyFingerprint}), so none of them can be opened. Put the saved .env back and restart`;
      this.markDegraded(this.unavailable, SHARED_FOLDERS_KEY_ENV);
      return;
    }
    // #2125: a folder's key reaches the store I/O only for a context the PDP
    // has permitted on that folder (`sharedFolderKeyFor`).
    setSharedFolderKeySource((folder) => this.folderKey(folder));
    logger.info(`🗝️  SharedFolderManager initialized (${dir}; ${Object.keys(this.file?.folders ?? {}).length} folder key(s))`);
  }

  override async shutdown(): Promise<void> {
    setSharedFolderKeySource(null);
    await super.shutdown();
  }

  private configuredStorageDir(): string | null {
    return this.engine.getManager<ConfigurationManager>('ConfigurationManager')
      ?.getResolvedDataPath(STORAGE_KEY, './data/shared-folders') ?? null;
  }

  /** The wrapped keys are in the backup; a backup from before #2124 has none, so it is optional. */
  override backupFolders(): BackupFolder[] {
    return [{ part: 'shared-folders', folder: this.storageDir ?? this.configuredStorageDir(), optional: true }];
  }

  // ── What Admin → Backup shows ─────────────────────────────────────────

  /** The organization's recovery words as made (never the words), or null: none made yet. */
  recoveryWordsInfo(): SharedFoldersWordsInfo | null {
    const r = this.file?.recovery;
    return r ? { wordsId: recoveryWordsId(r), madeAt: r.madeAt, shownTo: r.shownTo, protectsFolders: Object.keys(this.file?.folders ?? {}).length > 0 } : null;
  }

  /**
   * Whether the admin shown the current words confirmed saving them, at the
   * wording's current version: their consent in `shared-folders-recovery-words`
   * for this set exists (ConsentManager's fact, asked each time). False with
   * no words, no ConsentManager, or no wording page (then nobody could have
   * confirmed what it says).
   */
  async recoveryWordsConfirmed(): Promise<boolean> {
    const info = this.recoveryWordsInfo();
    const consent = this.engine.getManager<ConsentReader>('ConsentManager');
    if (!info || !consent) return false;
    if ((await consent.documents(SHARED_FOLDERS_WORDS_CONSENT_SCOPE)).length === 0) return false;
    return (await consent.pendingFor(info.shownTo, SHARED_FOLDERS_WORDS_CONSENT_SCOPE, info.wordsId)).length === 0;
  }

  /** Why the keys cannot be used now, or null when they can. */
  unavailableReason(): string | null {
    return this.unavailable;
  }

  // ── The recovery words ─────────────────────────────────────────────────

  /**
   * Make the organization's 12 recovery words, to show to the admin `ctx`
   * once (decision 4). Nothing is saved: the words wait, in memory only, for
   * that admin's `saveRecoveryWords` with the returned token, for
   * `ngdpbase.shared-folders.words-pending-minutes`. A second call replaces
   * the first set unsaved. Refused while a set is saved: an unconfirmed set is
   * discarded first (`discardUnconfirmedWords`); replacing a confirmed set is a
   * later slice.
   */
  async prepareRecoveryWords(ctx: ActorContext): Promise<{ token: string; words: string[] }> {
    await this.requireAdmin(ctx);
    this.requireUsable();
    if (this.file?.recovery) throw new SharedFolderRefusedError('The shared folders already have recovery words');
    const kek = randomBytes(32);
    try {
      const { mnemonic, recoveryWrap } = newRecoveryWords(kek);
      const personKey = await newPersonKey(kek);
      const token = randomUUID();
      const minutes = this.pendingMinutes();
      this.pending.set(ctx.username, { token, recoveryWrap, personKey, expiresAt: Date.now() + minutes * 60_000 });
      return { token, words: mnemonic.split(' ') };
    } finally {
      kek.fill(0);
    }
  }

  /** Forget the words shown to `ctx` and not saved: they are never shown again. */
  discardRecoveryWords(ctx: ActorContext): void {
    this.pending.delete(ctx.username);
  }

  /**
   * Discard the saved recovery words while the admin shown them has not
   * confirmed saving them (operator, 2026-10-29): any holder of
   * `admin-system` may, so a reminder that nobody can clear (that admin's
   * account deleted, say) can always be cleared by making a new set and
   * confirming it themselves. Refused once the set is confirmed, and while
   * any folder key is sealed for it (`createFolderKey` needs a confirmed set,
   * so such a set was confirmed once). Recorded as
   * `shared-folder-words-discard` before the words are removed (on-failure
   * refuse).
   */
  async discardUnconfirmedWords(ctx: ActorContext): Promise<void> {
    await this.requireAdmin(ctx);
    this.requireUsable();
    await this.serial.run(KEYS_FILE, async () => {
      const file = this.file;
      const info = this.recoveryWordsInfo();
      if (!file?.recovery || !info) throw new SharedFolderRefusedError('The shared folders have no recovery words to discard');
      if (info.protectsFolders) throw new SharedFolderRefusedError('These recovery words protect shared folders, so they cannot be discarded');
      if (await this.recoveryWordsConfirmed()) throw new SharedFolderRefusedError(`${info.shownTo} confirmed saving these recovery words, so they cannot be discarded`);
      const who = actorOf(ctx);
      await recordAuditEvent(this.engine.getManager<AuditEventSink>('AuditManager'), {
        eventType: AUDIT_EVENT.SHARED_FOLDER_WORDS_DISCARD,
        ...who,
        action: 'shared-folder-words-discard',
        result: 'success',
        severity: 'high',
        resource: 'shared-folders',
        resourceType: 'shared-folders-recovery-words',
        metadata: { ...who.metadata, wordsId: info.wordsId, shownTo: info.shownTo }
      });
      await this.writeKeysFile({ ...file, recovery: null });
      logger.info(`🗝️  [SharedFolderManager] ${ctx.username} discarded the shared folders' unconfirmed recovery words (shown to ${info.shownTo})`);
    });
  }

  /**
   * Save the recovery words shown to `ctx` (`prepareRecoveryWords`), once
   * they confirmed they saved them: the caller asks for the tick first, and
   * records the confirmation with ConsentManager after (`wordsId`). Recorded
   * as `shared-folder-words-create` before it is saved (on-failure refuse).
   * Refused when the token is not the one shown to them, has expired, or a
   * set was saved meanwhile.
   *
   * @returns Which set of words was saved (`recoveryWordsId`)
   */
  async saveRecoveryWords(ctx: ActorContext, token: string): Promise<string> {
    await this.requireAdmin(ctx);
    this.requireUsable();
    const shown = this.pending.get(ctx.username);
    if (!shown || shown.token !== token || shown.expiresAt < Date.now()) {
      this.pending.delete(ctx.username);
      throw new SharedFolderRefusedError('Those recovery words are no longer waiting to be saved. Nothing was saved; make a new set');
    }
    return this.serial.run(KEYS_FILE, async () => {
      if (this.file?.recovery) throw new SharedFolderRefusedError('The shared folders already have recovery words');
      const recovery: RecoveryRecord = { recoveryWrap: shown.recoveryWrap, personKey: shown.personKey, madeAt: new Date().toISOString(), shownTo: ctx.username };
      const wordsId = recoveryWordsId(recovery);
      const who = actorOf(ctx);
      // Record first, then save: a failed record refuses and nothing is written.
      await recordAuditEvent(this.engine.getManager<AuditEventSink>('AuditManager'), {
        eventType: AUDIT_EVENT.SHARED_FOLDER_WORDS_CREATE,
        ...who,
        action: 'shared-folder-words-create',
        result: 'success',
        severity: 'high',
        resource: 'shared-folders',
        resourceType: 'shared-folders-recovery-words',
        metadata: { ...who.metadata, wordsId }
      });
      await this.writeKeysFile({ ...this.fileOrNew(), recovery });
      this.pending.delete(ctx.username);
      logger.info(`🗝️  [SharedFolderManager] the shared folders' recovery words were made and shown to ${ctx.username}`);
      return wordsId;
    });
  }

  // ── Folder keys ────────────────────────────────────────────────────────

  /**
   * Make folder `folderId`'s own key (decision 2): a random key, wrapped
   * under the server key and sealed for the recovery words, so it needs the
   * words to exist and to be confirmed saved by the admin shown them
   * (`recoveryWordsConfirmed`; operator, 2026-10-29): no folder key is ever
   * protected only by words nobody saved. Recorded as `shared-folder-key-create` before it is
   * saved (on-failure refuse). The key itself is not returned; open it with
   * `openFolderKey`.
   */
  async createFolderKey(ctx: ActorContext, folderId: string): Promise<void> {
    await this.requireAdmin(ctx);
    const wrapKey = this.requireUsable();
    if (!FOLDER_ID.test(folderId)) throw new SharedFolderRefusedError(`'${folderId}' is not a folder name: lower case letters, digits and hyphens`);
    await this.serial.run(KEYS_FILE, async () => {
      const file = this.fileOrNew();
      if (!file.recovery) throw new SharedFolderRefusedError('Make the shared folders\' recovery words first (Admin → Backup)');
      if (!(await this.recoveryWordsConfirmed())) {
        throw new SharedFolderRefusedError(`${file.recovery.shownTo} has not confirmed saving the shared folders' recovery words yet, so no folder key can be made`);
      }
      if (file.folders[folderId]) throw new SharedFolderRefusedError(`Shared folder '${folderId}' already has a key`);
      const record = createEncryptedStore(wrapKey);
      const dek = unwrapDek(wrapKey, record);
      try {
        const recoveryCopy = await sealKekCopy(file.recovery.personKey.publicKey, dek);
        const who = actorOf(ctx);
        await recordAuditEvent(this.engine.getManager<AuditEventSink>('AuditManager'), {
          eventType: AUDIT_EVENT.SHARED_FOLDER_KEY_CREATE,
          ...who,
          action: 'shared-folder-key-create',
          result: 'success',
          severity: 'medium',
          resource: folderId,
          resourceType: 'shared-folder',
          metadata: { ...who.metadata, folder: folderId }
        });
        const entry: FolderKeyRecord = {
          createdAt: new Date().toISOString(),
          createdBy: ctx.username,
          serverWrap: record.dekWrap,
          recoveryCopy,
          wordsId: recoveryWordsId(file.recovery)
        };
        await this.writeKeysFile({ ...file, folders: { ...file.folders, [folderId]: entry } });
      } finally {
        dek.fill(0);
      }
    });
  }

  /**
   * Folder `folderId`'s key, unwrapped with the server key, for a caller the
   * PDP permits `shared-folder-read` on the folder (#2125). The caller holds
   * it for the moment it needs it and zeroes it. The page and file doors do
   * not call this: they reach the key through the store I/O
   * (`sharedFolderKeyFor`), only for a context permitted on the folder.
   */
  async openFolderKey(ctx: ActorContext, folderId: string): Promise<Buffer> {
    this.requireUsable();
    if (!(await this.mayInFolder(ctx, SHARED_FOLDER_READ, folderId))) {
      throw new SharedFolderRefusedError(`${ctx?.username ?? 'Nobody'} may not open shared folder '${folderId}'`);
    }
    const key = this.folderKey(folderId);
    if (!key) throw new SharedFolderRefusedError(`Shared folder '${folderId}' has no key`);
    return key;
  }

  /** Folder `folderId`'s key with the server key, or undefined: no such folder, or the keys cannot be used. Never asks who; its callers have. */
  private folderKey(folderId: string): Buffer | undefined {
    const entry = this.file?.folders[folderId];
    if (!entry || this.unavailable || !this.wrapKey) return undefined;
    return unwrapDek(this.wrapKey, { encrypt: true, dekWrap: entry.serverWrap });
  }

  // ── Folders (#2125) ────────────────────────────────────────────────────

  /** The folders there are, by name: each has its key. */
  folderNames(): string[] {
    return Object.keys(this.file?.folders ?? {}).sort();
  }

  /**
   * Make shared folder `name` (#2125): its key (`createFolderKey`, which
   * needs the recovery words confirmed) and its place for pages, sealed with
   * that key. Admins only (decision 8) until the Shared folders screen
   * (slice 3). A new folder opens to nobody until a policy names
   * `shared/<name>`; `default` is shipped open to every signed-in user.
   * Recorded as `shared-folder-create` before anything is made (on-failure
   * refuse). Refused when it exists.
   */
  async createFolder(ctx: ActorContext, name: string): Promise<void> {
    await this.requireAdmin(ctx);
    this.requireUsable();
    if (!FOLDER_ID.test(name) || !isValidStoreId(name)) throw new SharedFolderRefusedError(`'${name}' is not a folder name: lower case letters, digits and single hyphens`);
    const where = this.pagesPlace();
    if (!where) throw new SharedFoldersUnavailableError('There is no folder for pages on this site');
    const hasKey = Boolean(this.file?.folders[name]);
    const hasPlace = existsSync(storeMetaPath(where.pagesDirectory, SHARED_FOLDER_OWNER, name, where.layout));
    if (hasKey && hasPlace) throw new SharedFolderRefusedError(`Shared folder '${name}' already exists`);
    const who = actorOf(ctx);
    await recordAuditEvent(this.engine.getManager<AuditEventSink>('AuditManager'), {
      eventType: AUDIT_EVENT.SHARED_FOLDER_CREATE,
      ...who,
      action: 'shared-folder-create',
      result: 'success',
      severity: 'medium',
      resource: sharedFolderResource(name),
      resourceType: 'shared-folder',
      metadata: { ...who.metadata, folder: name }
    });
    if (!hasKey) await this.createFolderKey(ctx, name);
    // Sealed: its key is the server's (keys.json), so store.json carries no
    // wrapped key, only that the folder is sealed.
    if (!hasPlace) {
      const meta = storeMetaPath(where.pagesDirectory, SHARED_FOLDER_OWNER, name, where.layout);
      await fsp.mkdir(path.dirname(meta), { recursive: true });
      await fsp.writeFile(meta, JSON.stringify({ kind: 'shared-folder', encrypt: true, created: new Date().toISOString() }), { flag: 'wx' });
    }
    logger.info(`🗂️  [SharedFolderManager] ${ctx.username} created shared folder '${name}'`);
  }

  /**
   * Make `/shared/default` when it is not there yet and can be made: the
   * recovery words are confirmed. Finishing the words does this, so the
   * folder every signed-in user may open exists from then on. Returns whether
   * it was made now.
   */
  async ensureDefaultFolder(ctx: ActorContext): Promise<boolean> {
    if (this.folderNames().includes(DEFAULT_SHARED_FOLDER) || !(await this.recoveryWordsConfirmed())) return false;
    await this.createFolder(ctx, DEFAULT_SHARED_FOLDER);
    return true;
  }

  /**
   * May `ctx` do `action` (a page or file action, or `shared-folder-read` /
   * `shared-folder-file`) in folder `name`? The PDP's answer
   * (`permitsInSharedFolder`); false for a folder that does not exist.
   */
  async mayInFolder(ctx: ActorContext, action: string, name: string): Promise<boolean> {
    if (!this.folderNames().includes(name)) return false;
    return permitsInSharedFolder(this.engine.getManager<VaultDecider>('PolicyDecisionPoint'), ctx, action, name);
  }

  /**
   * The folders `ctx` may open (`shared-folder-read`), by name. Asking opens
   * each one's key to this context (`sharedFolderKeyFor`), so the page and
   * file doors can read what this reader may. The session middleware asks it
   * on every request, so a grant removed ends access on the next request
   * (decision 5).
   */
  async foldersReadableBy(ctx: ActorContext): Promise<string[]> {
    const out: string[] = [];
    for (const name of this.folderNames()) {
      if (await this.mayInFolder(ctx, SHARED_FOLDER_READ, name)) out.push(name);
    }
    return out;
  }

  /**
   * Record that `ctx` opened `what` (a page, its history, or a file) in
   * folder `name` (`shared-folder-read`, on by default: every read of a
   * shared folder is recorded, #1775). Called by what serves it, after the
   * door allowed it. The writes are recorded by the page and file doors.
   */
  async recordRead(ctx: ActorContext, name: string, what: { page?: string; attachmentId?: string; action?: string }): Promise<void> {
    const who = actorOf(ctx);
    await recordAuditEvent(this.engine.getManager<AuditEventSink>('AuditManager'), {
      eventType: AUDIT_EVENT.SHARED_FOLDER_READ,
      ...who,
      action: 'shared-folder-read',
      result: 'success',
      severity: 'low',
      resource: what.page ?? (what.attachmentId ? `attachment:${what.attachmentId}` : sharedFolderResource(name)),
      resourceType: 'shared-folder',
      metadata: { ...who.metadata, folder: name, ...what }
    });
  }

  /** The pages directory and the configured vault layout, where folders are kept. */
  private pagesPlace(): { pagesDirectory: string; layout: ReturnType<typeof privateStoreLayoutFromConfig> } | null {
    const config = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const pagesDirectory = config?.getResolvedDataPath(PAGES_DIR_KEY, './data/pages');
    if (!config || !pagesDirectory) return null;
    return { pagesDirectory, layout: privateStoreLayoutFromConfig((key, fallback) => config.getProperty(key, fallback)) };
  }

  /**
   * Folder `folderId`'s key, opened with the recovery words instead of the
   * server key: what recovery after a lost server key will use (a later
   * slice: a new server key, every folder key rewrapped). Throws when the
   * words are wrong. Works with no server key at all.
   */
  async openFolderKeyWithWords(ctx: ActorContext, folderId: string, words: string): Promise<Buffer> {
    await this.requireAdmin(ctx);
    const recovery = this.file?.recovery;
    const entry = this.file?.folders[folderId];
    if (!recovery || !entry) throw new SharedFolderRefusedError(`Shared folder '${folderId}' has no key`);
    const kek = unwrapKekWithMnemonic(recovery, words);
    try {
      return await openKekCopy(recovery, kek, entry.recoveryCopy);
    } finally {
      kek.fill(0);
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private async requireAdmin(ctx: ActorContext): Promise<void> {
    const pdp = this.engine.getManager<Pdp>('PolicyDecisionPoint');
    if (!ctx?.username || !pdp || !(await pdp.permits(ctx, ADMIN_PERMISSION))) {
      throw new SharedFolderRefusedError(`${ctx?.username ?? 'Nobody'} may not manage the shared folders' keys (needs ${ADMIN_PERMISSION})`);
    }
  }

  /** The wrap key, or throws why there is none to use. */
  private requireUsable(): Buffer {
    if (this.unavailable || !this.wrapKey || !this.keyFingerprint) throw new SharedFoldersUnavailableError(this.unavailable ?? 'SharedFolderManager has not started');
    return this.wrapKey;
  }

  private pendingMinutes(): number {
    const v = Number(this.engine.getManager<ConfigurationManager>('ConfigurationManager')?.getProperty(PENDING_MINUTES_KEY, DEFAULT_PENDING_MINUTES));
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_PENDING_MINUTES;
  }

  private fileOrNew(): KeysFile {
    return this.file ?? { version: 1, serverKeyFingerprint: this.keyFingerprint ?? '', recovery: null, folders: {} };
  }

  private keysPath(): string {
    return path.join(this.storageDir ?? '', KEYS_FILE);
  }

  private async readKeysFile(): Promise<KeysFile | null> {
    const p = this.keysPath();
    if (!existsSync(p)) return null;
    const parsed = JSON.parse(await fsp.readFile(p, 'utf8')) as KeysFile;
    if (parsed?.version !== 1 || typeof parsed.serverKeyFingerprint !== 'string' || typeof parsed.folders !== 'object') {
      throw new Error(`${KEYS_FILE} is not a shared-folders keys file`);
    }
    return parsed;
  }

  /** Owner-only, written whole and renamed into place, so a crash never leaves half a file. */
  private async writeKeysFile(next: KeysFile): Promise<void> {
    const p = this.keysPath();
    await fsp.mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
    const tmp = `${p}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
    await fsp.rename(tmp, p);
    this.file = next;
  }
}

export default SharedFolderManager;
