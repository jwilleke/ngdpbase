/**
 * #1215 — the admin-system actions that change authority, destroy, or disclose
 * leave a record.
 *
 * config-reset is critical: recorded and flushed BEFORE the custom file is
 * emptied, refused when the record cannot be written. Sabotage: move the
 * recordAuditEvent call in resetToDefaults below the assignment, or wrap it
 * in try/catch, and the refusal test goes red.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import ConfigurationManager from '../ConfigurationManager';
import BackupManager from '../BackupManager';
import AuditManager from '../AuditManager';
import type { WikiEngine } from '../../types/WikiEngine';

interface Recorded { eventType: string; user: string; ipAddress?: string; metadata: Record<string, unknown>; resource?: string }

function sinkEngine(sink: Recorded[], opts: { auditFails?: boolean; extra?: Record<string, unknown> } = {}): WikiEngine {
  const logAuditEvent = opts.auditFails
    ? vi.fn().mockRejectedValue(new Error('audit disk full'))
    : vi.fn(async (e: Recorded) => { sink.push(e); return 'id'; });
  return {
    getManager: vi.fn((name: string) => {
      if (name === 'AuditManager') return { logAuditEvent, flushAuditQueue: () => Promise.resolve() };
      return opts.extra?.[name] ?? null;
    }),
    getRegisteredManagers: () => []
  };
}

const ADMIN = { username: 'root', ipAddress: '203.0.113.7' };

describe('#1215 config-reset is critical', () => {
  let dataDir: string;
  beforeEach(() => { dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reset-audit-')); fs.mkdirSync(path.join(dataDir, 'config')); });
  afterEach(() => { fs.rmSync(dataDir, { recursive: true, force: true }); });

  async function manager(engine: WikiEngine): Promise<ConfigurationManager> {
    const saved = process.env.FAST_STORAGE; process.env.FAST_STORAGE = dataDir;
    try {
      fs.writeFileSync(path.join(dataDir, 'config', 'app-custom-config.json'), JSON.stringify({ 'ngdpbase.server.port': 4444, 'ngdpbase.session.secret': 'hidden' }));
      const cm = new ConfigurationManager(engine); await cm.initialize(); return cm;
    } finally { if (saved === undefined) delete process.env.FAST_STORAGE; else process.env.FAST_STORAGE = saved; }
  }

  test('recorded before the reset, naming the keys discarded and never a value', async () => {
    const sink: Recorded[] = [];
    const cm = await manager(sinkEngine(sink));
    await cm.resetToDefaults(ADMIN);
    expect(sink.map((e) => e.eventType)).toEqual(['config-reset']);
    expect(sink[0]).toMatchObject({ user: 'root', metadata: { discardedKeys: ['ngdpbase.server.port', 'ngdpbase.session.secret'] } });
    expect(JSON.stringify(sink[0])).not.toContain('hidden');
    expect(cm.getCustomProperties()).toEqual({});
  });

  test('a reset whose record cannot be written is refused and the custom values survive', async () => {
    const cm = await manager(sinkEngine([], { auditFails: true }));
    await expect(cm.resetToDefaults(ADMIN)).rejects.toThrow(/audit disk full/);
    expect(cm.getCustomProperties()).toMatchObject({ 'ngdpbase.server.port': 4444 });
  });
});

describe('#1215 backup-create', () => {
  test('a backup records who asked and where it went', async () => {
    const sink: Recorded[] = [];
    const engine = sinkEngine(sink, { extra: { ConfigurationManager: { getProperty: (_k: string, d: unknown) => d, getResolvedDataPath: () => os.tmpdir() } } });
    const bm = new BackupManager(engine);
    (bm as unknown as { provider: unknown }).provider = { writeBackup: async (name: string) => `/backups/${name}`, listBackups: async () => [], deleteBackup: async () => undefined };
    (bm as unknown as { cleanupOldBackups: () => Promise<void> }).cleanupOldBackups = async () => undefined;
    (bm as unknown as { initialized: boolean; backupDirectory: string }).initialized = true;
    (bm as unknown as { backupDirectory: string }).backupDirectory = os.tmpdir();

    const where = await bm.createBackup({ filename: 'x.json.gz' }, ADMIN);

    expect(where).toBe('/backups/x.json.gz');
    expect(sink[0]).toMatchObject({ eventType: 'backup-create', user: 'root', resource: '/backups/x.json.gz', metadata: { filename: 'x.json.gz' } });
  });
});

describe('#1215 audit-export', () => {
  test('the trail records its own export: who, format, filter — never the content', async () => {
    const sink: Recorded[] = [];
    const engine = {
      getManager: vi.fn((name: string) => {
        if (name === 'ConfigurationManager') return { getProperty: (_k: string, d: unknown) => d, getResolvedDataPath: () => os.tmpdir() };
        if (name === 'UserManager') return { userHoldsPermission: async () => true };
        return null;
      }),
      blockConfiguration: vi.fn(), getBlockingConditions: () => []
    } as unknown as WikiEngine;
    const am = new AuditManager(engine);
    (am as unknown as { provider: unknown }).provider = {
      logAuditEvent: async (e: Recorded) => { sink.push(e); return 'id'; },
      flushAuditQueue: async () => undefined,
      exportAuditLogs: async () => 'SECRET-CONTENT'
    };
    (am as unknown as { flushAuditQueue: () => Promise<void> }).flushAuditQueue = async () => undefined;

    const out = await am.exportAuditLogs({ user: 'alice' }, 'csv', { username: 'root' });

    expect(out).toBe('SECRET-CONTENT');
    const rec = sink.find((e) => e.eventType === 'audit-export');
    expect(rec).toMatchObject({ user: 'root', metadata: { format: 'csv', filters: { user: 'alice' } } });
    expect(JSON.stringify(rec)).not.toContain('SECRET-CONTENT');
  });
});
