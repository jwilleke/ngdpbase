/**
 * #1938 — BackupManager.revealInstanceEnv hands back the instance `.env`
 * exactly as it is on disk and records who took it as `secret-reveal`: the
 * file, never its contents.
 *
 * Real BackupManager, a real `.env` in a temp directory; each test removes
 * only that directory.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import BackupManager from '../BackupManager';

const CTX = { username: 'admin', roles: ['admin'], isAuthenticated: true };
// Not a real secret: the shape of a generated .env, a comment and no final newline kept.
const ENV_FILE = '# made by the site\nNGDPBASE_SESSION_SECRET=session-not-a-secret\nNGDPBASE_BACKUP_KEY=backup-not-a-key\nSMTP_PASSWORD="quoted value"';

describe('the instance .env download (#1938)', () => {
  let dir: string;
  let audits: Array<Record<string, unknown>>;

  const manager = (): BackupManager => {
    const managers: Record<string, unknown> = {
      ConfigurationManager: { getInstanceDataFolder: () => dir, getProperty: (_k: string, d: unknown) => d },
      AuditManager: { logAuditEvent: async (e: Record<string, unknown>) => { audits.push(e); return 'evt'; }, flushAuditQueue: async () => undefined }
    };
    return new BackupManager({ getManager: (n: string) => managers[n] ?? null });
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1938-'));
    audits = [];
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('returns the file byte for byte, backup key line included, and records who took it', async () => {
    fs.writeFileSync(path.join(dir, '.env'), ENV_FILE, { mode: 0o600 });
    const content = await manager().revealInstanceEnv(CTX);
    expect(content?.toString('utf8')).toBe(ENV_FILE);
    // Sabotage (2026-10-21): removing the recordAuditEvent call turns this red.
    expect(audits).toEqual([expect.objectContaining({ eventType: 'secret-reveal', user: 'admin', resource: '.env', resourceType: 'instance-env', result: 'success' })]);
  });

  test('the record names the file, never its contents', async () => {
    fs.writeFileSync(path.join(dir, '.env'), ENV_FILE, { mode: 0o600 });
    await manager().revealInstanceEnv(CTX);
    const recorded = JSON.stringify(audits);
    for (const value of ['session-not-a-secret', 'backup-not-a-key', 'quoted value']) expect(recorded).not.toContain(value);
  });

  test('no .env: null, and nothing recorded', async () => {
    expect(await manager().revealInstanceEnv(CTX)).toBeNull();
    expect(audits).toEqual([]);
  });
});
