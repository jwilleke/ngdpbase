import path from 'path';
import type { Readable } from 'stream';
import { create as createTar } from 'tar';
import BaseManager, {
  type BackupData as BaseBackupData, type BackupFolder, type StagedRestoreAtStart, type StagedSwap
} from './BaseManager.js';
import type DatabaseManager from './DatabaseManager.js';
import { actorOf, type ActorContext } from '../context/ActorContext.js';
import zlib from 'zlib';
import { promisify } from 'util';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type BackgroundJobManager from './BackgroundJobManager.js';
import type { JobDefinition } from './BackgroundJobManager.js';
import { parseSchedule, type Schedule, type ScheduleInput } from '../utils/schedule.js';
import type BaseBackupProvider from '../providers/BaseBackupProvider.js';
import { recordAuditEvent } from '../utils/auditEvents.js';
import { AUDIT_EVENT } from '../utils/auditEventNames.js';
import {
  applyPartAtStart, beginSiteRestore, commitSiteRestore, discardSiteRestore, finishSiteRestoreAtBoot, gatePart, markPart, readSiteRestore, siteRestoreFile,
  stagedPathFor, stagingFor,
  type SiteRestoreManifest
} from '../utils/siteRestore.js';
import { encryptBuffer, ENCRYPTED_SUFFIX } from '../utils/backupCrypto.js';
import { readBackupDocument, verifyBackupOffThread, type BackupDocument } from '../utils/backupDocument.js';
import { BACKUP_KEY_ENV, backupKeyFingerprint, currentBackupKey, isLeftOutForNoKey, LEFT_OUT_FOR_NO_KEY } from '../utils/backupKey.js';
import {
  applyDeclaredPartsAtStart, archiveReader, archiveTarget, archiveWriter, backupDeclaredParts, placePartRecords, stageDeclaredParts, stageFilePart,
  type DirectoryBackupData
} from '../utils/directoryBackup.js';
import { writeTreeArchive } from '../utils/treeArchive.js';
import { envForBackup, envKeyNames, envKeyNamesFingerprint, INSTANCE_ENV_PART, instanceEnvPath } from '../utils/instanceEnvBackup.js';
import { readEnvLine } from '../utils/instanceEnvSecret.js';
import { systemContext } from '../context/bootActions.js';
import type { JobRunSince } from './BackgroundJobManager.js';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, readFile as readFileAsync, writeFile as writeFileAsync } from 'node:fs/promises';

const gzip = promisify(zlib.gzip);

/**
 * Backup options
 */
export interface BackupOptions {
  filename?: string;
  compress?: boolean;
  /**
   * Leave retention for the next backup (#1723). The backup a restore takes
   * of the live data first sets it, so that backup can never prune the very
   * backup being restored.
   */
  skipCleanup?: boolean;
  /** Throw when any part of the backup failed, after saying so (#1723): a restore stages nothing without a whole copy of the live data. */
  requireComplete?: boolean;
  /** This is a restore's backup of the live data (#1892 D2); handed to every manager as `safetyBackup`. */
  safetyBackup?: boolean;
}

/**
 * Restore options
 */
/** What a restore started from Admin → Backup puts back (#1945): the whole site, or the databases only. */
export type RestoreScope = 'site' | 'databases';

export interface RestoreOptions {
  skipValidation?: boolean;
  managerFilter?: string[];
  /** Replace a database restore staged earlier and not applied yet (#1723, D5); refused without it. */
  replaceStaged?: boolean;
}

/** A backup in the backup directory, as Admin → Backup lists it for download and restore (#1723). */
export interface StoredBackup extends BackupFileInfo {
  /** The database files beside the document, by name (`application`, `addon-<owner>`). */
  databases: string[];
  /** The file archives beside the document, by part (`attachments`, `roles`, …) (#1876). */
  parts: string[];
  /** Every file beside the document, by filename: what a download carries with it. */
  files: string[];
  /** Whether the document is encrypted under the backup key (#1561): its name ends `.enc`. */
  encrypted: boolean;
  /** The document and every file beside it together, in bytes. */
  totalSize: number;
}

/** Backup data structure: the document (`src/utils/backupDocument.ts`). */
export type BackupData = BackupDocument;

/**
 * Restore results
 */
export interface RestoreResults {
  success: string[];
  failed: Array<{ manager: string; error: string }>;
  skipped: string[];
}

/**
 * Backup file information
 */
export interface BackupFileInfo {
  filename: string;
  path: string;
  size: number;
  created: Date;
  modified: Date;
}

/**
 * BackupManager - Coordinates backup and restore operations across all managers
 *
 * Orchestrates system-wide backup and restore by calling backup()/restore()
 * on all registered managers and aggregating their data into compressed archives.
 *
 * Responsibilities:
 * - Call backup() on all registered managers
 * - Aggregate backup data into a single .gz file
 * - Restore from .gz backup file
 * - Call restore() on all registered managers
 *
 * Architecture:
 * - Each manager implements backup() to return its state
 * - BackupManager collects all states into one object
 * - Serializes to JSON and compresses with gzip
 * - Stores as single .gz file
 *
 * @class BackupManager
 * @extends BaseManager
 *
 * @property {string|null} backupDirectory - Directory for backup files
 * @property {number} maxBackups - Maximum number of backups to retain
 *
 * @see {@link BaseManager} for base functionality and backup() pattern
 *
 * @example
 * const backupManager = engine.getManager('BackupManager');
 * const backupPath = await backupManager.createBackup(wikiContext.userContext);
 * console.log('Backup created:', backupPath);
 */
/** Auto-backup schedule configuration */
export interface AutoBackupConfig {
  enabled: boolean;
  time: string;       // HH:MM (24-hour)
  days: string;       // "daily" | "monthly" | comma-separated day names e.g. "Mon,Wed,Fri"
  maxBackups: number;
  directory: string;
}

/**
 * A backup document's filename without `.json.gz` / `.json` (#1723). A
 * manager's own files beside the document are named `<stem>.<name>.db` (a
 * database, #1723) or `<stem>.<part>.tar` (a folder of files, #1876), and are
 * pruned and downloaded with it.
 */
export function backupStem(filename: string): string {
  return filename.replace(/\.json(\.gz)?(\.enc)?$/, '');
}

/** Whether `filename` is one of the files a manager wrote beside the document named `documentFilename` (#1723); a file archive may be encrypted, `.tar.enc` (#1561). */
export function isCompanionOf(filename: string, documentFilename: string): boolean {
  return filename.startsWith(`${backupStem(documentFilename)}.`) && (filename.endsWith('.db') || filename.endsWith('.tar') || filename.endsWith(`.tar${ENCRYPTED_SUFFIX}`));
}

/**
 * What no backup holds, so no restore brings back (#1876), in the words
 * admins read: these stay as they are on the site. The backup-restore guide
 * and the Backup help page list the same.
 */
export const NEVER_IN_A_BACKUP: readonly string[] = [
  'shares (share links stay as they are)',
  'notifications',
  'sign-in sessions',
  'the backup key itself, and the database key (both stay as they are on this site)',
  'TLS certificate files',
  'the media library and its index'
];

/** How the "not restored" notification names a manager's data (#1876); a manager not listed is named as it is. */
const RESTORE_LABELS: Record<string, string> = {
  PageManager: 'pages (with their history, trash and private stores)',
  UserManager: 'user accounts',
  ConfigurationManager: 'settings',
  SearchManager: 'the search index (rebuild it from the pages)',
  CatalogManager: 'the user keywords vocabulary',
  AddonsManager: 'the add-on list',
  AgentTokenManager: 'agent tokens',
  OidcManager: 'OpenID Connect grants',
  AuthManager: 'the credentials store (passkeys, verified email and phone, devices, linked identities, proxy grants)',
  AuditManager: 'the audit log',
  BackgroundJobManager: 'scheduled-job state',
  AttachmentManager: 'attachment files',
  RoleManager: 'role membership',
  // IdentityManager's entry keeps its old name (#2038, MANAGER_ENTRY_NAMES).
  PersonManager: 'identity records (of users and contacts)',
  OrganizationManager: 'organizations',
  FootnoteManager: 'footnotes on public pages',
  CommentManager: 'comments on public pages',
  DatabaseManager: 'the databases',
  BackupManager: 'the instance .env (the keys and secrets in it)',
  FormsDataManager: 'forms and their submissions',
  CalendarDataManager: 'calendars',
  FeedManager: 'feed records'
};

/**
 * The entry an add-on's files go under in the backup document (#1985). The
 * bundled add-ons keep the name their manager wrote before the declaration
 * (v5.21 to v5.25), so an old backup restores and a v5.25.0 site can
 * restore a new one; any other add-on's is `addon:<slug>`, which no manager
 * name can be.
 */
const ADDON_ENTRY_NAMES: Readonly<Record<string, string>> = {
  forms: 'FormsDataManager',
  calendar: 'CalendarDataManager',
  feeds: 'FeedManager'
};

/**
 * A core manager renamed after its entry was first written keeps that entry
 * (#2038): IdentityManager was PersonManager, and its part is still recorded
 * as `PersonManager` in the backup document and the site restore record, so
 * an old backup restores and an older site can restore a new one. Keyed by
 * the registered name; an entry is a stored name, never renamed.
 */
const MANAGER_ENTRY_NAMES: Readonly<Record<string, string>> = {
  IdentityManager: 'PersonManager'
};

/** The backup entry a registered manager's part is recorded under (#2038): its name, unless it was renamed. */
export function managerEntryName(registered: string): string {
  return Object.hasOwn(MANAGER_ENTRY_NAMES, registered) ? MANAGER_ENTRY_NAMES[registered] : registered;
}

/** The registered manager a backup entry belongs to (#2038): the inverse of {@link managerEntryName}. */
function registeredNameOf(entry: string): string {
  return Object.entries(MANAGER_ENTRY_NAMES).find(([, e]) => e === entry)?.[0] ?? entry;
}

/** The backup document entry, and the site restore part, an add-on's files are recorded under (#1985). */
export function addonEntryName(slug: string): string {
  return ADDON_ENTRY_NAMES[slug] ?? `addon:${slug}`;
}

/**
 * Put a staged restore of a manager's declared folders and files in place,
 * at start, before it reads them (#1985). BackupManager's step: a manager
 * reaches it through `BaseManager.initialize()`, an add-on's folders through
 * AddonsManager before the add-on's `register()`. A module function, not a
 * method, because most managers start before BackupManager does; it needs
 * only the configuration, for the site restore manifest.
 */
export function applyStagedPartsAtStart(engine: WikiEngine, manager: string, declared: BackupFolder[]): StagedRestoreAtStart | null {
  const configManager = engine?.getManager?.<ConfigurationManager>('ConfigurationManager');
  if (!configManager) return null;
  return applyDeclaredPartsAtStart(managerEntryName(manager), declared, configManager);
}

/** The site restore manifest's file, as configured; a module function for the start, before BackupManager exists (#1986). */
function manifestFileOf(engine: WikiEngine): string {
  return siteRestoreFile(engine?.getManager?.<ConfigurationManager>('ConfigurationManager'));
}

/** How a manager whose restore is staged (`restoreIsStaged()`) puts its part in place at start (#1986). */
export interface StagedPartAtStartOptions {
  /** Whether this manager may replace that live path: a manifest naming any other is refused, whatever it says. */
  allowed: (swap: StagedSwap) => boolean;
  /** The live paths of this manager's that may have a staged copy beside them: one no committed restore names (an interrupted staging) is set aside. */
  mayBeStaged?: () => string[];
  /**
   * Put one swap in place yourself, instead of the rename: for a part whose
   * live path is not a file or folder of its own (the audit files share the
   * log folder). Move the live content to `kept` and the staged one in;
   * throw to refuse.
   */
  put?: (swap: StagedSwap, kept: string) => void;
}

/**
 * Put `manager`'s part of a staged site restore in place, at start, before
 * it reads its data (#1876, #1986): when the whole restore is there to
 * apply, each live path steps aside as `<live>.pre-restore` and the staged
 * copy takes its name; otherwise its staged files are set aside as
 * `*.incomplete`. The part is marked in BackupManager's record either way.
 * For a manager whose restore is staged by its own `restore()` (the
 * attachments, the audit log); declared folders and files go through
 * `applyStagedPartsAtStart`. A module function: most managers start before
 * BackupManager. Null when there was nothing to do.
 */
export function applyStagedPartAtStart(engine: WikiEngine, manager: string, options: StagedPartAtStartOptions): StagedRestoreAtStart | null {
  return applyPartAtStart(manifestFileOf(engine), manager, {
    allowed: options.allowed,
    strays: () => (options.mayBeStaged?.() ?? []).map(stagedPathFor).filter((p) => existsSync(p)),
    ...(options.put ? { put: options.put } : {})
  });
}

/**
 * BackupManager's answer, at start, for a manager that applies a staged
 * restore of its own kind (the databases, #1723): whether its part of a
 * staged site restore is to go in now (#1876, #1986).
 *
 * - `none` — no site restore names it: the manager does as it would alone.
 * - `apply` — the whole restore is there: put it in, then `settle` it.
 * - `set-aside` — it isn't (`reason`): set the staged files aside, then `settle` it.
 */
export interface SiteRestorePartAtStart {
  decision: 'none' | 'apply' | 'set-aside';
  reason?: string;
  /** Record what became of the part. Nothing to record for `none`, or a set-aside with no part of this manager's. */
  settle(status: 'applied' | 'set-aside', note?: string): void;
}

/** BackupManager's start-time gate on `manager`'s part of a staged site restore (#1986): see {@link SiteRestorePartAtStart}. */
export function siteRestorePartAtStart(engine: WikiEngine, manager: string): SiteRestorePartAtStart {
  const file = manifestFileOf(engine);
  const gate = gatePart(file, manager);
  const named = gate.decision === 'apply' || (gate.decision === 'set-aside' && Boolean(gate.part));
  return {
    decision: gate.decision,
    ...(gate.decision === 'set-aside' ? { reason: gate.reason } : {}),
    settle: (status, note) => {
      if (named) markPart(file, manager, status, note);
    }
  };
}

/** Managers whose backup entry holds nothing of the site's own: never named as not restored. */
const NO_SITE_DATA: ReadonlySet<string> = new Set(['ImportManager']);

/** Whether a manager's backup entry holds anything: an error, or a field beyond the bookkeeping every entry has. */
function slotHoldsData(slot: unknown): boolean {
  if (!slot || typeof slot !== 'object') return false;
  return Object.entries(slot as Record<string, unknown>)
    .some(([key, value]) => !['managerName', 'timestamp', 'note', 'warnings'].includes(key) && value !== null && value !== undefined);
}

/** A manager's data as the "not restored" notification names it. */
export function restoreLabel(manager: string): string {
  if (manager.startsWith('addon:')) return `the ${manager.slice('addon:'.length)} add-on's files`;
  return RESTORE_LABELS[manager] ?? manager;
}

/**
 * What a staged restore will not bring back, written when it is staged (#1876)
 * and read once it has been applied, for the critical notification: kept by
 * BackupManager beside the site restore manifest, as `<manifest>.report.json`.
 */
export interface RestoreReport {
  version: 1;
  source: string;
  /** When the backup was taken. */
  backup: string;
  /** The backup's parts that were not staged, by manager. */
  notRestored: string[];
  /** The job runs since the backup, read from the live job state when the restore was staged. */
  jobRuns: JobRunSince[];
  /** Who started the restore. */
  stagedBy?: string;
}

/** BackupManager's fault, and the dashboard banner, while there is no backup key (#1561, #1912). */
export const BACKUP_KEY_MISSING = `${BACKUP_KEY_ENV} is not set, so backups are NOT encrypted: the document (password hashes, settings with their secrets) and the file archives beside it are in the clear, and the credentials store, the databases and the instance .env are left out`;
/** The title of the one notification about it. */
export const BACKUP_KEY_MISSING_TITLE = 'Backups are not encrypted';

/**
 * The config key that records an admin's confirmation that the backup key is
 * saved off the server (#1876): the fingerprint of the key they saved. A
 * different key (a new one made, or one replaced) asks again.
 */
export const BACKUP_KEY_SAVED_KEY = 'ngdpbase.backup.key-saved-fingerprint';

/** The banner while no admin has confirmed the backup key is saved off the server (#1876). */
export function backupKeyNotSaved(fingerprint: string): string {
  return `Save the backup key off this server: Admin → Backup shows it (fingerprint ${fingerprint}). Every backup is encrypted with it, and a restore on a new server needs it. This stays until an admin confirms it is saved`;
}

/**
 * The config key that records the names (never the values) the instance
 * `.env` set when an admin last confirmed it is saved off the server (#1976),
 * sorted. Null until the first check records the baseline. The names, not
 * only their fingerprint, so the reminder can say which keys were added or
 * removed.
 */
export const ENV_KEYS_SAVED_KEY = 'ngdpbase.backup.env-keys-saved';

/** The title of the one notification per change of the `.env` key set (#1976). */
export const ENV_KEYS_CHANGED_TITLE = 'Save a copy of .env';

const ENV_KEYS_CHANGED_PREFIX = 'The keys in .env changed since an admin last saved it';
const KEY_NOT_SAVED_PREFIX = 'Save the backup key off this server';

/** The banner while the instance `.env` sets other names than the ones an admin last confirmed saved (#1976): names only, never a value. */
export function envKeysChanged(change: { added: readonly string[]; removed: readonly string[] }): string {
  const parts = [
    ...(change.added.length > 0 ? [`added: ${change.added.join(', ')}`] : []),
    ...(change.removed.length > 0 ? [`removed: ${change.removed.join(', ')}`] : [])
  ];
  return `${ENV_KEYS_CHANGED_PREFIX} (${parts.join('; ')}). Download .env on Admin → Backup and keep the copy off this server. This stays until an admin confirms it is saved`;
}

/** What Admin → Backup shows about the instance `.env` key set (#1976): names only, never a value. */
export interface EnvKeysInfo {
  /** The names the file sets now, sorted. */
  names: string[];
  /** Their fingerprint, posted back with the confirmation so a stale page is refused. */
  fingerprint: string;
  /** Whether a set has been recorded at all: false only before the first check. */
  recorded: boolean;
  /** Names set now that were not when an admin last confirmed. */
  added: string[];
  /** Names an admin confirmed that the file no longer sets. */
  removed: string[];
  /** The file holds this site's current backup key, so a saved copy is a saved key too. */
  holdsBackupKey: boolean;
}

/** What Admin → Backup shows about the backup key: never the key itself. */
export interface BackupKeyInfo {
  set: boolean;
  fingerprint: string | null;
  /** An admin confirmed this key is saved off the server. */
  saved: boolean;
}

/** The scheduled job automatic backups run as (#1720). */
export const AUTO_BACKUP_JOB_ID = 'backup.auto';

/** The routine check that backups are still happening (#1563). */
export const BACKUP_HEALTH_JOB_ID = 'backup.health';

/** The title of the notification sent when backups stop working (#1563): a backup failed, or none is recent enough. */
export const BACKUPS_NOT_WORKING_TITLE = 'Backups are not working';

const DAY_MS = 86_400_000;

/** A backup that failed (#1563), as kept in the health record until a backup succeeds. */
export interface BackupFailure {
  /** When it failed, ISO 8601. */
  at: string;
  /** Why, in words an admin can act on. */
  reason: string;
  /** The document that was written anyway (a backup with a part missing), so it is not counted as good. */
  filename?: string;
}

/**
 * What BackupManager keeps across restarts about whether backups work
 * (#1563): `ngdpbase.backup.health-file`. The last good backup is never
 * stored here — it is read from the backup directory every time.
 */
interface BackupHealthRecord {
  version: 1;
  failure?: BackupFailure;
  /** The last good backup (its time, or `never`) the "no recent backup" notification was sent for: once per stretch. */
  staleNotified?: string;
}

/** Whether backups are working, as Admin → Backup and the /admin dashboard show it (#1563). */
export interface BackupHealth {
  /** The newest backup in the backup directory that is not a failed one: when, how big (with the files beside it), where. */
  lastGood: { filename: string; at: string; size: number; location: string } | null;
  /** Automatic backups are on and scheduled. */
  autoBackup: boolean;
  /** The next automatic backup, ISO 8601, or null. */
  nextRun: string | null;
  /** Free bytes at the backup destination, or null when it can't be told. */
  freeBytes: number | null;
  /** The backup that failed, until one succeeds. */
  failure: BackupFailure | null;
  /** How long the site may go without a good backup before that is an outage, in ms. */
  staleAfterMs: number;
  /** No good backup within `staleAfterMs`, or none at all. */
  stale: boolean;
  /** The outage, in one line, while backups are not working; null when they are. */
  fault: string | null;
}

/** A number of bytes as admins read it. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, Math.round(bytes || 0))} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

/** Why a backup could not be written, in words an admin can act on: the system's error codes named (#1563). */
export function describeBackupError(err: unknown): string {
  const e = err as NodeJS.ErrnoException;
  const message = e?.message ?? String(err);
  switch (e?.code) {
  case 'ENOSPC': return `the backup destination is out of space (${message})`;
  case 'EDQUOT': return `the backup destination is over its quota (${message})`;
  case 'EACCES':
  case 'EPERM': return `permission denied writing to the backup destination (${message})`;
  case 'EROFS': return `the backup destination is read-only (${message})`;
  case 'ENOENT': return `the backup destination is not there (${message})`;
  case 'EIO': return `the backup destination reported a write error (${message})`;
  default: return message;
  }
}

/**
 * The longest gap between two runs of a schedule (#1563): what "the
 * auto-backup interval" is for a schedule that is not evenly spaced (Monday,
 * Wednesday and Friday is three days at its longest; monthly is 31). Counted
 * over the next year's runs, at most 400 of them.
 */
export function longestGapMs(schedule: Schedule, from: Date): number {
  let previous = schedule.nextSlot(from);
  let longest = 0;
  const until = from.getTime() + 400 * DAY_MS;
  for (let i = 0; previous && i < 400 && previous.getTime() < until; i++) {
    const next = schedule.nextSlot(previous);
    if (!next) break;
    longest = Math.max(longest, next.getTime() - previous.getTime());
    previous = next;
  }
  return longest;
}

const BYDAY: Record<string, string> = { sun: 'SU', mon: 'MO', tue: 'TU', wed: 'WE', thu: 'TH', fri: 'FR', sat: 'SA' };

/**
 * The automatic-backup settings as a schedule (#1720): `ngdpbase.backup.auto-backup-time`
 * (HH:MM) and `ngdpbase.backup.auto-backup-days` — `daily`, `monthly` (the 1st),
 * `weekdays` (Monday to Friday), or day names such as `Mon,Wed,Fri`.
 *
 * In `timeZone`: the server's own, because the timer this replaces compared
 * the server's local clock, so an existing setting keeps its time.
 *
 * Throws, naming the setting, for a time or a day it does not understand. The
 * timer this replaces matched neither, so such a setting never backed up, and
 * said nothing.
 */
export function autoBackupSchedule(time: string, days: string, timeZone: string): ScheduleInput {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time).trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) {
    throw new Error(`ngdpbase.backup.auto-backup-time '${time}' is not a time of day (HH:MM)`);
  }
  const at = `BYHOUR=${Number(m[1])};BYMINUTE=${Number(m[2])}`;
  const value = String(days).trim().toLowerCase();
  if (value === 'daily') return { rrule: `FREQ=DAILY;${at}`, tz: timeZone };
  if (value === 'monthly') return { rrule: `FREQ=MONTHLY;BYMONTHDAY=1;${at}`, tz: timeZone };
  if (value === 'weekdays') return { rrule: `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;${at}`, tz: timeZone };
  const names = value.split(',').map((d) => d.trim()).filter(Boolean);
  const unknown = names.filter((d) => !(d.slice(0, 3) in BYDAY) || !'sunday monday tuesday wednesday thursday friday saturday'.split(' ').some((full) => full.startsWith(d)));
  if (names.length === 0 || unknown.length > 0) {
    throw new Error(`ngdpbase.backup.auto-backup-days '${days}' is not daily, monthly, weekdays or a list of day names (${unknown.join(', ') || 'empty'} not understood)`);
  }
  const byDay = [...new Set(names.map((d) => BYDAY[d.slice(0, 3)]))];
  return { rrule: `FREQ=WEEKLY;BYDAY=${byDay.join(',')};${at}`, tz: timeZone };
}

/** The server's own time zone: what the replaced timer's `getHours()` read. */
function serverTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** A time as admins read it: the server's local time (#1876; never UTC in a notification). */
function localTime(iso: string | undefined): string {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? new Date(t).toLocaleString() : 'an unknown time';
}

/**
 * The text of the critical "not restored" notification (#1876): what the
 * restore put back, what it did not, and per job the runs since the backup —
 * its name, when it last ran and how that ended — newest first.
 */
export function describeNotRestored(input: {
  source: string;
  backup: string;
  applied: string[];
  notRestored: string[];
  jobRuns: JobRunSince[];
  nameOf: (jobId: string) => string;
  missingReport?: boolean;
}): string {
  const lines: string[] = [];
  lines.push(`The restore from ${input.source}${input.backup ? ` (backup taken ${localTime(input.backup)})` : ''} was applied: ${input.applied.join(', ')}.`);
  const notRestored = [...input.notRestored, ...NEVER_IN_A_BACKUP];
  lines.push(`Not restored — still as they were before the restore: ${notRestored.join('; ')}.`);
  if (input.missingReport) lines.push('The record of what this restore left out could not be read, so this list may be short.');
  const byJob = new Map<string, JobRunSince[]>();
  for (const r of input.jobRuns) byJob.set(r.jobId, [...(byJob.get(r.jobId) ?? []), r]);
  if (byJob.size === 0) {
    lines.push('No scheduled job ran between the backup and the restore.');
  } else {
    const jobs = [...byJob.entries()].map(([jobId, runs]) => {
      const last = runs.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
      const result = last.status === 'completed' ? 'completed' : last.status === 'running' ? 'still running' : `${last.status}${last.error ? `: ${last.error}` : ''}`;
      return `${input.nameOf(jobId)} — last ran ${localTime(last.completedAt ?? last.startedAt)}, ${result}${runs.length > 1 ? ` (${runs.length} runs since the backup)` : ''}`;
    });
    lines.push(`Jobs that ran between the backup and the restore — their runs are not in the restored job history, and they are not run again: ${jobs.join('; ')}. Check whether any of them needs running again.`);
  }
  return lines.join(' ');
}

class BackupManager extends BaseManager {
  private backupDirectory: string | null;
  private maxBackups: number;
  private autoBackupEnabled: boolean;
  private autoBackupTime: string;   // HH:MM
  private autoBackupDays: string;   // "daily" | "monthly" | "Mon,Wed,..."
  // #170: storage target is delegated to a BackupProvider (default
  // FileBackupProvider). Orchestration/serialization stays in this manager.
  private provider: BaseBackupProvider | null;
  private providerClass: string;
  /** A restore started from Admin → Backup, while it runs (#1723). */
  private restoreRunning: Promise<RestoreResults | null> | null = null;
  /** The outage this manager set because backups are not working (#1563), so only that one is cleared when they work again. */
  private healthFault: string | null = null;
  /**
   * The end of the queue of work that reads or changes the backup directory
   * one at a time (#1563): a backup with its pruning, a restore's safety
   * backup and staging, and the routine health check (`exclusive`).
   */
  private exclusiveTail: Promise<unknown> = Promise.resolve();

  /**
   * Creates a new BackupManager instance
   *
   * @constructor
   * @param {any} engine - The wiki engine instance
   */

  constructor(engine: WikiEngine) {
    super(engine);
    this.backupDirectory = null;
    this.maxBackups = 10;
    this.autoBackupEnabled = false;
    this.autoBackupTime = '02:00';
    this.autoBackupDays = 'daily';
    this.provider = null;
    this.providerClass = 'FileBackupProvider';
  }

  /** Normalize a config provider name to its PascalCase class name. */
  private normalizeProviderName(providerName: string): string {
    if (/^[A-Z]/.test(providerName)) return providerName;
    const known: Record<string, string> = {
      filebackupprovider: 'FileBackupProvider'
    };
    return known[providerName.toLowerCase()]
      ?? providerName
        .split(/[-_]/)
        .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join('');
  }

  /**
   * Load the configured backup storage provider (#170). Mirrors the
   * dynamic-import + fallback pattern used by AuditManager / SearchManager.
   * Falls back to FileBackupProvider on any load error so backups never
   * silently lose their storage target.
   */
  private async loadProvider(): Promise<void> {
    type BackupProviderConstructor = new (engine: WikiEngine) => BaseBackupProvider;
    try {
      const mod = await import(/* @vite-ignore */ `../providers/${this.providerClass}.js`) as { default: BackupProviderConstructor };
      this.provider = new mod.default(this.engine);
      await this.provider.initialize();
    } catch (error) {
      logger.error(`Failed to load backup provider ${this.providerClass}:`, error);
      if (this.providerClass !== 'FileBackupProvider') {
        logger.warn('Falling back to FileBackupProvider');
        const mod = await import('../providers/FileBackupProvider.js') as unknown as { default: BackupProviderConstructor };
        this.provider = new mod.default(this.engine);
        await this.provider.initialize();
      } else {
        throw error;
      }
    }
  }

  /**
   * Initialize BackupManager
   *
   * @async
   * @param {Record<string, unknown>} [config={}] - Configuration object (unused, reads from ConfigurationManager)
   * @returns {Promise<void>}
   * @throws {Error} If ConfigurationManager is not available
   */
  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);

    // Get backup directory from ConfigurationManager
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('BackupManager requires ConfigurationManager to be initialized.');
    }

    // Uses getResolvedDataPath to support INSTANCE_DATA_FOLDER
    this.backupDirectory = configManager.getResolvedDataPath(
      'ngdpbase.backup.directory',
      './data/backups'
    );

    this.maxBackups = configManager.getProperty('ngdpbase.backup.max-backups') as number;
    this.autoBackupEnabled = configManager.getProperty('ngdpbase.backup.auto-backup') as boolean ?? false;
    this.autoBackupTime = configManager.getProperty('ngdpbase.backup.auto-backup-time') as string ?? '02:00';
    this.autoBackupDays = configManager.getProperty('ngdpbase.backup.auto-backup-days') as string ?? 'daily';

    // #170: resolve the storage provider name (lowercase config -> PascalCase
    // class), e.g. filebackupprovider -> FileBackupProvider.
    const providerName = configManager.getProperty(
      'ngdpbase.backup.provider', 'filebackupprovider'
    ) as string;
    this.providerClass = this.normalizeProviderName(providerName);

    // Preflight: if the configured path lives on a volume that is not mounted,
    // log a clear warning and disable backups for this session rather than
    // letting the provider's ensureContainer() crash engine init with an
    // opaque EACCES.
    const preflight = this.preflightConfiguredPath(
      'ngdpbase.backup.directory',
      this.backupDirectory
    );
    if (!preflight.ok) {
      logger.warn('   Backups are DISABLED for this session.');
      this.autoBackupEnabled = false;
      this.backupDirectory = '';
      this.provider = null;
      logger.info('✅ BackupManager initialized (degraded — backups disabled)');
      return;
    }

    // #170: load the storage provider — it owns ensuring the container exists.
    await this.loadProvider();

    // #1720: automatic backups are a scheduled job.
    this.scheduleAutoBackup();

    // #1563: whether backups work — a failure kept from before a restart, or
    // no good backup recently enough — checked now and on a timer. #1561:
    // without the backup key, the dashboard says so for as long as it lasts.
    this.registerHealthCheck();
    await this.refreshBackupHealth();

    logger.info('✅ BackupManager initialized');
    logger.info(`📁 Backup directory: ${this.backupDirectory}`);
    logger.info(`📊 Max backups to retain: ${this.maxBackups}`);
    logger.info(`🕐 Auto backup: ${this.autoBackupEnabled ? `enabled at ${this.autoBackupTime} (${this.autoBackupDays})` : 'disabled'}`);
  }

  /**
   * Backup BackupManager's own state (conforms to BaseManager interface)
   *
   * @returns {Promise<BaseBackupData>} Backup data for this manager
   */
  async backup(): Promise<BaseBackupData> {
    return {
      managerName: 'BackupManager',
      timestamp: new Date().toISOString(),
      data: {
        backupDirectory: this.backupDirectory,
        maxBackups: this.maxBackups
      }
    };
  }

  /**
   * Restore BackupManager's own state (conforms to BaseManager interface)
   *
   * @param {BaseBackupData} backupData - Backup data from backup()
   * @returns {Promise<void>}
   */
  async restoreState(backupData: BaseBackupData): Promise<void> {
    if (backupData?.data) {
      // BackupManager state is read from config, so nothing to restore
      logger.info('[BackupManager] State restore not needed (config-driven)');
    }
  }

  /**
   * Perform a complete backup of all managers to a file
   *
   * Process:
   * 1. Get all registered managers from engine
   * 2. Call backup() on each manager
   * 3. Aggregate all backup data
   * 4. Compress to .gz file
   * 5. Save with timestamp
   * 6. Clean up old backups
   *
   * @param {BackupOptions} options - Backup options
   * @param {string} options.filename - Custom filename (optional)
   * @param {boolean} options.compress - Whether to compress (default: true)
   * @param ctx - Who asked (#1179): the request's subject, or the schedule's JobContext. First and mandatory — a full copy of the instance is made on someone's behalf.
   * @returns {Promise<string>} Path to created backup file
   */
  async createBackup(ctx: ActorContext, options: BackupOptions = {}): Promise<string> {
    return this.exclusive(() => this.createBackupNow(ctx, options));
  }

  /**
   * One at a time (#1563): `work` starts once everything queued before it
   * has finished, whether that succeeded or failed, and is never run beside
   * it. A second backup asked for while one runs waits for it and is then
   * taken in its own right: its own document, its own options, its own
   * result. So a backup's pruning never deletes files another backup, a
   * restore or the health check is reading. In-process only: one server
   * process owns a backup directory.
   */
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.exclusiveTail.then(() => work());
    this.exclusiveTail = run.catch(() => undefined);
    return run;
  }

  /** `createBackup` itself, for a caller already holding the queue (`exclusive`): a restore's safety backup. */
  private async createBackupNow(ctx: ActorContext, options: BackupOptions = {}): Promise<string> {
    const startTime = Date.now();
    logger.info('🔄 Starting backup operation...');
    let pending: { filename: string; existing: Set<string> } | null = null;
    // #1563: every backup that fails is said, and kept, until one succeeds —
    // except where the failure was already recorded, or is not one of backups.
    let recorded = false;

    try {
      if (!this.backupDirectory || !this.provider) {
        throw new Error('Backup directory not initialized');
      }

      // #1563: refused before anything is written, rather than half a backup.
      await this.checkFreeSpace();

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      // #1561: with the backup key set the document is encrypted under it, and named so.
      const backupKey = currentBackupKey();
      const plainName = options.filename || `${timestamp}-ngdpbase-backup.json.gz`;
      const filename = backupKey && !plainName.endsWith(ENCRYPTED_SUFFIX) ? `${plainName}${ENCRYPTED_SUFFIX}` : plainName;

      // Collect backup data from all managers
      const backupData: BackupData = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        application: 'ngdpbase',
        managers: {}
      };

      // Get all manager names from engine
      const managerNames = this.registeredEntries();
      logger.info(`📋 Found ${managerNames.length} registered managers`);

      // #1723: a manager may write its own files (the databases) beside the
      // document; they share its stem and are pruned with it.
      const stem = backupStem(filename);
      const managerOptions = {
        ctx, directory: this.backupDirectory, stem, archive: archiveWriter(this.backupDirectory, stem),
        ...(options.safetyBackup ? { safetyBackup: true } : {})
      };
      const failures: string[] = [];
      // #1912: parts left out only because there is no backup key — said by
      // the banner and the one-time notice (checkBackupKey), not per backup.
      const leftOutForNoKey: string[] = [];
      pending = { filename, existing: new Set(await this.companionsOf(filename)) };

      // #1985: the folders and files each manager and add-on declares, by entry.
      const declared = this.declaredParts({ forBackup: true });
      const entries = [...managerNames, ...[...declared.keys()].filter((name) => !managerNames.includes(name))];

      // Call backup() on each manager, and write its declared parts beside the document

      for (const managerName of entries) {
        // Skip BackupManager itself
        if (managerName === 'BackupManager') {
          continue;
        }

        try {
          const manager = this.managerFor(managerName);
          const parts = declared.get(managerName) ?? [];
          if (!manager && parts.length === 0) {
            logger.warn(`⚠️  Manager not found: ${managerName}`);
            continue;
          }
          // #1943: an add-on manager (engine.registerManager) has no backup();
          // its data is in its declared databases and add-on files.
          if (typeof manager?.backup !== 'function' && parts.length === 0) {
            logger.debug(`${managerName} has no backup part (no backup()); skipped`);
            continue;
          }

          logger.info(`📦 Backing up ${managerName}...`);
          let managerBackup: BaseBackupData = typeof manager?.backup === 'function'
            ? await manager.backup(managerOptions)
            : { managerName, timestamp: new Date().toISOString(), data: null };
          if (parts.length > 0) managerBackup = placePartRecords(managerBackup, parts, await backupDeclaredParts(managerName, parts, managerOptions));

          backupData.managers[managerName] = managerBackup;
          for (const warning of managerBackup?.warnings ?? []) {
            if (!backupKey && isLeftOutForNoKey(warning)) leftOutForNoKey.push(`${managerName}: ${warning}`);
            else failures.push(`${managerName}: ${warning}`);
          }
          logger.info(`✅ ${managerName} backed up${managerBackup?.warnings?.length ? ' in part' : ' successfully'}`);
        } catch (error) {
          logger.error(`❌ Failed to backup ${managerName}:`, error);
          const reason = (error as Error).message;
          if (!backupKey && isLeftOutForNoKey(reason)) leftOutForNoKey.push(`${managerName}: ${reason}`);
          else failures.push(`${managerName}: ${reason}`);
          // Continue with other managers even if one fails
          backupData.managers[managerName] = {
            error: (error as Error).message,
            timestamp: new Date().toISOString()
          };
        }
      }

      // #1876: BackupManager's own part, the instance .env without the backup key's line.
      try {
        const env = await this.backupInstanceEnv(backupData, filename, backupKey);
        if (env.warning) {
          if (isLeftOutForNoKey(env.warning)) leftOutForNoKey.push(`BackupManager: ${env.warning}`);
          else failures.push(`BackupManager: ${env.warning}`);
        }
      } catch (error) {
        logger.error('❌ Failed to back up the instance .env:', error);
        failures.push(`BackupManager: the instance .env: ${(error as Error).message}`);
      }

      // Serialize to JSON
      const jsonData = JSON.stringify(backupData, null, 2);
      logger.info(`📊 Backup data size: ${(jsonData.length / 1024).toFixed(2)} KB`);

      // Compress with gzip
      let finalData: string | Buffer = jsonData;
      if (options.compress !== false) {
        const compressed = await gzip(jsonData);
        finalData = compressed;
        logger.info(`🗜️  Compressed size: ${(compressed.length / 1024).toFixed(2)} KB (${((compressed.length / jsonData.length) * 100).toFixed(1)}% of original)`);
      }

      // #1561: the document holds password hashes and the custom configuration with its secrets.
      if (backupKey) finalData = await encryptBuffer(Buffer.isBuffer(finalData) ? finalData : Buffer.from(finalData, 'utf8'), backupKey);

      // Write via the storage provider (#170)
      let backupPath: string;
      try {
        backupPath = await this.provider.writeBackup(filename, finalData);
      } catch (err) {
        // #1563: half a file (out of space mid-write) is not left to look like a backup.
        await this.provider.removeBackup(filename).catch(() => undefined);
        throw err;
      }

      // #1563: a file is not a backup until it reads back.
      await this.verifyWrittenBackup(backupPath, filename, backupKey);
      pending = null;

      const duration = Date.now() - startTime;
      logger.info(`✅ Backup completed successfully in ${duration}ms`);
      logger.info(`📁 Backup saved to: ${backupPath}`);

      // #1215: a full copy of the instance now exists somewhere; say who asked
      // and where it went. on-failure: continue — the backup is already written and a
      // slow sink must not fail it.
      const who = actorOf(ctx);
      await recordAuditEvent(this.engine.getManager('AuditManager'), {
        eventType: AUDIT_EVENT.BACKUP_CREATE,
        ...who,
        action: 'backup-create',
        result: 'success',
        severity: 'medium',
        resource: backupPath,
        resourceType: 'backup',
        metadata: { ...who.metadata, filename, bytes: finalData.length, managers: managerNames.length }
      }, (err) => logger.warn('[BackupManager] Audit record failed for backup-create:', err));

      // #1723, #1563: a backup with a part missing is said, not just logged,
      // and it is a failed backup: the outage stays until one is whole.
      // #1561: a backup that is not encrypted is said by the dashboard banner
      // and one notification (checkBackupKey), never once per backup.
      const incomplete = failures.length > 0 ? `Backup ${filename} was written, but without: ${failures.join('; ')}` : null;
      if (incomplete) {
        logger.error(`❌ ${incomplete}`);
        await this.notifyAdmins('error', 'A backup is incomplete', incomplete);
        await this.recordBackupFailure(`a backup is incomplete — ${failures.join('; ')}`, { filename, notify: false });
      } else {
        await this.clearBackupFailure();
      }
      await this.refreshBackupHealthNow();
      recorded = true;
      if (incomplete && options.requireComplete) throw new Error(incomplete);
      if (!backupKey) {
        logger.warn(`⚠️  Backup ${filename} was written NOT encrypted (${BACKUP_KEY_ENV} is not set)${leftOutForNoKey.length > 0 ? `, without: ${leftOutForNoKey.join('; ')}` : ''}`);
      }
      // A restore's safety backup must be whole, whatever left a part out.
      if (options.requireComplete && leftOutForNoKey.length > 0) throw new Error(`Backup ${filename} was written, but without: ${leftOutForNoKey.join('; ')}`);

      // Clean up old backups
      if (!options.skipCleanup) await this.cleanupOldBackups();

      return backupPath;
    } catch (error) {
      logger.error('❌ Backup operation failed:', error);
      // #1723: files the managers wrote for a document that was never written are removed.
      if (pending) await this.removeCompanions(pending.filename, pending.existing);
      if (!recorded) {
        await this.recordBackupFailure(describeBackupError(error));
        await this.refreshBackupHealthNow();
      }
      throw error;
    }
  }

  /**
   * The instance `.env` beside the document (#1876): `<stem>.env.tar.enc`,
   * only ever encrypted, and never with the backup key's own line. Without
   * the key it is left out (`LEFT_OUT_FOR_NO_KEY`). BackupManager owns this
   * part: the file belongs to no manager, and the backup key is this one's.
   */
  private async backupInstanceEnv(backupData: BackupData, filename: string, backupKey: string): Promise<{ warning?: string }> {
    const slot = (env: DirectoryBackupData | null): void => {
      backupData.managers.BackupManager = { managerName: 'BackupManager', timestamp: new Date().toISOString(), data: { env } };
    };
    if (!backupKey) {
      slot(null);
      return { warning: `${LEFT_OUT_FOR_NO_KEY}the instance .env was left out: it is only ever backed up encrypted under the backup key (#1876)` };
    }
    const file = this.instanceEnvFile();
    const target = archiveTarget(backupStem(filename), 'env');
    const scratch = mkdtempSync(path.join(this.backupDirectory!, '.env-part-'));
    try {
      const entries = file && existsSync(file) ? ['.env'] : [];
      if (file && entries.length > 0) writeFileSync(path.join(scratch, '.env'), envForBackup(readFileSync(file, 'utf8')), { mode: 0o600 });
      const outcome = await writeTreeArchive(path.join(this.backupDirectory!, target.archive), scratch, { entries, backupKey: target.backupKey });
      slot({ format: 1, archive: target.archive, files: outcome.files, bytes: outcome.bytes, ...(target.keyFingerprint ? { keyFingerprint: target.keyFingerprint } : {}) });
      return {};
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }

  /** `<FAST_STORAGE>/.env`, or null when the instance data folder is not known. */
  private instanceEnvFile(): string | null {
    const dir = this.engine.getManager<ConfigurationManager>('ConfigurationManager')?.getInstanceDataFolder?.();
    return dir ? instanceEnvPath(dir) : null;
  }

  /** The files the managers wrote beside one backup document (#1723). */
  private async companionsOf(documentFilename: string): Promise<string[]> {
    return (await this.provider?.listBackupObjects() ?? []).filter((o) => isCompanionOf(o.filename, documentFilename)).map((o) => o.filename);
  }

  /** Remove the files the managers wrote beside one backup document (#1723), except those in `keep`. */
  private async removeCompanions(documentFilename: string, keep: Set<string> = new Set()): Promise<void> {
    if (!this.provider) return;
    try {
      for (const filename of await this.companionsOf(documentFilename)) {
        if (!keep.has(filename)) await this.provider.removeBackup(filename);
      }
    } catch (err) {
      logger.warn(`⚠️  Failed to remove the files beside ${documentFilename}:`, err);
    }
  }

  /**
   * Without `NGDPBASE_BACKUP_KEY` backups are still taken, unencrypted, with
   * the credentials store and the databases left out (#1561, #1876). That is
   * said twice, never once per backup (operator, #1912): BackupManager is
   * degraded for as long as the key is missing — the persistent banner on the
   * dashboard — and admins get ONE notification the first time. It is
   * deduplicated the way other one-time notices are (`pageMetadataMissing`):
   * by its title among the stored notifications, which persist across
   * restarts and keep a dismissed one. With the key set the fault clears.
   * Read at start and at each backup.
   */
  private async checkBackupKey(): Promise<void> {
    // #1976: the .env key set is checked whatever the key, so its one notice is never lost behind another banner.
    const envReminder = await this.checkInstanceEnvKeys();
    const key = currentBackupKey();
    if (key) {
      this.markReadyIfDegradedBy(BACKUP_KEY_MISSING);
      // #1876: the banner asking an admin to save the key off the server, until one confirms;
      // then #1976's, while the .env key set differs from the one last confirmed. One at a time,
      // and one confirmation ("I have saved .env", which holds the key) can clear both.
      const reminder = this.backupKeyInfo().saved ? envReminder : backupKeyNotSaved(backupKeyFingerprint(key));
      const status = this.getManagerStatus();
      const ours = status.state === 'degraded' && (status.reason?.startsWith(KEY_NOT_SAVED_PREFIX) || status.reason?.startsWith(ENV_KEYS_CHANGED_PREFIX));
      if (!reminder) {
        if (ours) this.markReady();
      } else if (status.state !== 'degraded' || ours) {
        this.markNeedsAttention(reminder, reminder === envReminder ? ENV_KEYS_SAVED_KEY : BACKUP_KEY_SAVED_KEY);
      }
      return;
    }
    // A degraded backup directory (preflight) is the worse fault, and keeps the banner.
    const status = this.getManagerStatus();
    if (status.state !== 'degraded' || status.reason === BACKUP_KEY_MISSING) this.markNeedsAttention(BACKUP_KEY_MISSING, BACKUP_KEY_ENV);
    if (this.alreadyNotified(BACKUP_KEY_MISSING_TITLE)) return;
    await this.notifyAdmins('error', BACKUP_KEY_MISSING_TITLE, `${BACKUP_KEY_MISSING}. Set ${BACKUP_KEY_ENV} in the environment or the instance .env, and restart. Until then the dashboard lists Backup under "Working, but needs your attention"; this is the only notification about it.`);
  }

  /**
   * Whether a notification with this title (and message, when given) is
   * among the stored ones, which persist across restarts and keep a dismissed
   * one: how a one-time notice is deduplicated (`pageMetadataMissing`).
   */
  private alreadyNotified(title: string, message?: string): boolean {
    try {
      const notifications = this.engine.getManager<{ getAllNotifications?(includeExpired?: boolean): Array<{ title: string; message?: string }> }>('NotificationManager');
      return Boolean(notifications?.getAllNotifications?.(true).some((n) => n.title === title && (message === undefined || n.message === message)));
    } catch (err) {
      logger.warn(`[BackupManager] Could not check for an earlier '${title}' notice:`, err);
      return false;
    }
  }

  /**
   * The instance `.env` key set against the one an admin last confirmed saved
   * off the server (#1976): the reminder while they differ, else null. Names
   * only — a value is never kept, logged or shown.
   *
   * The first check on a site with nothing recorded (a new site, or one
   * upgraded to this release) records the names it finds as the baseline,
   * silently: an upgraded site's keys are already in every encrypted backup,
   * and a new site is already asked to save its backup key, so asking again at
   * that moment would be noise. Every change after it asks. One notification
   * per change, deduplicated by its title and words among the stored
   * notifications, so a restart never repeats it.
   */
  private async checkInstanceEnvKeys(): Promise<string | null> {
    const info = this.envKeysInfo();
    if (!info) return null;
    if (!info.recorded) {
      // A site not installed yet has no custom configuration to record into: the first check after the install does it.
      const customFile = (this.configManager() as { getCustomConfigPath?(): string } | null)?.getCustomConfigPath?.();
      if (customFile && !existsSync(customFile)) return null;
      try {
        await this.configManager()?.setProperty(ENV_KEYS_SAVED_KEY, info.names,
          systemContext(this.engine, 'the names in the instance .env recorded as the baseline for the reminder to save it (#1976)'));
      } catch (err) {
        logger.warn('[BackupManager] The names in the instance .env could not be recorded:', err);
      }
      return null;
    }
    if (info.added.length === 0 && info.removed.length === 0) return null;
    const reminder = envKeysChanged(info);
    const message = `${reminder}. The /admin dashboard lists Backup under "Working, but needs your attention" until then.`;
    if (!this.alreadyNotified(ENV_KEYS_CHANGED_TITLE, message)) await this.notifyAdmins('warning', ENV_KEYS_CHANGED_TITLE, message);
    return reminder;
  }

  /** The instance `.env` key set as Admin → Backup shows it (#1976), or null when the site has no instance data folder or the file can't be read. Never a value. */
  envKeysInfo(): EnvKeysInfo | null {
    const file = this.instanceEnvFile();
    if (!file) return null;
    let content = '';
    try {
      if (existsSync(file)) content = readFileSync(file, 'utf8');
    } catch (err) {
      logger.warn(`[BackupManager] The instance .env could not be read for its key names: ${(err as NodeJS.ErrnoException).code ?? 'error'}`);
      return null;
    }
    const names = envKeyNames(content);
    const stored = this.setting<unknown>(ENV_KEYS_SAVED_KEY, null);
    const recorded = Array.isArray(stored) ? stored.filter((n): n is string => typeof n === 'string') : null;
    const key = currentBackupKey();
    return {
      names,
      fingerprint: envKeyNamesFingerprint(names),
      recorded: recorded !== null,
      added: recorded ? names.filter((n) => !recorded.includes(n)) : [],
      removed: recorded ? recorded.filter((n) => !names.includes(n)) : [],
      holdsBackupKey: Boolean(key) && readEnvLine(content, BACKUP_KEY_ENV) === key
    };
  }

  /** The backup key as Admin → Backup shows it: set or not, its fingerprint, and whether an admin confirmed it is saved. Never the key. */
  backupKeyInfo(): BackupKeyInfo {
    const key = currentBackupKey();
    if (!key) return { set: false, fingerprint: null, saved: false };
    const fingerprint = backupKeyFingerprint(key);
    const saved = this.engine.getManager<ConfigurationManager>('ConfigurationManager')?.getProperty(BACKUP_KEY_SAVED_KEY, '') === fingerprint;
    return { set: true, fingerprint, saved };
  }

  /**
   * The backup key itself, for the one page that asks an admin to copy it
   * off the server (#1876). The route asks `config-manage`, with its fresh
   * sign-in; nothing else shows, logs or returns it.
   */
  revealBackupKey(): string | null {
    return currentBackupKey() || null;
  }

  /**
   * The instance `.env` exactly as it is on disk, backup key line included,
   * for an admin to keep a copy off the server (#1938). The route asks
   * `config-manage`, with its fresh sign-in. Recorded as `secret-reveal`:
   * the file, never its contents. Null when the site has no instance `.env`.
   */
  async revealInstanceEnv(ctx: ActorContext): Promise<Buffer | null> {
    const file = this.instanceEnvFile();
    if (!file || !existsSync(file)) return null;
    const content = readFileSync(file);
    const who = actorOf(ctx);
    await recordAuditEvent(this.engine.getManager('AuditManager'), {
      eventType: AUDIT_EVENT.SECRET_REVEAL,
      ...who,
      action: 'secret-reveal',
      result: 'success',
      severity: 'high',
      resource: '.env',
      resourceType: 'instance-env',
      metadata: { ...who.metadata, file: '.env', bytes: content.length }
    }, (err) => logger.warn('[BackupManager] Audit record failed for the .env download:', err));
    return content;
  }

  /**
   * An admin confirms the backup key with this fingerprint is saved off the
   * server (#1876). Recorded in the configuration (`ngdpbase.backup.key-saved-fingerprint`,
   * written through ConfigurationManager, which records the change), so it
   * survives restarts; a different key asks again. Refused when the
   * fingerprint is not the current key's: the page they read was stale.
   *
   * With `envFingerprint` (#1976) the admin confirms the whole `.env` is
   * saved, the one confirmation for both reminders: the names it sets are
   * recorded (`ngdpbase.backup.env-keys-saved`), and so is the backup key
   * when the file holds it. Refused when the names changed since the page
   * was loaded.
   */
  async confirmBackupKeySaved(ctx: ActorContext, fingerprint: string, envFingerprint?: string): Promise<void> {
    const STALE_KEY = 'That is not the fingerprint of the current backup key; reload Admin → Backup and check the key you saved';
    const info = this.backupKeyInfo();
    const env = envFingerprint === undefined ? null : this.envKeysInfo();
    if (envFingerprint !== undefined && env?.fingerprint !== envFingerprint) throw new Error('The keys in .env changed since that page was loaded; reload Admin → Backup, download .env again and confirm');
    // A saved .env is a saved backup key only when the file holds the key this site uses.
    const recordsKey = info.set && (env ? env.holdsBackupKey : true);
    if (recordsKey ? info.fingerprint !== fingerprint : !env) throw new Error(STALE_KEY);
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) throw new Error('ConfigurationManager not available');
    if (recordsKey) await configManager.setProperty(BACKUP_KEY_SAVED_KEY, fingerprint, ctx);
    if (env) await configManager.setProperty(ENV_KEYS_SAVED_KEY, env.names, ctx);
    await this.checkBackupKey();
  }

  // ---------------------------------------------------------------------------
  // Backups never fail silently (#1563). A failed backup, or no good backup
  // recently enough, is an outage on the /admin dashboard until a backup
  // succeeds. BackupManager decides; the pages only show what it says.
  // ---------------------------------------------------------------------------

  private configManager(): ConfigurationManager | null {
    return this.engine.getManager<ConfigurationManager>('ConfigurationManager') ?? null;
  }

  private setting<T>(key: string, fallback: T): T {
    return (this.configManager()?.getProperty(key, fallback) ?? fallback) as T;
  }

  /** `ngdpbase.backup.health-file`: the failure kept across restarts. */
  private healthFile(): string | null {
    return this.configManager()?.getResolvedDataPath?.('ngdpbase.backup.health-file', './data/backup-health.json') || null;
  }

  private async readHealthRecord(): Promise<BackupHealthRecord> {
    const file = this.healthFile();
    if (!file) return { version: 1 };
    try {
      const record = JSON.parse(await readFileAsync(file, 'utf8')) as BackupHealthRecord;
      return record && typeof record === 'object' ? record : { version: 1 };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') logger.error(`❌ The backup health record ${file} could not be read:`, err);
      return { version: 1 };
    }
  }

  private async writeHealthRecord(record: BackupHealthRecord): Promise<void> {
    const file = this.healthFile();
    if (!file) return;
    try {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFileAsync(file, JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
    } catch (err) {
      // The outage still shows until the restart; it just isn't kept across one.
      logger.error(`❌ The backup health record ${file} could not be written:`, err);
    }
  }

  /**
   * A backup failed (#1563): kept until one succeeds, across restarts, and
   * said once — admins get one "Backups are not working" notification per
   * reason, not one per failed attempt. `notify: false` where another
   * notification already said it ("A backup is incomplete").
   */
  private async recordBackupFailure(reason: string, options: { filename?: string; notify?: boolean } = {}): Promise<void> {
    const record = await this.readHealthRecord();
    const repeated = record.failure?.reason === reason;
    const failure: BackupFailure = { at: repeated ? record.failure!.at : new Date().toISOString(), reason, ...(options.filename ? { filename: options.filename } : {}) };
    await this.writeHealthRecord({ ...record, failure });
    logger.error(`❌ Backups are not working: ${reason}`);
    if (options.notify !== false && !repeated) {
      const lastGood = (await this.lastGoodBackup(failure))?.at;
      await this.notifyAdmins('error', BACKUPS_NOT_WORKING_TITLE,
        `A backup failed: ${reason}. Last good backup: ${lastGood ? localTime(lastGood) : 'never'}. The /admin dashboard lists Backup as not working until a backup succeeds.`);
    }
  }

  /** A backup succeeded (#1563): the failure kept since the last one is cleared. */
  private async clearBackupFailure(): Promise<void> {
    const record = await this.readHealthRecord();
    if (!record.failure && !record.staleNotified) return;
    await this.writeHealthRecord({ version: 1 });
  }

  /** The newest backup in the backup directory that is not the failed one: read from the directory, never remembered. */
  private async lastGoodBackup(failure?: BackupFailure): Promise<BackupHealth['lastGood']> {
    const good = (await this.listStoredBackups()).find((b) => b.filename !== failure?.filename);
    if (!good) return null;
    const at = good.created.getTime() > 0 ? good.created : good.modified;
    return { filename: good.filename, at: at.toISOString(), size: good.totalSize, location: this.backupDirectory ?? '' };
  }

  /** Automatic backups as they run (#1563): on only when scheduled and not paused, with the schedule in force and the next run. */
  private async autoBackupRun(now: Date): Promise<{ schedule: Schedule; nextRun: string | null } | null> {
    if (!this.autoBackupEnabled || !this.provider) return null;
    const jobs = this.engine.getManager<BackgroundJobManager>('BackgroundJobManager');
    if (!jobs) return null;
    const view = typeof jobs.scheduledJobView === 'function' ? await jobs.scheduledJobView(AUTO_BACKUP_JOB_ID) : undefined;
    if (view === null || view?.enabled === false) return null;
    try {
      const timeZone = serverTimeZone();
      const schedule = parseSchedule(view ? { rrule: view.rrule, tz: view.timeZone } : autoBackupSchedule(this.autoBackupTime, this.autoBackupDays, timeZone), { defaultTimeZone: timeZone });
      return { schedule, nextRun: view?.nextSlot ?? schedule.nextSlot(now)?.toISOString() ?? null };
    } catch {
      return null;
    }
  }

  /**
   * Whether backups are working (#1563), from what is on disk: the newest
   * good backup in the backup directory, the failure kept in the health
   * record, the automatic-backup schedule, and free space at the destination.
   *
   * No good backup within the window is an outage. The window is
   * `ngdpbase.backup.stale-interval-multiplier` (default 2) times the longest
   * gap between automatic backups when they are on, and
   * `ngdpbase.backup.stale-fallback-days` (default 7) when they are off.
   */
  async getBackupHealth(): Promise<BackupHealth> {
    const now = new Date();
    const record = await this.readHealthRecord();
    const failure = record.failure ?? null;
    const lastGood = await this.lastGoodBackup(failure ?? undefined);
    const auto = await this.autoBackupRun(now);
    const fallbackMs = Math.max(0, Number(this.setting('ngdpbase.backup.stale-fallback-days', 7))) * DAY_MS;
    const gap = auto ? longestGapMs(auto.schedule, now) : 0;
    const staleAfterMs = gap > 0 ? Math.max(1, Number(this.setting('ngdpbase.backup.stale-interval-multiplier', 2))) * gap : fallbackMs;
    const stale = !lastGood || now.getTime() - Date.parse(lastGood.at) > staleAfterMs;
    let freeBytes: number | null = null;
    try {
      freeBytes = await this.provider?.freeSpace?.() ?? null;
    } catch (err) {
      logger.warn('[BackupManager] Free space at the backup destination could not be read:', err);
    }
    const since = lastGood ? localTime(lastGood.at) : null;
    let fault: string | null = null;
    if (failure) {
      fault = `Backups are not working: ${failure.reason} (${localTime(failure.at)}). Last good backup: ${since ?? 'never'}`;
    } else if (stale) {
      const why = auto ? 'automatic backups are on, but none has succeeded' : 'automatic backups are off';
      fault = `${since ? `No good backup since ${since}` : 'No good backup since: never — this site has no backup'} (${why}). Make one from Admin → Backup`;
    }
    return { lastGood, autoBackup: Boolean(auto), nextRun: auto?.nextRun ?? null, freeBytes, failure, staleAfterMs, stale, fault };
  }

  /**
   * Bring the dashboard in line with whether backups work (#1563): an outage
   * (`markDegraded`) while a backup has failed or none is recent enough,
   * cleared — only that one — once they work, then the backup key's reminder
   * (`checkBackupKey`), which never hides an outage. A stretch with no recent
   * backup notifies admins once, kept across restarts. Run at start, on the
   * `backup.health` timer, and after every backup.
   */
  async refreshBackupHealth(): Promise<BackupHealth | null> {
    return this.exclusive(() => this.refreshBackupHealthNow());
  }

  /** `refreshBackupHealth` itself, for a caller already holding the queue: a backup that just ended. */
  private async refreshBackupHealthNow(): Promise<BackupHealth | null> {
    let health: BackupHealth | null = null;
    try {
      // A backup directory that could not be used at start is the outage already shown.
      if (this.provider) {
        health = await this.getBackupHealth();
        if (health.fault) {
          this.markDegraded(health.fault, health.failure ? undefined : 'ngdpbase.backup.auto-backup');
          this.healthFault = health.fault;
          if (!health.failure) await this.notifyStaleOnce(health);
        } else if (this.healthFault) {
          this.markReadyIfDegradedBy(this.healthFault);
          this.healthFault = null;
        }
      }
    } catch (err) {
      logger.error('❌ Whether backups are working could not be checked:', err);
    }
    await this.checkBackupKey();
    return health;
  }

  /** One notification per stretch without a recent good backup (#1563), kept across restarts by the health record. */
  private async notifyStaleOnce(health: BackupHealth): Promise<void> {
    const marker = health.lastGood?.at ?? 'never';
    const record = await this.readHealthRecord();
    if (record.staleNotified === marker) return;
    await this.writeHealthRecord({ ...record, staleNotified: marker });
    logger.error(`❌ ${health.fault}`);
    await this.notifyAdmins('error', BACKUPS_NOT_WORKING_TITLE, `${health.fault}. The /admin dashboard lists Backup as not working until a backup succeeds.`);
  }

  /**
   * The routine check (#1563): `backup.health`, every
   * `ngdpbase.backup.health-check-interval` ms (default one hour), as the
   * system principal (BackgroundJobManager's routine maintenance). It is how
   * a backup that never comes is noticed.
   */
  private registerHealthCheck(): void {
    const jobs = this.engine.getManager<BackgroundJobManager>('BackgroundJobManager');
    if (typeof jobs?.registerMaintenance !== 'function') return;
    jobs.registerMaintenance({
      id: BACKUP_HEALTH_JOB_ID,
      displayName: 'Check that backups are working',
      everyMs: Number(this.setting('ngdpbase.backup.health-check-interval', 3_600_000)),
      run: async () => {
        const health = await this.refreshBackupHealth();
        return health?.fault ?? undefined;
      }
    });
  }

  /**
   * Refuse a backup there is no room for (#1563), before anything is
   * written: free space at the destination against the last backup's size
   * (the document and every file beside it) times
   * `ngdpbase.backup.space-margin` (default 1.5). Skipped when there is no
   * earlier backup or the free space can't be told; a write that then runs
   * out still fails, and says so.
   */
  private async checkFreeSpace(): Promise<void> {
    const last = (await this.listStoredBackups())[0];
    if (!last || !this.provider) return;
    let free: number | null;
    try {
      free = await this.provider.freeSpace();
    } catch (err) {
      logger.warn('[BackupManager] Free space at the backup destination could not be read; the backup goes ahead:', err);
      return;
    }
    if (free === null) return;
    const needed = Math.ceil(last.totalSize * Math.max(1, Number(this.setting('ngdpbase.backup.space-margin', 1.5))));
    if (free < needed) {
      throw new Error(`not enough free space at the backup destination ${this.backupDirectory}: ${formatBytes(free)} free, and the last backup took ${formatBytes(last.totalSize)} (about ${formatBytes(needed)} is needed). Nothing was written`);
    }
  }

  /**
   * Read a backup just written back (#1563): decrypt it (every record's GCM
   * tag), decompress it, parse it and check its shape, on a worker thread.
   * A document that does not read back is removed — it is not a backup — and
   * the backup fails, naming why.
   */
  private async verifyWrittenBackup(backupPath: string, filename: string, backupKey: string): Promise<void> {
    try {
      const bytes = await this.provider!.readBackup(backupPath);
      await verifyBackupOffThread(bytes, backupKey, filename, Number(this.setting('ngdpbase.backup.verify-timeout-ms', 600_000)));
    } catch (err) {
      try {
        await this.provider?.removeBackup(backupPath);
      } catch (removeErr) {
        logger.error(`❌ The unreadable backup ${filename} could not be removed:`, removeErr);
      }
      throw new Error(`the backup ${filename} was written but does not read back, so it was removed: ${(err as Error).message}`, { cause: err });
    }
  }

  private async notifyAdmins(level: 'error' | 'warning' | 'success', title: string, message: string): Promise<void> {
    try {
      await this.engine.getManager<{ addNotification(n: object): Promise<string> }>('NotificationManager')
        ?.addNotification({ type: 'system', level, title, message });
    } catch (err) {
      logger.error(`❌ The notification '${title}' could not be sent:`, err);
    }
  }

  /**
   * Restore all managers from a backup file
   *
   * Process:
   * 1. Read and decompress backup file
   * 2. Parse JSON data
   * 3. Validate backup structure
   * 4. Call restore() on each manager with its data
   *
   * The databases (#1723) go first, and are staged for the next start rather
   * than restored in place: a fresh backup of the live data is taken, then
   * DatabaseManager stages every database in the backup. If either fails,
   * nothing at all is restored.
   *
   * @param ctx - Who asked (#1179): a restore takes a backup and replaces the instance's data on someone's behalf.
   * @param {string} backupPath - Path to backup file
   * @param {RestoreOptions} options - Restore options
   * @param {boolean} options.skipValidation - Skip validation (default: false)
   * @param {string[]} options.managerFilter - Only restore specific managers
   * @returns {Promise<RestoreResults>} Restore results
   */
  async restoreFromFile(ctx: ActorContext, backupPath: string, options: RestoreOptions = {}): Promise<RestoreResults> {
    // #1563: its safety backup and staging run in the queue, never beside a backup's pruning.
    return this.exclusive(() => this.restoreFromFileNow(ctx, backupPath, options));
  }

  private async restoreFromFileNow(ctx: ActorContext, backupPath: string, options: RestoreOptions = {}): Promise<RestoreResults> {
    const startTime = Date.now();
    logger.info(`🔄 Starting restore operation from: ${backupPath}`);

    try {
      if (!this.provider) {
        throw new Error('Backup provider not initialized');
      }

      // Verify backup file exists
      if (!(await this.provider.backupExists(backupPath))) {
        throw new Error(`Backup file not found: ${backupPath}`);
      }

      // Read backup file via the storage provider (#170)
      const fileData = await this.provider.readBackup(backupPath);

      logger.info(`📁 Read backup file: ${(fileData.length / 1024).toFixed(2)} KB`);

      // #1561: an encrypted document is read only under the backup key it was
      // made with; #1563: read the one way every backup is read back.
      let backupData: BackupData;
      try {
        backupData = await readBackupDocument(fileData, currentBackupKey(), path.basename(backupPath), { validate: !options.skipValidation });
      } catch (err) {
        const message = (err as Error).message;
        throw new Error(message.startsWith('Invalid backup') ? message : `${message}; nothing was restored`, { cause: err });
      }
      logger.info(`📊 Backup version: ${backupData.version}`);
      logger.info(`📅 Backup timestamp: ${backupData.timestamp}`);

      // Restore results
      const results: RestoreResults = {
        success: [],
        failed: [],
        skipped: []
      };

      // Get manager names from backup
      const managerNames = Object.keys(backupData.managers);
      logger.info(`📋 Found ${managerNames.length} managers in backup`);

      // Where the document is, so a manager finds the files it wrote beside it (#1723).
      const directory = path.dirname(path.isAbsolute(backupPath) ? backupPath : path.join(this.backupDirectory ?? '', backupPath));

      // #1723: the databases first, all or nothing — if they cannot be staged,
      // nothing else is restored either. A fresh backup of the live data is
      // taken before anything is touched.
      const databases = backupData.managers.DatabaseManager as BaseBackupData | undefined;
      const databaseList = (databases?.data as { databases?: unknown } | null | undefined)?.databases;
      const hasDatabases = Array.isArray(databaseList) && databaseList.length > 0;
      // #1876: every manager whose restore is staged goes in one site restore,
      // all or nothing, when any besides the databases is asked for.
      const filtered = (name: string): boolean => !options.managerFilter || options.managerFilter.includes(name);
      const stagedNames = managerNames.filter((name) => filtered(name) && this.restoresStaged(name));
      const siteRestore = stagedNames.some((name) => name !== 'DatabaseManager');
      if (siteRestore) {
        await this.stageSiteRestore(ctx, backupPath, backupData, directory, stagedNames, options);
        results.success.push(...stagedNames);
      } else if (hasDatabases && filtered('DatabaseManager')) {
        const databaseManager = this.engine.getManager<DatabaseManager>('DatabaseManager');
        if (!databaseManager) throw new Error('The backup holds databases, but DatabaseManager is not available; nothing was restored');
        // D5: never replaced silently — refused before the fresh backup is taken.
        this.refuseIfSiteRestoreStaged();
        const staged = databaseManager.getStagedRestore?.();
        if (staged && !options.replaceStaged) {
          throw new Error(`A restore from ${staged.source || staged.backup} is already staged; cancel it or replace it. Nothing was restored`);
        }
        logger.info('📦 Taking a backup of the live data before staging the databases...');
        const before = await this.createBackupNow(ctx, { skipCleanup: true, requireComplete: true, safetyBackup: true });
        logger.info(`✅ Live data backed up to ${before}`);
        await databaseManager.restore(databases!, { ctx, directory, source: path.basename(backupPath), replaceStaged: options.replaceStaged, safetyBackup: path.basename(before) });
        results.success.push('DatabaseManager');
        // #1876: what this databases-only restore leaves as it is, for the notification once it is applied.
        await this.writeRestoreReport(backupPath, backupData, managerNames.filter((n) => n !== 'DatabaseManager'), actorOf(ctx).user);
      }

      // #1876: while a site restore is staged, nothing is restored live: it
      // would be overwritten, or contradicted, by the parts the restart puts
      // in place. A site restore just staged leaves them out and says so.
      const live = managerNames.filter((name) =>
        !(siteRestore && stagedNames.includes(name)) && !(name === 'DatabaseManager' && hasDatabases) && filtered(name));
      if (live.length > 0 && !siteRestore) {
        let staged: SiteRestoreManifest | null;
        try {
          staged = this.getStagedSiteRestore();
        } catch (err) {
          throw new Error(`A site restore record is there but can't be read (${(err as Error).message}); nothing was restored`, { cause: err });
        }
        if (staged) throw new Error(`A site restore from ${staged.source || staged.backup} is staged, so ${live.join(', ')} can't be restored now; cancel it first. Nothing was restored`);
      }

      // Restore each manager
      for (const managerName of managerNames) {
        if (siteRestore && stagedNames.includes(managerName)) continue;
        if (siteRestore && live.includes(managerName)) {
          logger.warn(`⏭️  ${managerName} not restored: it has no staged restore, and a site restore is staged (#1876)`);
          results.skipped.push(managerName);
          continue;
        }
        if (managerName === 'DatabaseManager' && hasDatabases) {
          if (options.managerFilter && !options.managerFilter.includes(managerName)) results.skipped.push(managerName);
          continue;
        }
        // Check if manager filter is applied
        if (options.managerFilter && !options.managerFilter.includes(managerName)) {
          logger.info(`⏭️  Skipping ${managerName} (filtered)`);
          results.skipped.push(managerName);
          continue;
        }

        try {
          const manager = this.managerFor(managerName);
          if (!manager) {
            logger.warn(`⚠️  Manager not found: ${managerName}, skipping`);
            results.skipped.push(managerName);
            continue;
          }
          // #1943, #1813: an add-on manager (engine.registerManager) has no
          // restore(), as it has no backup(); its data comes back through its
          // declared databases and add-on files. An older backup may still name
          // it (calendar and journal managers once extended BaseManager, whose
          // backup() wrote an empty entry), so it is skipped, not failed.
          if (typeof manager.restore !== 'function') {
            logger.debug(`${managerName} has no restore(); skipped`);
            results.skipped.push(managerName);
            continue;
          }

          const managerBackupData = backupData.managers[managerName] as BaseBackupData | { error?: string };

          // Skip if manager backup had an error
          if ('error' in managerBackupData && typeof managerBackupData.error === 'string') {
            logger.warn(`⚠️  Skipping ${managerName} (backup had error: ${managerBackupData.error})`);
            results.skipped.push(managerName);
            continue;
          }

          logger.info(`📦 Restoring ${managerName}...`);
          await manager.restore(managerBackupData as BaseBackupData, { ctx, directory });

          results.success.push(managerName);
          logger.info(`✅ ${managerName} restored successfully`);
        } catch (error) {
          logger.error(`❌ Failed to restore ${managerName}:`, error);
          results.failed.push({ manager: managerName, error: (error as Error).message });
        }
      }

      const duration = Date.now() - startTime;
      logger.info(`✅ Restore completed in ${duration}ms`);
      logger.info(`✅ Success: ${results.success.length}, ❌ Failed: ${results.failed.length}, ⏭️  Skipped: ${results.skipped.length}`);

      return results;
    } catch (error) {
      logger.error('❌ Restore operation failed:', error);
      throw error;
    }
  }

  /** The registered managers, by the entry each is recorded under in a backup (#2038), in registration order. */
  private registeredEntries(): string[] {
    return this.engine.getRegisteredManagers().map(managerEntryName);
  }

  /** The manager a backup entry belongs to (#2038), or undefined when this site has none. */
  private managerFor(entry: string): BaseManager | undefined {
    return this.engine.getManager<BaseManager>(registeredNameOf(entry));
  }

  /** Whether this site's manager of that name stages its restore (#1876), or its entry is declared folders (#1985). */
  private restoresStaged(name: string): boolean {
    if (this.declaredFor(name).length > 0) return true;
    const manager = this.managerFor(name);
    return typeof manager?.restoreIsStaged === 'function' && manager.restoreIsStaged();
  }

  /**
   * Each loaded add-on's folders (#1985): its `dataPath`, which counts for it
   * whatever it declares, and any further folders its module declares; under
   * the entry its files have always had (`addonEntryName`). For a backup, a
   * `dataPath` that does not exist is left out: that add-on keeps no files.
   */
  private addonParts(forBackup = false): Array<{ entry: string; folders: BackupFolder[] }> {
    const addons = this.engine.getManager<{ addonBackupFolders?(): Array<{ slug: string; dataPath: string | null; folders: BackupFolder[] }> }>('AddonsManager');
    const declared = typeof addons?.addonBackupFolders === 'function' ? addons.addonBackupFolders() : [];
    return declared.map(({ slug, dataPath, folders }) => ({
      entry: addonEntryName(slug),
      folders: forBackup ? folders.filter((f) => !('folder' in f) || f.folder !== dataPath || (dataPath !== null && existsSync(dataPath))) : folders
    }));
  }

  /** What a manager declares, and an add-on's folders recorded under the same entry (#1985). */
  private declaredFor(name: string, forBackup = false): BackupFolder[] {
    const manager = this.managerFor(name);
    let own: BackupFolder[] = [];
    try {
      own = typeof manager?.backupFolders === 'function' ? manager.backupFolders() : [];
    } catch (err) {
      logger.error(`[BackupManager] ${name}'s backup folders could not be read: ${(err as Error).message}`);
    }
    return [...own, ...this.addonParts(forBackup).filter((a) => a.entry === name).flatMap((a) => a.folders)];
  }

  /** Every entry with declared folders or files, in registration order, add-ons' after (#1985). */
  private declaredParts(options: { forBackup?: boolean } = {}): Map<string, BackupFolder[]> {
    const names = [...this.registeredEntries(), ...this.addonParts().map((a) => a.entry)];
    const out = new Map<string, BackupFolder[]>();
    for (const name of names) {
      if (out.has(name) || name === 'BackupManager') continue;
      const declared = this.declaredFor(name, options.forBackup);
      if (declared.length > 0) out.set(name, declared);
    }
    return out;
  }

  /**
   * Put a staged restore of an add-on's folders in place before its
   * `register()` runs, so before any of its managers reads them (#1985).
   * AddonsManager calls it as it loads each add-on.
   */
  applyAddonPartsAtStart(slug: string, folders: BackupFolder[]): StagedRestoreAtStart | null {
    return applyStagedPartsAtStart(this.engine, addonEntryName(slug), folders);
  }

  /** The site restore manifest, as configured (#1876). */
  private siteRestorePath(): string {
    return siteRestoreFile(this.engine.getManager<ConfigurationManager>('ConfigurationManager'));
  }

  /** The site restore staged and waiting for the next start, or null (#1876). Throws for a record that can't be read. */
  getStagedSiteRestore(): SiteRestoreManifest | null {
    return readSiteRestore(this.siteRestorePath());
  }

  /** A databases-only restore is refused while a site restore is staged: it would take the site restore's databases away from it (#1876). */
  private refuseIfSiteRestoreStaged(): void {
    let staged: SiteRestoreManifest | null;
    try {
      staged = this.getStagedSiteRestore();
    } catch (err) {
      throw new Error(`A site restore record is there but can't be read (${(err as Error).message}); nothing was restored`, { cause: err });
    }
    if (staged) throw new Error(`A site restore from ${staged.source || staged.backup} is staged; it includes the databases. Cancel it first; nothing was restored`);
  }

  /**
   * Stage a whole-site restore (#1876): every manager in `names` stages its
   * part for the next start, after a complete backup of the live data, under
   * one site restore manifest. All or nothing: a part that can't be staged
   * discards every part staged before it, and the live data is never
   * touched. The next start applies every part or none
   * (`src/utils/siteRestore.ts`).
   */
  private async stageSiteRestore(ctx: ActorContext, backupPath: string, backupData: BackupData, directory: string, names: string[], options: RestoreOptions): Promise<void> {
    const siteFile = this.siteRestorePath();
    let existing: SiteRestoreManifest | null;
    try {
      existing = readSiteRestore(siteFile);
    } catch (err) {
      if (!options.replaceStaged) throw new Error(`A site restore record is there but can't be read (${(err as Error).message}); replace it to go on. Nothing was restored`, { cause: err });
      existing = null;
    }
    const databaseManager = this.engine.getManager<DatabaseManager>('DatabaseManager');
    const databaseStaged = databaseManager?.getStagedRestore?.() ?? null;
    if ((existing || databaseStaged) && !options.replaceStaged) {
      const what = existing ? `A site restore from ${existing.source || existing.backup}` : `A database restore from ${databaseStaged!.source || databaseStaged!.backup}`;
      throw new Error(`${what} is already staged; cancel it or replace it. Nothing was restored`);
    }
    // A part whose backup failed can't be restored, so none is.
    for (const name of names) {
      const slot = backupData.managers[name] as { error?: unknown } | undefined;
      if (slot && typeof slot.error === 'string') throw new Error(`The backup has no ${name} part (its backup failed: ${slot.error}); nothing was restored`);
    }

    logger.info('📦 Taking a backup of the live data before staging the site restore...');
    const before = path.basename(await this.createBackupNow(ctx, { skipCleanup: true, requireComplete: true, safetyBackup: true }));
    logger.info(`✅ Live data backed up to ${before}`);

    discardSiteRestore(siteFile);
    beginSiteRestore(siteFile, {
      stagedAt: new Date().toISOString(),
      backup: String(backupData.timestamp ?? ''),
      source: path.basename(backupPath),
      stagedBy: actorOf(ctx).user,
      safetyBackup: before
    });
    // The databases first, as before (#1723); then the rest in registration order.
    const ordered = [...names].sort((a, b) => Number(b === 'DatabaseManager') - Number(a === 'DatabaseManager'));
    try {
      for (const name of ordered) {
        logger.info(`📦 Staging ${name}...`);
        const restoreOptions = {
          ctx, directory, source: path.basename(backupPath), safetyBackup: before, siteRestore: stagingFor(siteFile, name),
          replaceStaged: options.replaceStaged || Boolean(databaseStaged), readArchive: archiveReader(directory)
        };
        // #1985: declared folders and files are staged here; the manager writes no restore code for them.
        const declared = this.declaredFor(name);
        if (declared.length > 0) {
          await stageDeclaredParts(name, declared, backupData.managers[name] as BaseBackupData, restoreOptions);
          continue;
        }
        await this.managerFor(name)!.restore(backupData.managers[name] as BaseBackupData, restoreOptions);
      }
      // #1876: the instance .env, BackupManager's own part; applied at the very start of the process.
      const env = (backupData.managers.BackupManager as { data?: { env?: DirectoryBackupData | null } } | undefined)?.data?.env;
      const envFile = this.instanceEnvFile();
      if (env && envFile) {
        logger.info('📦 Staging the instance .env...');
        await stageFilePart(INSTANCE_ENV_PART, envFile, env, { ctx, directory, siteRestore: stagingFor(siteFile, INSTANCE_ENV_PART) }, { whenAbsent: '' });
      }
      const committed = commitSiteRestore(siteFile);
      // #1876: every part of the backup that is not in the restore — no staged
      // restore here, or a staged one that found nothing to stage.
      const recorded = new Set(committed.parts.map((p) => p.manager));
      await this.writeRestoreReport(backupPath, backupData, Object.keys(backupData.managers).filter((n) => !recorded.has(n)), actorOf(ctx).user);
    } catch (err) {
      discardSiteRestore(siteFile);
      this.removeRestoreReport();
      throw new Error(`The site restore was not staged, and nothing was changed: ${(err as Error).message}`, { cause: err });
    }
    const message = `${ordered.join(', ')} from the backup taken ${String(backupData.timestamp)} are staged. Restart the site to put them in place, all together; the current data of each is kept beside it as *.pre-restore. The current data was backed up first, as ${before}.`;
    logger.warn(`[BackupManager] Site restore staged: ${message} (#1876)`);
    await this.notifyAdmins('warning', 'A site restore is staged', message);
  }

  /**
   * Throw away a staged site restore before the restart applies it (#1876):
   * every staged file and the record are removed, the live data is
   * untouched. Recorded first (`backup-restore-cancel`, refuse).
   */
  async cancelStagedSiteRestore(ctx: ActorContext): Promise<SiteRestoreManifest> {
    const staged = this.getStagedSiteRestore();
    if (!staged) throw new Error('No site restore is staged');
    const who = actorOf(ctx);
    await recordAuditEvent(this.engine.getManager('AuditManager'), {
      eventType: AUDIT_EVENT.BACKUP_RESTORE_CANCEL,
      ...who,
      action: 'backup-restore-cancel',
      result: 'success',
      severity: 'high',
      resource: staged.source || staged.backup,
      resourceType: 'backup',
      metadata: { ...who.metadata, stagedAt: staged.stagedAt, stagedBy: staged.stagedBy, parts: staged.parts.map((p) => p.manager) }
    });
    discardSiteRestore(this.siteRestorePath());
    this.removeRestoreReport();
    logger.warn(`[BackupManager] Staged site restore from ${staged.source || staged.backup} cancelled by ${who.user} (#1876)`);
    return staged;
  }

  /** Where this manager keeps the report of a staged restore: beside the site restore manifest (#1876). */
  private restoreReportPath(): string {
    return `${this.siteRestorePath()}.report.json`;
  }

  private removeRestoreReport(): void {
    rmSync(this.restoreReportPath(), { force: true });
  }

  /**
   * Record, when a restore is staged, what it will not bring back (#1876):
   * the parts of the backup not in it, and the job runs since the backup,
   * read from the live job state now, before the restore replaces it.
   */
  private async writeRestoreReport(backupPath: string, backupData: BackupData, notStaged: string[], stagedBy: string): Promise<void> {
    const since = String(backupData.timestamp ?? '');
    let jobRuns: JobRunSince[] = [];
    try {
      jobRuns = await this.engine.getManager<{ runsSince(since: string): Promise<JobRunSince[]> }>('BackgroundJobManager')?.runsSince?.(since) ?? [];
    } catch (err) {
      logger.warn('[BackupManager] The job runs since the backup could not be read for the restore report:', err);
    }
    const notRestored = notStaged.filter((name) => !NO_SITE_DATA.has(name) && slotHoldsData(backupData.managers[name]));
    const report: RestoreReport = { version: 1, source: path.basename(backupPath), backup: since, notRestored, jobRuns, stagedBy };
    writeFileSync(this.restoreReportPath(), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  }

  /**
   * Tell admins what this start did with a staged restore (#1876). Called
   * once every manager and add-on has started (`WikiEngine.initializeAddons`):
   * each owner applied (or set aside) its part as it started, add-ons last.
   * After any restore that was applied, a critical notification lists what it
   * did not bring back, and the job runs between the backup and the restore.
   */
  async reportRestoreAtBoot(): Promise<void> {
    const siteFile = this.siteRestorePath();
    let finished: SiteRestoreManifest | null;
    try {
      finished = finishSiteRestoreAtBoot(siteFile);
    } catch (err) {
      const message = `The site restore record ${path.basename(siteFile)} could not be read at start: ${(err as Error).message}`;
      logger.error(`❌ ${message}`);
      await this.notifyAdmins('error', 'A site restore could not be checked', message);
      return;
    }
    const databasesOnly = finished ? [] : this.engine.getManager<DatabaseManager>('DatabaseManager')?.getRestoredAtStart?.() ?? [];
    const applied = finished ? finished.parts.filter((p) => p.status === 'applied').map((p) => p.manager) : databasesOnly.length > 0 ? ['DatabaseManager'] : [];
    if (applied.length > 0) {
      const report = this.readRestoreReport();
      await this.recordRestoreApplied(applied, finished, report);
      await this.reportNotRestored(applied, finished ? finished.parts.filter((p) => p.status !== 'applied').map((p) => p.manager) : [], report);
    }
    this.removeRestoreReport();
    if (finished) await this.reportSiteRestoreOutcome(finished);
  }

  /**
   * The critical notification after a restore was applied (#1876): every
   * part of the site it did not bring back, and the job runs between the
   * backup and the restore (name, last run, result), which are not in the
   * restored job history. Jobs are never run again because of a restore.
   */
  private async reportNotRestored(applied: string[], notApplied: string[], report: RestoreReport | null): Promise<void> {
    const jobs = this.engine.getManager<{ getRunsReplacedAtStart?(): JobRunSince[]; displayNameOf?(id: string): string }>('BackgroundJobManager');
    const runs = new Map<string, JobRunSince>();
    for (const r of [...(report?.jobRuns ?? []), ...(jobs?.getRunsReplacedAtStart?.() ?? [])]) runs.set(`${r.jobId}@${r.startedAt}`, r);
    const notRestored = [...new Set([...(report?.notRestored ?? []), ...notApplied])].map(restoreLabel);
    const message = describeNotRestored({
      source: report?.source ?? 'a backup', backup: report?.backup ?? '', applied: applied.map(restoreLabel), notRestored,
      jobRuns: [...runs.values()], nameOf: (id) => jobs?.displayNameOf?.(id) ?? id, missingReport: !report
    });
    logger.error(`[BackupManager] ${message} (#1876)`);
    await this.notifyAdmins('error', 'Critical: a restore did not bring everything back', message);
  }

  /** The report written when the restore was staged, or null. */
  private readRestoreReport(): RestoreReport | null {
    try {
      const file = this.restoreReportPath();
      return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as RestoreReport : null;
    } catch (err) {
      logger.error('[BackupManager] The restore report could not be read:', err);
      return null;
    }
  }

  /**
   * `backup-restore-applied` (#1876, operator-approved): written at the start
   * that applied a restore, so into the restored audit log — which otherwise
   * would not say a restore happened (the `backup-restore` record of the
   * staging is in the log it replaced). Names the backup, when it was taken,
   * who started the restore and what was put back. on-failure: continue — the
   * restore is already in place.
   */
  private async recordRestoreApplied(applied: string[], finished: SiteRestoreManifest | null, report: RestoreReport | null): Promise<void> {
    const who = actorOf(systemContext(this.engine, 'a staged restore was applied at start'));
    const source = finished?.source || report?.source || 'unknown';
    await recordAuditEvent(this.engine.getManager('AuditManager'), {
      eventType: AUDIT_EVENT.BACKUP_RESTORE_APPLIED,
      ...who,
      action: 'backup-restore-applied',
      result: 'success',
      severity: 'high',
      resource: source,
      resourceType: 'backup',
      metadata: {
        ...who.metadata,
        source,
        backupTakenAt: finished?.backup || report?.backup || null,
        startedBy: finished?.stagedBy || report?.stagedBy || null,
        kind: finished ? 'site' : 'databases',
        applied
      }
    }, (err) => logger.warn('[BackupManager] Audit record failed for backup-restore-applied:', err));
  }

  /** Tell admins what the start did with a staged site restore (#1876). */
  private async reportSiteRestoreOutcome(finished: SiteRestoreManifest): Promise<void> {
    const applied = finished.parts.filter((p) => p.status === 'applied').map((p) => p.manager);
    const notApplied = finished.parts.filter((p) => p.status !== 'applied').map((p) => p.manager);
    const from = `the backup ${finished.source || finished.backup}`;
    const undo = finished.safetyBackup ? ` The data from before was backed up as ${finished.safetyBackup}.` : '';
    if (notApplied.length === 0) {
      const message = `Restored at start from ${from}: ${applied.join(', ')}. The previous data of each is kept beside it as *.pre-restore.${undo}`;
      logger.warn(`[BackupManager] ${message} (#1876)`);
      await this.notifyAdmins('success', 'A site restore was applied', message);
    } else if (applied.length === 0) {
      const message = `The restore from ${from} was not applied: ${finished.reason ?? 'it was refused'}. Nothing was restored; the staged files were set aside as *.incomplete, and the site started on its current data.`;
      logger.error(`❌ ${message} (#1876)`);
      await this.notifyAdmins('error', 'A site restore was not applied', message);
    } else {
      const message = `The restore from ${from} was applied only in part: ${applied.join(', ')} restored; ${notApplied.join(', ')} not (${finished.reason ?? 'refused'}). The previous data of each restored part is kept as *.pre-restore.${undo}`;
      logger.error(`❌ ${message} (#1876)`);
      await this.notifyAdmins('error', 'A site restore was applied only in part', message);
    }
  }

  /**
   * The backups in the backup directory with the database files beside each
   * (#1723): what Admin → Backup offers to download and restore. Read from
   * the file names, so no document is opened to list them.
   */
  async listStoredBackups(): Promise<StoredBackup[]> {
    const backups = await this.listBackups();
    if (!this.provider || backups.length === 0) return [];
    const objects = await this.provider.listBackupObjects();
    // #1563: one pruned between the two listings is gone, not listed without its files.
    const present = new Set(objects.map((o) => o.filename));
    return backups.filter((b) => present.has(b.filename)).map((b) => {
      const companions = objects.filter((o) => isCompanionOf(o.filename, b.filename));
      const stem = backupStem(b.filename);
      return {
        ...b,
        databases: companions.filter((o) => o.filename.endsWith('.db')).map((o) => o.filename.slice(stem.length + 1, -'.db'.length)).sort(),
        parts: companions.filter((o) => !o.filename.endsWith('.db')).map((o) => o.filename.slice(stem.length + 1).replace(/\.tar(\.enc)?$/, '')).sort(),
        files: companions.map((o) => o.filename).sort(),
        encrypted: b.filename.endsWith(ENCRYPTED_SUFFIX),
        totalSize: b.size + companions.reduce((n, o) => n + o.size, 0)
      };
    });
  }

  /** A backup in the backup directory by its bare filename, or null: never a path the caller made up. */
  async findStoredBackup(filename: string): Promise<StoredBackup | null> {
    return (await this.listStoredBackups()).find((b) => b.filename === filename) ?? null;
  }

  /**
   * One backup as a `.tar` stream (#1723, D2): the document and every file
   * beside it — the databases, and the archives of attachment files, role
   * membership, persons, organizations, footnotes and comments (#1876) —
   * read from disk as the stream is consumed, never built in memory. With
   * the backup key set every file in it is encrypted under that key, which
   * is never in the archive (#1723, #1561).
   */
  async backupArchive(filename: string): Promise<{ name: string; stream: Readable }> {
    const backup = await this.findStoredBackup(filename);
    if (!backup || !this.backupDirectory) throw new Error(`No backup named ${filename} in the backup directory`);
    const stem = backupStem(backup.filename);
    const files = [backup.filename, ...backup.files];
    const stream = createTar({ cwd: this.backupDirectory, portable: true, noDirRecurse: true }, files) as unknown as Readable;
    return { name: `${stem}.tar`, stream };
  }

  /** Whether a restore started from Admin → Backup is still taking its fresh backup or staging. */
  isRestoreRunning(): boolean {
    return this.restoreRunning !== null;
  }

  /** The managers on this site whose restore is staged (#1876), in registration order: what a site restore stages. */
  private stagedManagerNames(): string[] {
    const names = this.registeredEntries().filter((name) => this.restoresStaged(name));
    // #1985: an add-on's files under an entry no manager of that name has (`addon:<slug>`).
    for (const { entry } of this.addonParts()) if (!names.includes(entry)) names.push(entry);
    return names;
  }

  /**
   * What a whole-site restore on this site puts back and what it does not
   * (#1945), in the words admins read: the labels of the "not restored"
   * notification (`restoreLabel`, `NEVER_IN_A_BACKUP`), so the restore card
   * and the notification after the restart say the same. Read from the
   * managers on this site, not from any backup: a backup can hold less (the
   * credentials store of one taken without the backup key), never more.
   */
  siteRestoreScope(): { restored: string[]; notRestored: string[] } {
    const databases = this.engine.getManager<DatabaseManager>('DatabaseManager');
    const restored = this.stagedManagerNames()
      .filter((name) => name !== 'DatabaseManager' || databases?.isEnabled?.() !== false)
      .map(restoreLabel);
    const notRestored = Object.keys(RESTORE_LABELS)
      .filter((name) => name !== 'BackupManager' && this.managerFor(name) && !this.restoresStaged(name))
      .map(restoreLabel);
    return { restored, notRestored: [...notRestored, ...NEVER_IN_A_BACKUP] };
  }

  /**
   * The restore waiting for the next start, whichever it is (#1945): a site
   * restore, or a databases-only one. A site restore stages the databases
   * too, so it is the one named while both records are there.
   */
  getStagedRestore(): { scope: RestoreScope; source: string; stagedBy: string } | null {
    let site: SiteRestoreManifest | null;
    try {
      site = this.getStagedSiteRestore();
    } catch (err) {
      throw new Error(`A site restore record is there but can't be read (${(err as Error).message})`, { cause: err });
    }
    if (site) return { scope: 'site', source: site.source || site.backup, stagedBy: site.stagedBy };
    const databases = this.engine.getManager<DatabaseManager>('DatabaseManager')?.getStagedRestore?.() ?? null;
    return databases ? { scope: 'databases', source: databases.source || databases.backup, stagedBy: databases.stagedBy } : null;
  }

  /**
   * Throw away the restore waiting for the next start, whichever it is
   * (#1945): a staged site restore through `cancelStagedSiteRestore`, a
   * databases-only one through `DatabaseManager.cancelStagedRestore`. Each
   * records `backup-restore-cancel` first (refuse).
   */
  async cancelStagedRestore(ctx: ActorContext): Promise<{ scope: RestoreScope; source: string }> {
    const staged = this.getStagedRestore();
    if (!staged) throw new Error('No restore is staged');
    if (staged.scope === 'site') {
      await this.cancelStagedSiteRestore(ctx);
    } else {
      const databaseManager = this.engine.getManager<DatabaseManager>('DatabaseManager');
      if (!databaseManager) throw new Error('DatabaseManager is not available');
      await databaseManager.cancelStagedRestore(ctx);
    }
    return { scope: staged.scope, source: staged.source };
  }

  /**
   * Start a restore of a stored backup from Admin → Backup: recorded, then a
   * fresh backup of the live data and the staging run in the background, and
   * admins are told when it is staged or why it was not. Nothing changes
   * until the next restart, which the site never does by itself. Refused
   * while another is being prepared, and when a restore is already staged
   * unless `replace` says to replace it.
   *
   * - `scope: 'databases'` (the default; #1723, D1): the databases only.
   *   Refused while a site restore is staged, since that includes them.
   * - `scope: 'site'` (#1945): a whole-site restore, every manager whose
   *   restore is staged and the instance .env, all or nothing
   *   (`stageSiteRestore`), from any stored backup. It replaces a staged
   *   restore of either kind only with `replace`.
   *
   * @returns the running restore, for a caller (a test) that waits on it.
   */
  async startRestore(ctx: ActorContext, filename: string, options: { replace?: boolean; scope?: RestoreScope } = {}): Promise<{ done: Promise<RestoreResults | null> }> {
    const scope: RestoreScope = options.scope ?? 'databases';
    if (scope !== 'databases' && scope !== 'site') throw new Error(`Unknown restore scope ${String(scope)}`);
    if (this.restoreRunning) throw new Error('A restore is already being prepared; wait for it to finish');
    const backup = await this.findStoredBackup(filename);
    if (!backup) throw new Error(`No backup named ${filename} in the backup directory`);
    let staged: { source: string; stagedBy: string } | null;
    if (scope === 'databases') {
      if (backup.databases.length === 0) throw new Error(`Backup ${filename} holds no database to restore`);
      const databaseManager = this.engine.getManager<DatabaseManager>('DatabaseManager');
      if (!databaseManager) throw new Error('DatabaseManager is not available');
      this.refuseIfSiteRestoreStaged();
      const manifest = databaseManager.getStagedRestore();
      staged = manifest ? { source: manifest.source || manifest.backup, stagedBy: manifest.stagedBy } : null;
    } else {
      staged = this.getStagedRestore();
    }
    if (staged && !options.replace) throw new Error(`A restore from ${staged.source} is already staged; cancel it or replace it`);
    if (!staged && options.replace) throw new Error('There is no staged restore to replace');

    // Recorded before anything happens (refuse): a restore that cannot be recorded does not start.
    const who = actorOf(ctx);
    await recordAuditEvent(this.engine.getManager('AuditManager'), {
      eventType: staged ? AUDIT_EVENT.BACKUP_RESTORE_REPLACE : AUDIT_EVENT.BACKUP_RESTORE,
      ...who,
      action: staged ? 'backup-restore-replace' : 'backup-restore',
      result: 'success',
      severity: 'high',
      resource: backup.filename,
      resourceType: 'backup',
      metadata: {
        ...who.metadata, scope, databases: backup.databases,
        ...(scope === 'site' ? { parts: backup.parts } : {}),
        ...(staged ? { replaces: staged.source, replacesStagedBy: staged.stagedBy } : {})
      }
    });

    // A site restore names only the managers whose restore is staged, so
    // nothing is ever restored live from here (#1945).
    const managerFilter = scope === 'site' ? this.stagedManagerNames() : ['DatabaseManager'];
    const unchanged = scope === 'site' ? "The site's data stays as it is." : 'The current databases stay as they are.';
    const done = this.restoreFromFile(ctx, backup.path, { managerFilter, replaceStaged: Boolean(staged) })
      .catch(async (err: Error) => {
        logger.error(`❌ Restore of ${filename} was not staged:`, err);
        await this.notifyAdmins('error', `Restore of ${filename} was not staged`, `${err.message}. ${unchanged}`);
        return null;
      })
      .finally(() => { this.restoreRunning = null; });
    this.restoreRunning = done;
    return { done };
  }

  /**
   * List all available backups
   * @returns {Promise<BackupFileInfo[]>} List of backup files with metadata
   */
  async listBackups(): Promise<BackupFileInfo[]> {
    try {
      if (!this.backupDirectory || !this.provider) {
        return [];
      }

      // Storage listing comes from the provider (#170); the backup-naming
      // convention stays this manager's concern.
      const objects = await this.provider.listBackupObjects();
      const backups = objects
        .filter(o =>
          // Support both old format (ngdpbase-backup-{timestamp}) and new format ({timestamp}-ngdpbase-backup)
          (o.filename.startsWith('ngdpbase-backup-') || /-ngdpbase-backup\.json\.gz(\.enc)?$/.test(o.filename))
          && /\.json\.gz(\.enc)?$/.test(o.filename)
        )
        .map(o => ({
          filename: o.filename,
          path: o.path,
          size: o.size,
          created: o.created,
          modified: o.modified
        }));

      // Sort by creation time, newest first
      backups.sort((a: BackupFileInfo, b: BackupFileInfo) => b.created.getTime() - a.created.getTime());

      return backups;
    } catch (error) {
      logger.error('❌ Failed to list backups:', error);
      return [];
    }
  }

  /**
   * Clean up old backups, keeping only maxBackups most recent
   * @private
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const backups = await this.listBackups();

      if (backups.length <= this.maxBackups) {
        logger.info(`📊 ${backups.length} backups exist, no cleanup needed`);
        return;
      }

      // Delete oldest backups
      const toDelete = backups.slice(this.maxBackups);
      logger.info(`🗑️  Cleaning up ${toDelete.length} old backups`);

      for (const backup of toDelete) {
        await this.provider?.removeBackup(backup.path);
        await this.removeCompanions(backup.filename);
        logger.info(`🗑️  Deleted: ${backup.filename}`);
      }
    } catch (error) {
      logger.warn('⚠️  Failed to cleanup old backups:', error);
      // Don't throw - cleanup failure shouldn't fail the backup
    }
  }

  /**
   * Get the most recent backup file path
   * @returns {Promise<string | null>} Path to most recent backup, or null if none exist
   */
  async getLatestBackup(): Promise<string | null> {
    const backups = await this.listBackups();
    return backups.length > 0 ? backups[0].path : null;
  }

  /**
   * Return current auto-backup configuration and last backup info for the admin UI.
   */
  async getAutoBackupStatus(): Promise<{ config: AutoBackupConfig; lastBackup: Date | null }> {
    const backups = await this.listBackups();
    return {
      config: {
        enabled: this.autoBackupEnabled,
        time: this.autoBackupTime,
        days: this.autoBackupDays,
        maxBackups: this.maxBackups,
        directory: this.backupDirectory ?? ''
      },
      lastBackup: backups.length > 0 ? backups[0].created : null
    };
  }

  /**
   * Update auto-backup configuration and persist to config store.
   * Restarts the scheduler with the new settings.
   */
  async updateAutoBackupConfig(config: Partial<AutoBackupConfig>, ctx: ActorContext): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) throw new Error('ConfigurationManager not available');

    if (config.enabled !== undefined) {
      await configManager.setProperty('ngdpbase.backup.auto-backup', config.enabled, ctx);
      this.autoBackupEnabled = config.enabled;
    }
    if (config.time !== undefined) {
      await configManager.setProperty('ngdpbase.backup.auto-backup-time', config.time, ctx);
      this.autoBackupTime = config.time;
    }
    if (config.days !== undefined) {
      await configManager.setProperty('ngdpbase.backup.auto-backup-days', config.days, ctx);
      this.autoBackupDays = config.days;
    }
    if (config.maxBackups !== undefined) {
      await configManager.setProperty('ngdpbase.backup.max-backups', config.maxBackups, ctx);
      this.maxBackups = config.maxBackups;
    }
    if (config.directory !== undefined) {
      await configManager.setProperty('ngdpbase.backup.directory', config.directory, ctx);
      this.backupDirectory = config.directory;
      // #170: re-point the storage provider at the new directory.
      await this.provider?.setBackupDirectory(config.directory);
    }

    // The job takes the new settings; a changed rule counts its slots from now (#1720).
    this.scheduleAutoBackup();

    logger.info(`✅ Auto-backup config updated: ${this.autoBackupEnabled ? `enabled at ${this.autoBackupTime} (${this.autoBackupDays})` : 'disabled'}`);
  }

  /**
   * Automatic backups as a scheduled job (#1720, epic #1611).
   *
   * They ran from a timer that checked every minute for an exact match of the
   * clock, so a server that was down at the backup time — or a tick that
   * landed a minute late — skipped that backup and left no record that it had
   * (operator: backups are never silent, #1563). As a scheduled job a backup
   * missed while the server was down runs once when it is back (`catchUp:
   * 'latest'`), a failed one is tried again and then reported, and the run
   * survives a restart. A backup still running when the next one comes due is
   * not doubled (`overlap: 'skip'`).
   *
   * Called at start and whenever the settings change. With automatic backups
   * off, or a setting that cannot be read, the job is registered without a
   * schedule: it can still be run by hand, and nothing runs by itself.
   */
  private scheduleAutoBackup(): void {
    const jobs = this.engine.getManager<BackgroundJobManager>('BackgroundJobManager');
    if (!jobs) {
      if (this.autoBackupEnabled) logger.error('❌ Automatic backups are ON but BackgroundJobManager is not available — NO automatic backup will run');
      return;
    }
    const def: JobDefinition = {
      id: AUTO_BACKUP_JOB_ID,
      displayName: 'Automatic backup',
      run: async (_progress, ctx) => {
        // #1196: the run's context names the system principal on a schedule, or the admin who ran it.
        const file = await this.createBackup(ctx);
        return { success: true, summary: `Backup written: ${file}` };
      }
    };
    if (!this.autoBackupEnabled || !this.provider) {
      jobs.registerJob(def);
      return;
    }
    try {
      jobs.registerJob({
        ...def,
        schedule: autoBackupSchedule(this.autoBackupTime, this.autoBackupDays, serverTimeZone()),
        catchUp: 'latest',
        overlap: 'skip',
        persist: true
      });
      logger.info(`🕐 Automatic backup scheduled: ${this.autoBackupTime} (${this.autoBackupDays}), ${serverTimeZone()}`);
    } catch (err) {
      jobs.registerJob(def);
      logger.error(`❌ Automatic backups are ON but NOT scheduled: ${(err as Error).message}. Fix the setting in Admin → Backup.`);
      void this.engine.getManager<{ addNotification(n: object): Promise<string> }>('NotificationManager')?.addNotification({
        type: 'system', level: 'error', title: 'Automatic backups are not running',
        message: `${(err as Error).message}. Fix the setting in Admin → Backup.`
      }).catch(() => undefined);
    }
  }
}

export default BackupManager;

