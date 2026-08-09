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
});
