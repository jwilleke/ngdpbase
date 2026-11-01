/**
 * `./server.sh update` (#2208).
 *
 * Runs the real server.sh against a throwaway git checkout whose `origin` is a
 * bare repo in os.tmpdir(). npm, npx (pm2), curl, lsof, pgrep and pkill are
 * stubs on PATH, so nothing here starts a server, touches a running pm2
 * daemon, or reads ./data. The stub build fails when the checked-out commit
 * has a BREAK_BUILD file, and the stub readiness check answers 503 when it has
 * BREAK_READY; that is how a test makes an update fail.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

let tmp: string;
let origin: string;
let seed: string;
let instance: string;
let stubBin: string;
let npmLog: string;

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@example.invalid'
    }
  });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function stub(name: string, body: string): void {
  const file = path.join(stubBin, name);
  fs.writeFileSync(file, `#!/bin/bash\n${body}\n`);
  fs.chmodSync(file, 0o755);
}

/** Commit a new version to origin, optionally with a marker file that breaks it. */
function publish(version: string, marker?: 'BREAK_BUILD' | 'BREAK_READY'): string {
  fs.writeFileSync(path.join(seed, 'package.json'), JSON.stringify({ name: 'fixture', version }));
  for (const m of ['BREAK_BUILD', 'BREAK_READY']) fs.rmSync(path.join(seed, m), { force: true });
  if (marker) fs.writeFileSync(path.join(seed, marker), '');
  git(seed, 'add', '-A');
  git(seed, 'commit', '-q', '-m', `v${version}`);
  git(seed, 'tag', `v${version}`);
  git(seed, 'push', '-q', '--tags', 'origin', 'master');
  return git(seed, 'rev-parse', 'HEAD');
}

function update(...args: string[]): { status: number | null; out: string } {
  const r = spawnSync('bash', [path.join(instance, 'server.sh'), 'update', ...args], {
    cwd: instance,
    encoding: 'utf8',
    env: {
      PATH: `${stubBin}:${process.env.PATH}`,
      HOME: process.env.HOME,
      PORT: '39999',
      UPDATE_READY_TIMEOUT: '2',
      STUB_INSTANCE: instance,
      STUB_PID: String(process.pid),
      NPM_LOG: npmLog
    }
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

function npmCalls(): string[] {
  return fs.existsSync(npmLog) ? fs.readFileSync(npmLog, 'utf8').trim().split('\n').filter(Boolean) : [];
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdp-update-'));
  origin = path.join(tmp, 'origin.git');
  seed = path.join(tmp, 'seed');
  instance = path.join(tmp, 'instance');
  stubBin = path.join(tmp, 'bin');
  npmLog = path.join(tmp, 'npm.log');
  fs.mkdirSync(stubBin);

  git(tmp, 'init', '-q', '--bare', '-b', 'master', origin);
  git(tmp, 'clone', '-q', origin, seed);
  git(seed, 'symbolic-ref', 'HEAD', 'refs/heads/master');
  fs.copyFileSync(path.join(REPO_ROOT, 'server.sh'), path.join(seed, 'server.sh'));
  fs.chmodSync(path.join(seed, 'server.sh'), 0o755);
  fs.writeFileSync(path.join(seed, '.gitignore'), 'dist/\nnode_modules/\n.ngdpbase*.pid\n');
  publish('1.0.0');
  git(tmp, 'clone', '-q', origin, instance);

  // The build writes dist/ and records whether this commit should be ready.
  stub('npm', [
    'echo "$*" >> "$NPM_LOG"',
    'if [ "$1 $2" = "run build" ]; then',
    '  [ -f BREAK_BUILD ] && { echo "stub build failed"; exit 1; }',
    '  mkdir -p dist/src && echo "" > dist/src/app.js',
    '  if [ -f BREAK_READY ]; then touch dist/not-ready; else rm -f dist/not-ready; fi',
    'fi',
    'exit 0'
  ].join('\n'));
  // pm2 reports the app online, at a PID that exists (this test process).
  stub('npx', [
    'case "$3" in',
    '  show) echo "status online" ;;',
    '  pid) echo "$STUB_PID" ;;',
    'esac',
    'exit 0'
  ].join('\n'));
  stub('curl', '[ -f "$STUB_INSTANCE/dist/not-ready" ] && echo -n 503 || echo -n 200');
  stub('lsof', 'exit 1');
  stub('pgrep', 'exit 1');
  stub('pkill', 'exit 0');
});

afterEach(() => {
  // Only ever the per-test temp dir — never a repo path.
  if (tmp && tmp.startsWith(os.tmpdir())) fs.rmSync(tmp, { recursive: true, force: true });
});

describe('./server.sh update (#2208)', () => {
  it('fast-forwards to the tip of master, installs, builds and reports old → new', () => {
    const oldSha = git(instance, 'rev-parse', 'HEAD');
    const newSha = publish('1.1.0');

    const r = update();

    expect(r.status, r.out).toBe(0);
    expect(git(instance, 'rev-parse', 'HEAD')).toBe(newSha);
    expect(git(instance, 'symbolic-ref', '--short', 'HEAD')).toBe('master');
    expect(npmCalls()).toEqual(['install', 'run build']);
    expect(r.out).toContain(`1.0.0 (${oldSha.slice(0, 7)}) → 1.1.0 (${newSha.slice(0, 7)})`);
  }, 60000);

  it('checks out a named tag', () => {
    const v11 = publish('1.1.0');
    publish('1.2.0');

    const r = update('v1.1.0');

    expect(r.status, r.out).toBe(0);
    expect(git(instance, 'rev-parse', 'HEAD')).toBe(v11);
  }, 60000);

  it('refuses a dirty tree and names the changes, before touching anything', () => {
    const oldSha = git(instance, 'rev-parse', 'HEAD');
    publish('1.1.0');
    fs.writeFileSync(path.join(instance, 'local-notes.txt'), 'work in progress');

    const r = update();

    expect(r.status).not.toBe(0);
    expect(r.out).toContain('uncommitted changes');
    expect(r.out).toContain('local-notes.txt');
    expect(git(instance, 'rev-parse', 'HEAD')).toBe(oldSha);
    expect(npmCalls()).toEqual([]);
  }, 60000);

  it('refuses a non-fast-forward pull and never forces', () => {
    publish('1.1.0');
    fs.writeFileSync(path.join(instance, 'local.txt'), 'local commit');
    git(instance, 'add', 'local.txt');
    git(instance, 'commit', '-q', '-m', 'local');
    const localSha = git(instance, 'rev-parse', 'HEAD');

    const r = update();

    expect(r.status).not.toBe(0);
    expect(r.out).toContain('cannot be fast-forwarded');
    expect(git(instance, 'rev-parse', 'HEAD')).toBe(localSha);
    expect(npmCalls()).toEqual([]);
  }, 60000);

  it('rolls back to the old commit when the build fails, and starts it again', () => {
    const oldSha = git(instance, 'rev-parse', 'HEAD');
    publish('1.1.0', 'BREAK_BUILD');

    const r = update();

    expect(r.status).not.toBe(0);
    expect(r.out).toContain('failed at: npm run build');
    expect(r.out).toContain('Rolled back');
    expect(git(instance, 'rev-parse', 'HEAD')).toBe(oldSha);
    expect(git(instance, 'symbolic-ref', '--short', 'HEAD')).toBe('master');
    expect(git(instance, 'status', '--porcelain')).toBe('');
    expect(npmCalls()).toEqual(['install', 'run build', 'install', 'run build']);
    expect(r.out).toContain('Server started');
  }, 60000);

  it('rolls back when the readiness check never answers 200', () => {
    const oldSha = git(instance, 'rev-parse', 'HEAD');
    publish('1.1.0', 'BREAK_READY');

    const r = update();

    expect(r.status).not.toBe(0);
    expect(r.out).toContain('failed at: readiness check');
    expect(r.out).toContain('Rolled back');
    expect(git(instance, 'rev-parse', 'HEAD')).toBe(oldSha);
    expect(fs.existsSync(path.join(instance, 'dist', 'not-ready'))).toBe(false);
  }, 60000);
});
