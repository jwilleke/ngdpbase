/**
 * #2134 — BackupManager.revealBackupKeyFile hands back the backup key as a
 * small text file: comments saying what it is, for which site, its
 * fingerprint, and one `NGDPBASE_BACKUP_KEY=` line that the boot's `.env`
 * reader (`dotenv.parse`) reads back as the key. It records who took it as
 * `backup-key-download` (the fingerprint, never the key), before the file is
 * made: a failed record refuses the download.
 *
 * Real BackupManager; keys are made per run, never written as literals.
 */
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import BackupManager from '../BackupManager';
import { BACKUP_KEY_ENV, backupKeyFingerprint } from '../../utils/backupKey';
import { readEnvLine } from '../../utils/instanceEnvSecret';

const CTX = { username: 'admin', roles: ['admin'], isAuthenticated: true };
const CONFIG: Record<string, unknown> = { 'ngdpbase.application-name': 'Fairways', 'ngdpbase.application.base-url': 'https://fairways.example.com' };

describe('the backup key file (#2134)', () => {
  let audits: Array<Record<string, unknown>>;
  let sinkFails: boolean;
  const before = process.env[BACKUP_KEY_ENV];

  const manager = (): BackupManager => {
    const managers: Record<string, unknown> = {
      ConfigurationManager: { getProperty: (k: string, d: unknown) => (k in CONFIG ? CONFIG[k] : d) },
      AuditManager: {
        logAuditEvent: async (e: Record<string, unknown>) => { if (sinkFails) throw new Error('disk full'); audits.push(e); return 'evt'; },
        flushAuditQueue: async () => undefined
      }
    };
    return new BackupManager({ getManager: (n: string) => managers[n] ?? null });
  };

  beforeEach(() => {
    audits = [];
    sinkFails = false;
  });

  afterEach(() => {
    if (before === undefined) delete process.env[BACKUP_KEY_ENV];
    else process.env[BACKUP_KEY_ENV] = before;
  });

  test('the key line reads back as the key with the reader the boot uses for .env, and the fingerprint is the key\'s', async () => {
    const key = `${randomUUID()}/${randomUUID()}=`;
    process.env[BACKUP_KEY_ENV] = key;
    const file = await manager().revealBackupKeyFile(CTX);
    expect(file).not.toBeNull();
    const fingerprint = backupKeyFingerprint(key);
    expect(file?.fingerprint).toBe(fingerprint);
    // Sabotage (2026-10-30): writing the line as `NGDPBASE_BACKUP_KEY: <key>` turns this red.
    expect(dotenv.parse(file?.text ?? '')).toEqual({ [BACKUP_KEY_ENV]: key });
    expect(readEnvLine(file?.text ?? '', BACKUP_KEY_ENV)).toBe(key);
    expect(file?.text).toContain(`# Fingerprint: ${fingerprint}`);
    expect(file?.text).toContain('# Site: Fairways (https://fairways.example.com)');
    expect(file?.text).toMatch(/^# ngdpbase backup key\n/);
    expect(file?.text).toMatch(/\nNGDPBASE_BACKUP_KEY=.+\n$/);
  });

  test('a key set only in the environment (no .env anywhere) is the one the file carries, as the key page shows', async () => {
    // This manager has no instance data folder and no .env: the key comes from where the app resolved it.
    const key = randomUUID();
    process.env[BACKUP_KEY_ENV] = key;
    const m = manager();
    const file = await m.revealBackupKeyFile(CTX);
    expect(dotenv.parse(file?.text ?? '')[BACKUP_KEY_ENV]).toBe(m.revealBackupKey());
    expect(file?.fingerprint).toBe(m.backupKeyInfo().fingerprint);
  });

  test('a key an operator set with # or quotes in it still reads back exactly', async () => {
    for (const key of [`a#${randomUUID()}`, `it's ${randomUUID()}`, `"${randomUUID()}" #x 'y'`]) {
      process.env[BACKUP_KEY_ENV] = key;
      const file = await manager().revealBackupKeyFile(CTX);
      expect(dotenv.parse(file?.text ?? '')[BACKUP_KEY_ENV]).toBe(key);
    }
  });

  test('records who took it and the fingerprint, never the key', async () => {
    const key = randomUUID();
    process.env[BACKUP_KEY_ENV] = key;
    await manager().revealBackupKeyFile(CTX);
    // Sabotage (2026-10-30): removing the recordAuditEvent call turns this red.
    expect(audits).toEqual([expect.objectContaining({
      eventType: 'backup-key-download', user: 'admin', result: 'success', resource: BACKUP_KEY_ENV, resourceType: 'backup-key',
      metadata: expect.objectContaining({ fingerprint: backupKeyFingerprint(key) })
    })]);
    expect(JSON.stringify(audits)).not.toContain(key);
  });

  test('a record that cannot be written refuses the download: no file', async () => {
    process.env[BACKUP_KEY_ENV] = randomUUID();
    sinkFails = true;
    // Sabotage (2026-10-30): catching the record's failure (`.catch(() => 'dropped')`) turns this red.
    await expect(manager().revealBackupKeyFile(CTX)).rejects.toThrow();
  });

  test('no backup key: null, and nothing recorded', async () => {
    delete process.env[BACKUP_KEY_ENV];
    expect(await manager().revealBackupKeyFile(CTX)).toBeNull();
    expect(audits).toEqual([]);
  });
});
