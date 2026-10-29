/**
 * .env loading on every launch path.
 *
 * Containers run `node dist/src/app.js` directly and `server.sh` is not in the
 * image, so a `.env` on the data volume used to be silently inert — and an
 * env-ref config value like "$NGDPBASE_ADMIN_PASSWORD" could then only be
 * satisfied by a Secret plus an `env:` block in the deployment manifest.
 *
 * These pin the precedence rules, which fail silently when wrong: the value is
 * simply not what the operator expected, with nothing in the logs.
 */

import path from 'path';
import fs from 'fs';
import os from 'os';

const KEY = 'NGDPBASE_BOOTSTRAP_ENV_SPEC';

let tmpRoot: string;

/** Re-import the module fresh; it applies its effects at import time. */
async function loadBootstrap(): Promise<void> {
  vi.resetModules();
  await import('../bootstrap-env');
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdp-env-'));
  fs.mkdirSync(path.join(tmpRoot, 'data'));

  // Stub process.cwd() rather than calling process.chdir(). chdir mutates the
  // working directory of the whole worker process, so any test sharing that
  // worker resolves relative paths somewhere else for as long as this file
  // runs — an intermittent, full-suite-only failure with no obvious cause.
  // Stubbing only affects code that calls process.cwd(), which is what
  // bootstrap-env does; fs still resolves relative paths normally.
  vi.spyOn(process, 'cwd').mockReturnValue(tmpRoot);

  delete process.env[KEY];
  delete process.env.FAST_STORAGE;
});

afterEach(() => {
  vi.restoreAllMocks();
  // Only ever the temp dir this test made — never a data directory.
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  delete process.env[KEY];
  delete process.env.FAST_STORAGE;
});

describe('bootstrap-env', () => {
  test('loads the repo-root .env with no shell involvement', async () => {
    fs.writeFileSync(path.join(tmpRoot, '.env'), `${KEY}=from-root\n`);

    await loadBootstrap();

    expect(process.env[KEY]).toBe('from-root');
  });

  test('loads <FAST_STORAGE>/.env — the container case', async () => {
    // The whole point: on Kubernetes this file lives on the persistent volume,
    // so no Secret and no manifest change is needed.
    fs.writeFileSync(path.join(tmpRoot, '.env'), `FAST_STORAGE=${path.join(tmpRoot, 'data')}\n`);
    fs.writeFileSync(path.join(tmpRoot, 'data', '.env'), `${KEY}=from-volume\n`);

    await loadBootstrap();

    expect(process.env[KEY]).toBe('from-volume');
  });

  test('the per-instance file beats the repo-root one', async () => {
    fs.writeFileSync(
      path.join(tmpRoot, '.env'),
      `FAST_STORAGE=${path.join(tmpRoot, 'data')}\n${KEY}=from-root\n`
    );
    fs.writeFileSync(path.join(tmpRoot, 'data', '.env'), `${KEY}=from-volume\n`);

    await loadBootstrap();

    expect(process.env[KEY]).toBe('from-volume');
  });

  test('the ambient environment beats both files', async () => {
    // An explicitly-set variable — Kubernetes `env:`, or `PORT=x node …` —
    // must never be silently overridden by a file on disk.
    process.env[KEY] = 'from-ambient';
    fs.writeFileSync(
      path.join(tmpRoot, '.env'),
      `FAST_STORAGE=${path.join(tmpRoot, 'data')}\n${KEY}=from-root\n`
    );
    fs.writeFileSync(path.join(tmpRoot, 'data', '.env'), `${KEY}=from-volume\n`);

    await loadBootstrap();

    expect(process.env[KEY]).toBe('from-ambient');
  });

  test('an ambient FAST_STORAGE locates the per-instance file without a root .env', async () => {
    process.env.FAST_STORAGE = path.join(tmpRoot, 'data');
    fs.writeFileSync(path.join(tmpRoot, 'data', '.env'), `${KEY}=from-volume\n`);

    await loadBootstrap();

    expect(process.env[KEY]).toBe('from-volume');
  });

  test('no .env anywhere is not an error', async () => {
    await expect(loadBootstrap()).resolves.toBeUndefined();
    expect(process.env[KEY]).toBeUndefined();
  });

  describe('the backup key and a restored .env (#1876)', () => {
    const saved = { backup: process.env.NGDPBASE_BACKUP_KEY };
    beforeEach(() => { delete process.env.NGDPBASE_BACKUP_KEY; });
    afterEach(() => {
      if (saved.backup === undefined) delete process.env.NGDPBASE_BACKUP_KEY; else process.env.NGDPBASE_BACKUP_KEY = saved.backup;
    });

    test('a site with no backup key gets one at first start, written to <FAST_STORAGE>/.env, and keeps it', async () => {
      process.env.FAST_STORAGE = path.join(tmpRoot, 'data');
      await loadBootstrap();
      const made = process.env.NGDPBASE_BACKUP_KEY;
      expect(made).toMatch(/^[A-Za-z0-9+/=]{40,}$/);
      const file = fs.readFileSync(path.join(tmpRoot, 'data', '.env'), 'utf8');
      expect(file).toContain(`NGDPBASE_BACKUP_KEY=${made}`);
      expect(file).toMatch(/SAVE A COPY OFF THIS SERVER/);
      delete process.env.NGDPBASE_BACKUP_KEY;
      await loadBootstrap();
      expect(process.env.NGDPBASE_BACKUP_KEY).toBe(made);
    });

    test('the shared-folders key (#2124) is made at first start, written to <FAST_STORAGE>/.env, and stays the same across restarts', async () => {
      const savedShared = process.env.NGDPBASE_SHARED_FOLDERS_KEY;
      delete process.env.NGDPBASE_SHARED_FOLDERS_KEY;
      try {
        process.env.FAST_STORAGE = path.join(tmpRoot, 'data');
        await loadBootstrap();
        const made = process.env.NGDPBASE_SHARED_FOLDERS_KEY;
        expect(made).toMatch(/^[A-Za-z0-9+/=]{40,}$/);
        expect(made).not.toBe(process.env.NGDPBASE_BACKUP_KEY);
        const file = fs.readFileSync(path.join(tmpRoot, 'data', '.env'), 'utf8');
        expect(file.match(/^NGDPBASE_SHARED_FOLDERS_KEY=/gm)).toHaveLength(1);
        expect(file).toContain(`NGDPBASE_SHARED_FOLDERS_KEY=${made}`);
        // Restart: read from the file, never made again.
        delete process.env.NGDPBASE_SHARED_FOLDERS_KEY;
        await loadBootstrap();
        expect(process.env.NGDPBASE_SHARED_FOLDERS_KEY).toBe(made);
        expect(fs.readFileSync(path.join(tmpRoot, 'data', '.env'), 'utf8').match(/^NGDPBASE_SHARED_FOLDERS_KEY=/gm)).toHaveLength(1);
      } finally {
        if (savedShared === undefined) delete process.env.NGDPBASE_SHARED_FOLDERS_KEY; else process.env.NGDPBASE_SHARED_FOLDERS_KEY = savedShared;
      }
    });

    test('a staged .env goes in before it is loaded: its values replace the old file\'s, never an ambient one, and the live backup key stays', async () => {
      const data = path.join(tmpRoot, 'data');
      process.env.FAST_STORAGE = data;
      process.env[KEY] = 'from-ambient';
      fs.writeFileSync(path.join(data, '.env'), `NGDPBASE_BOOTSTRAP_RESTORED=live\n${KEY}=from-file\nNGDPBASE_BACKUP_KEY=live-backup-key\n`);
      fs.writeFileSync(path.join(data, '.env.staged'), `NGDPBASE_BOOTSTRAP_RESTORED=from-backup\n${KEY}=from-backup\n`);
      const { beginSiteRestore, recordStagedPart, commitSiteRestore } = await import('../utils/siteRestore');
      const site = path.join(data, 'site-restore.json');
      beginSiteRestore(site, { stagedAt: '', backup: '', source: 'b1', stagedBy: 'admin' });
      recordStagedPart(site, { manager: 'BackupManager', swaps: [{ live: path.join(data, '.env'), staged: path.join(data, '.env.staged') }] });
      commitSiteRestore(site);
      try {
        await loadBootstrap();
        expect(process.env.NGDPBASE_BOOTSTRAP_RESTORED).toBe('from-backup');
        expect(process.env[KEY]).toBe('from-ambient');
        expect(process.env.NGDPBASE_BACKUP_KEY).toBe('live-backup-key');
        expect(fs.readFileSync(path.join(data, '.env.pre-restore'), 'utf8')).toContain('NGDPBASE_BOOTSTRAP_RESTORED=live');
      } finally {
        delete process.env.NGDPBASE_BOOTSTRAP_RESTORED;
      }
    });
  });
});
