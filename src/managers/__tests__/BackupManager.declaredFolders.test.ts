/**
 * #1985 — managers declare their folders, and BackupManager does the work.
 *
 * - A manager that declares a folder (`backupFolders()`) writes no backup
 *   code: BackupManager archives it beside the document, stages it in a site
 *   restore, and puts it in place at the next start in
 *   `BaseManager.initialize()`, before the subclass reads it.
 * - An add-on's `dataPath` is backed up and restored with no add-on code, as
 *   is any further folder its module declares; AddonsManager puts the staged
 *   copy in place before the add-on's `register()` runs.
 *
 * The real BackupManager, AddonsManager and a real add-on folder in a
 * mkdtemp directory; configuration is a stand-in. Each test removes only its
 * own directory.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import BaseManager, { type BackupFolder } from '../BaseManager';
import BackupManager from '../BackupManager';
import { decryptBuffer } from '../../utils/backupCrypto';
import { BACKUP_KEY_ENV } from '../../utils/backupKey';
import { applyInstanceEnvAtStart } from '../../utils/instanceEnvBackup';

const SLOT = '__declaredFoldersTest';
const KEY = 'backup-key-not-a-secret';
const CTX = { username: 'admin', roles: ['admin'], isAuthenticated: true };

let dir: string;
let notifications: Array<{ level: string; title: string; message: string }>;
const savedKey = process.env[BACKUP_KEY_ENV];

const paths = () => ({
  fast: path.join(dir, 'fast'),
  notes: path.join(dir, 'fast', 'notes'),
  addons: path.join(dir, 'addons'),
  ledgerData: path.join(dir, 'fast', 'ledger'),
  ledgerExtra: path.join(dir, 'slow', 'ledger-attachments'),
  backups: path.join(dir, 'slow', 'backups'),
  siteRestore: path.join(dir, 'fast', 'site-restore.json')
});

/** A core manager with one folder, which it reads at start, as RoleManager reads its records. */
class NotesManager extends BaseManager {
  seenAtStart: string | null = null;
  override backupFolders(): BackupFolder[] {
    return [{ part: 'notes', folder: paths().notes }];
  }
  override async initialize(): Promise<void> {
    await super.initialize();
    this.seenAtStart = fs.readFileSync(path.join(paths().notes, 'note.txt'), 'utf8');
  }
}

/** An add-on that keeps files under its dataPath and one more folder, and reads both in register(): it writes no backup code. */
function writeLedgerAddon(): void {
  const addonDir = path.join(paths().addons, 'ledger');
  fs.mkdirSync(addonDir, { recursive: true });
  fs.writeFileSync(path.join(addonDir, 'package.json'), JSON.stringify({ name: 'ledger', version: '1.0.0' }));
  fs.writeFileSync(path.join(addonDir, 'index.js'), `
const fs = require('fs');
const path = require('path');
module.exports = {
  name: 'ledger',
  version: '1.0.0',
  backupFolders: (config) => [{ part: 'ledger-attachments', folder: config.attachmentsPath }],
  register: (engine, config) => {
    globalThis['${SLOT}'] = {
      data: fs.readFileSync(path.join(config.dataPath, 'books.json'), 'utf8'),
      extra: fs.readFileSync(path.join(config.attachmentsPath, 'receipt.txt'), 'utf8')
    };
  }
};
`);
}

/** One start of the site: the core manager, BackupManager, then the add-ons, as WikiEngine starts them. */
async function start(): Promise<{ backup: BackupManager; notes: NotesManager; managers: Record<string, unknown> }> {
  const p = paths();
  // What bootstrap-env does before any manager: a staged .env goes in first (#1876).
  applyInstanceEnvAtStart(p.fast, p.siteRestore);
  const props: Record<string, unknown> = {
    'ngdpbase.backup.max-backups': 10,
    'ngdpbase.managers.addons-manager.enabled': true,
    'ngdpbase.managers.addons-manager.addons-path': p.addons,
    'ngdpbase.addons': {},
    'ngdpbase.version': '99.0.0',
    'ngdpbase.addons.ledger.enabled': true,
    'ngdpbase.addons.ledger.dataPath': p.ledgerData,
    'ngdpbase.addons.ledger.attachmentsPath': p.ledgerExtra
  };
  const resolved: Record<string, string> = { 'ngdpbase.backup.directory': p.backups, 'ngdpbase.backup.restore-manifest': p.siteRestore };
  const managers: Record<string, unknown> = {
    ConfigurationManager: {
      getProperty: (key: string, def: unknown) => (key in props ? props[key] : def),
      getAllProperties: () => props,
      getResolvedDataPath: (key: string, def: string) => resolved[key] ?? path.join(dir, 'fast', path.basename(def)),
      resolveDataPath: (name: string) => path.join(p.fast, name),
      getInstanceDataFolder: () => p.fast,
      getAddonDeclaredDefaults: () => ({}),
      getCustomProperty: () => null,
      setRuntimeProperty: () => undefined,
      setProperty: async (key: string, value: unknown) => { props[key] = value; }
    },
    NotificationManager: {
      notifyAdmins: async (n: { level: string; title: string; message: string }) => { notifications.push(n); return 'id'; },
      getAllNotifications: () => notifications
    },
    AuditManager: { logAuditEvent: async () => 'evt', flushAuditQueue: async () => undefined }
  };
  const order: string[] = [];
  const engine = { getManager: (n: string) => managers[n] ?? null, getRegisteredManagers: () => order };
  const register = (name: string, m: unknown): void => { managers[name] = m; order.push(name); };

  const notes = new NotesManager(engine);
  register('NotesManager', notes);
  await notes.initialize();
  const backup = new BackupManager(engine);
  register('BackupManager', backup);
  await backup.initialize();
  const { default: AddonsManager } = await import('../AddonsManager');
  const addons = new AddonsManager(engine);
  register('AddonsManager', addons);
  await addons.initialize();
  await backup.reportRestoreAtBoot();
  return { backup, notes, managers };
}

async function documentOf(file: string): Promise<{ managers: Record<string, { data?: unknown }> }> {
  return JSON.parse(gunzipSync(await decryptBuffer(fs.readFileSync(file), KEY)).toString('utf8'));
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1985-'));
  notifications = [];
  process.env[BACKUP_KEY_ENV] = KEY;
  const p = paths();
  for (const d of [p.notes, p.ledgerData, p.ledgerExtra, p.backups]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(p.notes, 'note.txt'), 'note as backed up');
  fs.writeFileSync(path.join(p.ledgerData, 'books.json'), '{"as":"backed up"}');
  fs.writeFileSync(path.join(p.ledgerExtra, 'receipt.txt'), 'receipt as backed up');
  writeLedgerAddon();
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>)[SLOT];
  if (savedKey === undefined) delete process.env[BACKUP_KEY_ENV]; else process.env[BACKUP_KEY_ENV] = savedKey;
  // Only this test's own temp directory.
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('declared folders are BackupManager\'s (#1985)', () => {
  test('a manager\'s declared folder and an add-on\'s dataPath are backed up beside the document, with no code of their own', async () => {
    const site = await start();
    const file = await site.backup.createBackup(CTX);
    const stem = path.basename(file).replace(/\.json\.gz\.enc$/, '');
    expect(fs.readdirSync(paths().backups).filter((f) => f !== path.basename(file)).sort())
      .toEqual([`${stem}.env.tar.enc`, `${stem}.ledger-attachments.tar.enc`, `${stem}.ledger.tar.enc`, `${stem}.notes.tar.enc`]);
    const doc = await documentOf(file);
    // One part and no data of its own: the entry's data is the part's record, as every backup since v5.21 has it.
    expect(doc.managers.NotesManager.data).toMatchObject({ format: 1, archive: `${stem}.notes.tar.enc`, files: 1 });
    // An add-on's folders under an entry no manager name can be; two parts, so each under its part name.
    expect(doc.managers['addon:ledger'].data).toMatchObject({
      ledger: { format: 1, archive: `${stem}.ledger.tar.enc`, files: 1 },
      'ledger-attachments': { format: 1, archive: `${stem}.ledger-attachments.tar.enc`, files: 1 }
    });
    // Admin → Backup's whole-site card names what it puts back.
    expect(site.backup.siteRestoreScope().restored).toEqual(expect.arrayContaining(['NotesManager', "the ledger add-on's files"]));
  });

  test('a site restore stages them; at the next start each is in place before its owner reads it', async () => {
    const site = await start();
    expect(site.notes.seenAtStart).toBe('note as backed up');
    expect((globalThis as Record<string, { data: string }>)[SLOT].data).toBe('{"as":"backed up"}');
    const file = await site.backup.createBackup(CTX);

    // The site goes on after the backup.
    const p = paths();
    fs.writeFileSync(path.join(p.notes, 'note.txt'), 'note edited later');
    fs.writeFileSync(path.join(p.ledgerData, 'books.json'), '{"as":"edited later"}');
    fs.writeFileSync(path.join(p.ledgerExtra, 'receipt.txt'), 'receipt edited later');

    const results = await site.backup.restoreFromFile(CTX, file);
    expect(results.success).toEqual(expect.arrayContaining(['NotesManager', 'addon:ledger']));
    // Staged beside the live folders; nothing live has changed.
    expect(fs.existsSync(`${p.notes}.staged`)).toBe(true);
    expect(fs.existsSync(`${p.ledgerData}.staged`)).toBe(true);
    expect(fs.readFileSync(path.join(p.notes, 'note.txt'), 'utf8')).toBe('note edited later');

    notifications = [];
    const restarted = await start();
    // The ordering guarantee: what each owner read at start is the backup's.
    expect(restarted.notes.seenAtStart).toBe('note as backed up');
    expect((globalThis as Record<string, { data: string; extra: string }>)[SLOT]).toEqual({ data: '{"as":"backed up"}', extra: 'receipt as backed up' });
    expect(fs.readFileSync(path.join(`${p.notes}.pre-restore`, 'note.txt'), 'utf8')).toBe('note edited later');
    expect(fs.readFileSync(path.join(`${p.ledgerData}.pre-restore`, 'books.json'), 'utf8')).toBe('{"as":"edited later"}');
    expect(notifications.map((n) => n.title)).toContain('A site restore was applied');
    expect(fs.existsSync(p.siteRestore)).toBe(false);
  });

  test('a declared part not applied at start is said on the dashboard, and nothing of it is put in place', async () => {
    const site = await start();
    const file = await site.backup.createBackup(CTX);
    await site.backup.restoreFromFile(CTX, file);
    // The add-on's staged copy is lost before the restart: the parts belong together, so none is applied.
    fs.rmSync(`${paths().ledgerData}.staged`, { recursive: true });
    fs.writeFileSync(path.join(paths().notes, 'note.txt'), 'note edited later');
    const restarted = await start();
    expect(restarted.notes.seenAtStart).toBe('note edited later');
    expect(restarted.notes.getManagerStatus()).toMatchObject({ state: 'degraded', kind: 'attention', reason: expect.stringMatching(/A staged restore of notes was not applied/) });
    expect(notifications.map((n) => n.title)).toContain('A site restore was not applied');
  });

  test('a manager declaring folders is staged by default; one declaring none writes live', () => {
    const engine = { getManager: () => null } as never;
    expect(new NotesManager(engine).restoreIsStaged()).toBe(true);
    class PlainManager extends BaseManager {}
    expect(new PlainManager(engine).restoreIsStaged()).toBe(false);
    expect(new PlainManager(engine).backupFolders()).toEqual([]);
  });
});
