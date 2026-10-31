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
import { systemContext } from '../context/bootActions.js';
import { recordAuditEvent, type AuditEventSink } from '../utils/auditEvents.js';
import { AUDIT_EVENT } from '../utils/auditEventNames.js';
import { KeyedSerial } from '../utils/keyedSerial.js';
import {
  createEncryptedStore,
  newPersonKey,
  newRecoveryWords,
  openKekCopy,
  recoveryWordsId,
  sameMnemonic,
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
  SHARED_FOLDER_FILE,
  SHARED_FOLDER_READ,
  SHARED_FOLDER_RESOURCE_TYPE,
  sharedFolderResource
} from '../utils/sharedFolderAccess.js';
import type PolicyEvaluator from './PolicyEvaluator.js';
import type { Policy } from '../types/Policy.js';
import type { VaultDecider } from '../utils/privateStoreAccess.js';
import { SHARED_FOLDERS_WORDS_CONSENT_SCOPE } from '../types/Consent.js';
import { recordRecoveryWordsExport, type RecoveryWordsExport } from '../utils/recoveryWordsFile.js';
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

/** The Executive shared folder (#2095); who opens it is the shipped policies' (`shared-folder-executive-read`, `shared-folder-executive-file`, `shared-folder-admin`). */
export const EXECUTIVE_SHARED_FOLDER = 'executive';

/** The folders every site has, made once the recovery words are confirmed (#2125, #2095). */
export const SHIPPED_SHARED_FOLDERS: readonly string[] = [DEFAULT_SHARED_FOLDER, EXECUTIVE_SHARED_FOLDER];

/** Where pages live: a folder is kept under it, as the `shared-folders` container's vault. */
const PAGES_DIR_KEY = 'ngdpbase.page.provider.filesystem.storagedir';

/** The access policies, which the Shared folders screen writes the site's own entries of (#2126). */
const POLICIES_KEY = 'ngdpbase.access.policies';
/** The roles a folder's access may name. */
const ROLES_KEY = 'ngdpbase.roles.definitions';
/**
 * The ids of the policies the Shared folders screen writes (#2126):
 * `shared-folder-access-<name>-read` and `shared-folder-access-<name>-file`.
 * Reserved for the screen: no shipped policy has this prefix
 * (`shared-folder-executive-read` grants on `shared/*`, not one folder). A
 * policy with one of a folder's two ids that the screen did not write (an
 * add-on's, or the site's own in another shape) is shown under the folder and
 * blocks saving it, never hidden or overwritten.
 */
const ACCESS_POLICY_PREFIX = 'shared-folder-access-';
/** The priority of the screen's policies: that of the shipped folder policies. */
const ACCESS_POLICY_PRIORITY = 60;
/**
 * The role an anonymous visitor holds. Never given a folder: a folder is for
 * signed-in users, never public (#1775).
 */
const ANONYMOUS_ROLE = 'anonymous';

/** Who may read and who may file in a folder, as the Shared folders screen sets it (#2126). */
export interface SharedFolderAccess {
  /** Roles granted `shared-folder-read` on `shared/<name>` by the screen's policy. */
  read: string[];
  /** Roles granted `shared-folder-file` on `shared/<name>` by the screen's policy. */
  file: string[];
}

/** A policy in force that reaches a folder and that the screen did not write: shipped, an add-on's, or the site's own. Shown, never changed here. */
export interface SharedFolderOtherPolicy {
  id: string;
  name: string;
  effect: string;
  /** Its subjects as written (`role:editor`, `job:nightly`); empty: everyone, anonymous visitors included. */
  subjects: string[];
  /** Which of `shared-folder-read` and `shared-folder-file` it decides, as the PDP matches actions (an empty list or `*` is both). */
  actions: string[];
  /** It has an id the screen writes for this folder: saving the folder is refused until it is renamed or removed. */
  reserved: boolean;
}

/** The id of the screen's policy for reading or filing in folder `name`. */
function accessPolicyId(name: string, kind: 'read' | 'file'): string {
  return `${ACCESS_POLICY_PREFIX}${name}-${kind}`;
}

/** The screen's policy granting `shared-folder-read` or `shared-folder-file` on `shared/<name>` to `roles`. */
function accessPolicy(name: string, kind: 'read' | 'file', roles: string[]): Policy {
  return {
    id: accessPolicyId(name, kind),
    name: `Shared folder ${name}: ${kind === 'read' ? 'read' : 'file'}`,
    description: kind === 'read'
      ? `Who may open /shared/${name}: its pages, their history and its files. Set on Admin → Shared folders (#2126)`
      : `Who may add, edit and delete pages and files in /shared/${name}. Set on Admin → Shared folders (#2126)`,
    priority: ACCESS_POLICY_PRIORITY,
    effect: 'allow',
    subjects: roles.map((value) => ({ type: 'role', value })),
    resources: [{ type: SHARED_FOLDER_RESOURCE_TYPE, pattern: sharedFolderResource(name) }],
    actions: [kind === 'read' ? SHARED_FOLDER_READ : SHARED_FOLDER_FILE]
  };
}

/**
 * Whether `p` has the shape `accessPolicy` writes for folder `name`: allow, one
 * or more role subjects, the one resource and the one action. Any other shape
 * under the screen's id is not the screen's.
 */
function isScreenPolicy(p: Policy, name: string, kind: 'read' | 'file'): boolean {
  const subjects = p.subjects ?? [];
  const resources = p.resources ?? [];
  const actions = p.actions ?? [];
  return p.id === accessPolicyId(name, kind)
    && p.effect === 'allow'
    && subjects.length > 0 && subjects.every((x) => x.type === 'role' && typeof x.value === 'string')
    && resources.length === 1 && resources[0].type === SHARED_FOLDER_RESOURCE_TYPE && resources[0].pattern === sharedFolderResource(name)
    && actions.length === 1 && actions[0] === (kind === 'read' ? SHARED_FOLDER_READ : SHARED_FOLDER_FILE);
}

/** The roles a policy the screen wrote names, sorted. */
function rolesOf(p: Policy | undefined): string[] {
  return (p?.subjects ?? []).map((x) => String(x.value)).sort();
}

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
  /** The words themselves, only while they wait: to check them typed back, and to download or print them (#2144). */
  mnemonic: string;
  recoveryWrap: WrappedBlob;
  personKey: PersonKey;
  /** When they were made (ms). */
  madeAt: number;
  expiresAt: number;
  /** The set these words replace (its `wordsId`), or null: the first set (#2144). */
  replaces: string | null;
}

/** The words waiting for this admin, as the confirm step needs them: never the words. */
export interface WaitingWords {
  token: string;
  /** Whether they replace a set already saved (a new set, #2144). */
  replacing: boolean;
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

/** The words typed back are not the ones shown (#2144). Nothing was saved; the words still wait, to be typed again. */
export class SharedFolderWordsMismatchError extends SharedFolderRefusedError {
  constructor() {
    super('Those words are not the ones shown. Nothing was saved. Check what you wrote down and type all 12 again, or start over with a new set');
  }
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

/**
 * Asked as well as `admin-system` to replace a saved set of words (#2144) and
 * to change who may read and file in a folder (#2126): the step-up permission
 * every configuration write asks (Admin → Configuration, the backup key,
 * `.env`), so the PDP refuses it without a fresh sign-in.
 */
const FRESH_SIGN_IN_PERMISSION = 'config-manage';

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
   * discarded first (`discardUnconfirmedWords`), and a saved set is replaced
   * with `prepareNewRecoveryWords`.
   */
  async prepareRecoveryWords(ctx: ActorContext): Promise<{ token: string; words: string[] }> {
    await this.requireAdmin(ctx);
    this.requireUsable();
    if (this.file?.recovery) throw new SharedFolderRefusedError('The shared folders already have recovery words');
    return this.holdNewWords(ctx, null);
  }

  /**
   * Make a new set of recovery words to replace the saved set (#2144): the
   * admin `ctx`, with a fresh sign-in (`admin-system` and the step-up
   * permission). Shown and confirmed exactly as the first set; nothing changes
   * until `saveRecoveryWords` with all 12 typed back, which seals every folder
   * key for the new words and retires the old ones. Abandoned or discarded
   * (`discardRecoveryWords`), the old set stays.
   */
  async prepareNewRecoveryWords(ctx: ActorContext): Promise<{ token: string; words: string[] }> {
    await this.requireAdmin(ctx);
    await this.requireFreshSignIn(ctx);
    this.requireUsable();
    const current = this.file?.recovery;
    if (!current) throw new SharedFolderRefusedError('The shared folders have no recovery words yet: make them first');
    return this.holdNewWords(ctx, recoveryWordsId(current));
  }

  /** Make 12 words and hold them, for `ctx` only, until saved, discarded or expired. Replaces any set waiting for them. */
  private async holdNewWords(ctx: ActorContext, replaces: string | null): Promise<{ token: string; words: string[] }> {
    const kek = randomBytes(32);
    try {
      const { mnemonic, recoveryWrap } = newRecoveryWords(kek);
      const personKey = await newPersonKey(kek);
      const token = randomUUID();
      const now = Date.now();
      this.pending.set(ctx.username, { token, mnemonic, recoveryWrap, personKey, madeAt: now, expiresAt: now + this.pendingMinutes() * 60_000, replaces });
      return { token, words: mnemonic.split(' ') };
    } finally {
      kek.fill(0);
    }
  }

  /** The words waiting for `ctx` to type them back, or null: none, or they expired. Never the words. */
  waitingWords(ctx: ActorContext): WaitingWords | null {
    const shown = this.livePending(ctx);
    return shown ? { token: shown.token, replacing: shown.replaces !== null } : null;
  }

  /**
   * The words waiting for `ctx`, to download as a file or print (#2144),
   * while they still wait: once saved they are gone and cannot be made again.
   * Recorded first as `recovery-words-export` (who, which set, how; never the
   * words; on-failure refuse). Refused for a token that is not the one shown
   * to them, or expired; the words are not discarded by a refused export.
   */
  async pendingRecoveryWords(ctx: ActorContext, token: string, how: RecoveryWordsExport): Promise<{ words: string[]; madeAt: Date; wordsId: string }> {
    await this.requireAdmin(ctx);
    const shown = this.livePending(ctx);
    if (!shown || shown.token !== token) throw new SharedFolderRefusedError('Those recovery words are no longer waiting to be saved, so they cannot be downloaded or printed. Make a new set');
    const wordsId = recoveryWordsId(shown);
    await recordRecoveryWordsExport(this.engine.getManager<AuditEventSink>('AuditManager'), ctx, { set: 'shared-folders', wordsId, how });
    return { words: shown.mnemonic.split(' '), madeAt: new Date(shown.madeAt), wordsId };
  }

  /** Forget the words shown to `ctx` and not saved: they are never shown again. A set they were to replace stays. */
  discardRecoveryWords(ctx: ActorContext): void {
    this.pending.delete(ctx.username);
  }

  /** The words waiting for `ctx`, or undefined; expired words are forgotten. */
  private livePending(ctx: ActorContext): PendingWords | undefined {
    const shown = this.pending.get(ctx.username);
    if (shown && shown.expiresAt < Date.now()) {
      this.pending.delete(ctx.username);
      return undefined;
    }
    return shown;
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
   * Save the recovery words shown to `ctx` (`prepareRecoveryWords` or
   * `prepareNewRecoveryWords`) once they proved they kept them: `typed` is
   * all 12 typed back (#2144). The caller asks for the tick first, and records
   * the confirmation with ConsentManager after (`wordsId`).
   *
   * - A token that is not the one shown to them, or expired: refused, and the
   *   words are discarded.
   * - Words that do not match: `SharedFolderWordsMismatchError`; nothing is
   *   saved and the words still wait, to be typed again.
   * - The first set: recorded as `shared-folder-words-create`, then saved.
   *   Refused when a set was saved meanwhile.
   * - A new set (#2144): asks the fresh sign-in again, seals every folder key
   *   again for the new words from its server-key wrap, records
   *   `shared-folder-words-replace`, then writes the new set and the sealed
   *   keys as one file renamed into place: the old words stop opening the
   *   folders, and on any failure before that the old set stays as it was.
   *   Refused when the saved set changed meanwhile.
   *
   * Each record is on-failure refuse, written before the save.
   *
   * @returns Which set of words was saved (`recoveryWordsId`)
   */
  async saveRecoveryWords(ctx: ActorContext, token: string, typed: string): Promise<string> {
    await this.requireAdmin(ctx);
    const wrapKey = this.requireUsable();
    const shown = this.livePending(ctx);
    if (!shown || shown.token !== token) {
      this.pending.delete(ctx.username);
      throw new SharedFolderRefusedError('Those recovery words are no longer waiting to be saved. Nothing was saved; make a new set');
    }
    if (!sameMnemonic(typed, shown.mnemonic)) throw new SharedFolderWordsMismatchError();
    if (shown.replaces !== null) await this.requireFreshSignIn(ctx);
    return this.serial.run(KEYS_FILE, async () => {
      const current = this.file?.recovery ?? null;
      const changed = shown.replaces === null ? current !== null : !current || recoveryWordsId(current) !== shown.replaces;
      if (changed) {
        this.pending.delete(ctx.username);
        throw new SharedFolderRefusedError(shown.replaces === null
          ? 'The shared folders already have recovery words'
          : 'The shared folders\' recovery words changed while these were waiting. Nothing was saved; make a new set');
      }
      const recovery: RecoveryRecord = { recoveryWrap: shown.recoveryWrap, personKey: shown.personKey, madeAt: new Date(shown.madeAt).toISOString(), shownTo: ctx.username };
      const wordsId = recoveryWordsId(recovery);
      const file = this.fileOrNew();
      const who = actorOf(ctx);
      const sink = this.engine.getManager<AuditEventSink>('AuditManager');
      // Record first, then save: a failed record refuses and nothing is written.
      if (shown.replaces === null) {
        await recordAuditEvent(sink, {
          eventType: AUDIT_EVENT.SHARED_FOLDER_WORDS_CREATE,
          ...who,
          action: 'shared-folder-words-create',
          result: 'success',
          severity: 'high',
          resource: 'shared-folders',
          resourceType: 'shared-folders-recovery-words',
          metadata: { ...who.metadata, wordsId }
        });
        await this.writeKeysFile({ ...file, recovery });
      } else {
        const folders = await this.sealedForWords(file.folders, wrapKey, recovery, wordsId);
        await recordAuditEvent(sink, {
          eventType: AUDIT_EVENT.SHARED_FOLDER_WORDS_REPLACE,
          ...who,
          action: 'shared-folder-words-replace',
          result: 'success',
          severity: 'high',
          resource: 'shared-folders',
          resourceType: 'shared-folders-recovery-words',
          metadata: { ...who.metadata, wordsId, replaces: shown.replaces, folders: Object.keys(folders).length }
        });
        await this.writeKeysFile({ ...file, recovery, folders });
      }
      this.pending.delete(ctx.username);
      logger.info(`🗝️  [SharedFolderManager] ${shown.replaces === null ? 'the shared folders\' recovery words were made' : 'a new set of the shared folders\' recovery words replaced the old one'}, shown to ${ctx.username}`);
      return wordsId;
    });
  }

  /**
   * Every folder key in `folders`, its recovery copy sealed again for the
   * words of `recovery` (#2144), opened with the server key. Nothing is
   * written; a key that cannot be opened throws, and the caller keeps the
   * old set.
   */
  private async sealedForWords(folders: Record<string, FolderKeyRecord>, wrapKey: Buffer, recovery: RecoveryRecord, wordsId: string): Promise<Record<string, FolderKeyRecord>> {
    const out: Record<string, FolderKeyRecord> = {};
    for (const [name, entry] of Object.entries(folders)) {
      const dek = unwrapDek(wrapKey, { encrypt: true, dekWrap: entry.serverWrap });
      try {
        out[name] = { ...entry, recoveryCopy: await sealKekCopy(recovery.personKey.publicKey, dek), wordsId };
      } finally {
        dek.fill(0);
      }
    }
    return out;
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
   * (slice 3). A new folder is opened by admins (`shared-folder-admin`) and
   * read by executives (`shared-folder-executive-read`), and by nobody else
   * until a policy names `shared/<name>`; `default` is shipped open to every
   * signed-in user.
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
   * Make the shipped folders (`SHIPPED_SHARED_FOLDERS`: `/shared/default` and
   * `/shared/executive`) that are not there yet, once they can be made: the
   * recovery words are confirmed. Finishing the words does this, and so does
   * every start (`ensureShippedFoldersAtBoot`), so a site that confirmed its
   * words before a shipped folder existed gets it on its next start.
   * Idempotent. Returns the folders made now.
   */
  async ensureShippedFolders(ctx: ActorContext): Promise<string[]> {
    const missing = SHIPPED_SHARED_FOLDERS.filter((name) => !this.folderNames().includes(name));
    if (missing.length === 0 || !(await this.recoveryWordsConfirmed())) return [];
    for (const name of missing) await this.createFolder(ctx, name);
    return missing;
  }

  /**
   * At start, make the shipped folders a site with confirmed words does not
   * have yet (#2095), under the system context. Best-effort: a failure is
   * logged and never blocks start-up; nothing is tried while the keys cannot
   * be used.
   */
  async ensureShippedFoldersAtBoot(): Promise<void> {
    if (this.unavailable) return;
    try {
      const made = await this.ensureShippedFolders(systemContext(this.engine, 'make the shipped shared folders a site with confirmed recovery words does not have yet (#2095)'));
      if (made.length > 0) logger.info(`🗂️  [SharedFolderManager] Made the shipped shared folder(s) ${made.map((n) => `/shared/${n}`).join(', ')} at start`);
    } catch (err) {
      logger.warn(`[SharedFolderManager] The shipped shared folders were not made at start: ${err instanceof Error ? err.message : String(err)}`);
    }
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

  // ── Access, as the Shared folders screen sets it (#2126) ─────────────────

  /**
   * Who may read and who may file in folder `name`, as the Shared folders
   * screen set it: the roles its own policies (`shared-folder-access-<name>-read`
   * / `-file`, in the site's custom configuration, in the shape the screen
   * writes) name, and every other policy in force that reaches the folder,
   * shown as it is, matched as PolicyEvaluator matches it. A policy with one of
   * the screen's ids that the screen did not write is shown, marked
   * `reserved`. `admin-system`, as the screen is. Display only: the PDP
   * decides every access.
   */
  async folderAccess(ctx: ActorContext, name: string): Promise<SharedFolderAccess & { others: SharedFolderOtherPolicy[] }> {
    await this.requireAdmin(ctx);
    const evaluator = this.engine.getManager<PolicyEvaluator>('PolicyEvaluator');
    if (!evaluator) throw new SharedFoldersUnavailableError('There is no policy evaluator to say which policies reach the folder');
    const { own, reserved, inForce } = this.accessState(name);
    const resource = sharedFolderResource(name);
    const ownIds = new Set([accessPolicyId(name, 'read'), accessPolicyId(name, 'file')]);
    // As the PDP asks it (permitsInSharedFolder): the folder as the page name and as the attribute.
    const actionsOf = (p: Policy): string[] => [SHARED_FOLDER_READ, SHARED_FOLDER_FILE].filter((a) => evaluator.matchesAction(p.actions, a));
    const reaches = (p: Policy): boolean => actionsOf(p).length > 0 && evaluator.matchesResource(p.resources, resource, { [SHARED_FOLDER_RESOURCE_TYPE]: resource });
    return {
      read: rolesOf(own.read),
      file: rolesOf(own.file),
      others: inForce
        .filter((p) => reserved.includes(p.id) || (!ownIds.has(p.id) && reaches(p)))
        .map((p) => ({
          id: p.id,
          name: p.name ?? p.id,
          effect: p.effect === 'deny' ? 'deny' : 'allow',
          subjects: (p.subjects ?? []).map((x) => `${x.type}:${x.value}`),
          actions: actionsOf(p),
          reserved: reserved.includes(p.id)
        }))
    };
  }

  /** The roles a folder's access may name: every role there is but `anonymous`, by name. */
  grantableRoles(): string[] {
    const roles = this.engine.getManager<ConfigurationManager>('ConfigurationManager')?.getProperty(ROLES_KEY, {});
    return Object.keys(roles && typeof roles === 'object' ? roles : {}).filter((r) => r !== ANONYMOUS_ROLE).sort();
  }

  /**
   * Set who may read and who may file in folder `name` (#2126, decision 8):
   * writes the site's policies `shared-folder-access-<name>-read` (granting
   * `shared-folder-read` on `shared/<name>`) and `-file` (`shared-folder-file`)
   * to the roles given, through ConfigurationManager, and removes one whose
   * list is empty. `admin-system`, with a fresh sign-in (the step-up
   * permission, as every other configuration write asks). Refused for a folder
   * that does not exist, a role that does not exist, `anonymous` (a folder is
   * never public), and a folder one of whose ids holds a policy the screen did
   * not write (it is never overwritten). Recorded as
   * `shared-folder-access-change` (who, the folder, the roles before and
   * after) once the write has succeeded; a failed write is recorded as a
   * failure, and a record that cannot be written puts the policies back
   * (on-failure refuse). ConfigurationManager records the configuration
   * change as well. Nothing is written or recorded when nothing changes.
   * Returns whether it changed.
   *
   * Only the screen's own policies change: a shipped or add-on policy, or one
   * the site wrote elsewhere, still applies (`folderAccess` shows them).
   */
  async setFolderAccess(ctx: ActorContext, name: string, access: SharedFolderAccess): Promise<boolean> {
    await this.requireAdmin(ctx);
    await this.requireFreshSignIn(ctx, 'change who may read and file in a shared folder');
    if (!this.folderNames().includes(name)) throw new SharedFolderRefusedError(`There is no shared folder '${name}'`);
    const known = new Set(this.grantableRoles());
    const tidy = (roles: string[]): string[] => [...new Set(roles)].sort();
    const next: SharedFolderAccess = { read: tidy(access.read), file: tidy(access.file) };
    for (const role of [...next.read, ...next.file]) {
      if (role === ANONYMOUS_ROLE) throw new SharedFolderRefusedError('A shared folder is never opened to anonymous visitors');
      if (!known.has(role)) throw new SharedFolderRefusedError(`There is no role '${role}'`);
    }
    const config = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!config) throw new SharedFoldersUnavailableError('There is no configuration to write the folder\'s policies to');
    // One change at a time, so two admins saving at once do not lose either's.
    return this.serial.run(POLICIES_KEY, async () => {
      const { own, reserved } = this.accessState(name);
      if (reserved.length > 0) {
        throw new SharedFolderRefusedError(`Policy ${reserved.map((id) => `'${id}'`).join(' and ')} has an id this screen keeps for /shared/${name}, and this screen did not write it. Nothing was saved. Rename or remove it in Admin → Configuration first`);
      }
      const before: SharedFolderAccess = { read: rolesOf(own.read), file: rolesOf(own.file) };
      if (before.read.join() === next.read.join() && before.file.join() === next.file.join()) return false;
      // Every entry the site has, those without an id included: only the screen's two for this folder change.
      const site = this.siteAccessPolicies();
      const ours = new Set([accessPolicyId(name, 'read'), accessPolicyId(name, 'file')]);
      const written = [
        ...site.filter((p) => !(p && typeof p === 'object' && ours.has((p as Policy).id))),
        ...(['read', 'file'] as const).filter((kind) => next[kind].length > 0).map((kind) => accessPolicy(name, kind, next[kind]))
      ];
      const who = actorOf(ctx);
      const record = (result: 'success' | 'failure', error?: string): Promise<unknown> => recordAuditEvent(this.engine.getManager<AuditEventSink>('AuditManager'), {
        eventType: AUDIT_EVENT.SHARED_FOLDER_ACCESS_CHANGE,
        ...who,
        action: 'shared-folder-access-change',
        result,
        severity: 'high',
        resource: sharedFolderResource(name),
        resourceType: 'shared-folder',
        metadata: { ...who.metadata, folder: name, before, after: next, ...(error ? { error } : {}) }
      });
      // Never an empty list: it would replace every shipped policy (ConfigurationManager.setProperty).
      const put = (list: unknown[]): Promise<unknown> => config.setProperty(POLICIES_KEY, list.length > 0 ? list : undefined, ctx);
      try {
        await put(written);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        await record('failure', error).catch((auditErr: unknown) => logger.error(`[SharedFolderManager] could not record the failed access change of '${name}': ${String(auditErr)}`));
        throw err;
      }
      try {
        await record('success');
      } catch (err) {
        // on-failure refuse: the change does not stand without its record.
        await put(site);
        throw err;
      }
      logger.info(`🗂️  [SharedFolderManager] ${ctx.username} set who may read (${next.read.join(', ') || 'nobody'}) and file (${next.file.join(', ') || 'nobody'}) in shared folder '${name}'`);
      return true;
    });
  }

  /**
   * Folder `name`'s access as the screen sees it: the screen's own policies
   * (the site's entry under each id, in the shape `accessPolicy` writes), the
   * ids holding a policy the screen did not write (the site's in another
   * shape, a deny say, or one in force from a shipped or add-on layer), and
   * the policies in force.
   */
  private accessState(name: string): { own: { read?: Policy; file?: Policy }; reserved: string[]; inForce: Policy[] } {
    const site = this.siteAccessPolicies().filter((p): p is Policy => !!p && typeof p === 'object' && typeof (p as Policy).id === 'string');
    const inForce = this.engine.getManager<{ policies(): Policy[] }>('PolicyDecisionPoint')?.policies() ?? [];
    const own: { read?: Policy; file?: Policy } = {};
    const reserved: string[] = [];
    for (const kind of ['read', 'file'] as const) {
      const id = accessPolicyId(name, kind);
      const mine = site.find((p) => p.id === id);
      const live = inForce.find((p) => p.id === id);
      if ((mine && !isScreenPolicy(mine, name, kind)) || (live && (!mine || !isScreenPolicy(live, name, kind)))) reserved.push(id);
      else if (mine) own[kind] = mine;
    }
    return { own, reserved, inForce };
  }

  /** The site's own entries of the access policies (the custom configuration layer), as they are: never the shipped or an add-on's. */
  private siteAccessPolicies(): unknown[] {
    const raw = this.engine.getManager<ConfigurationManager>('ConfigurationManager')?.getCustomProperty(POLICIES_KEY);
    return Array.isArray(raw) ? raw : [];
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

  /**
   * The fresh sign-in a new set of words (#2144) and an access change (#2126)
   * need: the PDP applies step-up to `FRESH_SIGN_IN_PERMISSION`, and never
   * grants it to a delegated credential (an agent token).
   */
  private async requireFreshSignIn(ctx: ActorContext, what = 'make a new set of the shared folders\' recovery words'): Promise<void> {
    const pdp = this.engine.getManager<Pdp>('PolicyDecisionPoint');
    if (!ctx?.username || !pdp || !(await pdp.permits(ctx, FRESH_SIGN_IN_PERMISSION))) {
      throw new SharedFolderRefusedError(`${ctx?.username ?? 'Nobody'} may not ${what} without a fresh sign-in (needs ${FRESH_SIGN_IN_PERMISSION})`);
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
