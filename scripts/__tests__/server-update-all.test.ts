/**
 * `./server.sh update all`.
 *
 * The real server.sh runs against throwaway git checkouts. `npx`, `npm`, `curl`,
 * `lsof`, `pgrep` and `pkill` are stubs, so nothing starts a server or talks to
 * a real PM2 daemon. Git is real, inside the temp directory only. HOME and
 * XDG_CONFIG_HOME point at that directory, so the lock file is a fixture, not
 * the machine running the test.
 */

import { randomUUID } from 'crypto';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SECRET = `test-only-${randomUUID()}`;

let tmp: string;
let home: string;
let xdg: string;
let origin: string;
let seed: string;
let driver: string;
let stubBin: string;
let npmLog: string;
let curlLog: string;
let jlistFile: string;

const envWithoutGit = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

function runGit(cwd: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...envWithoutGit,
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@example.invalid'
    }
  });
}

function git(cwd: string, ...args: string[]): string {
  if (args[0] !== 'init' && args[0] !== 'clone') {
    const dir = String(runGit(cwd, ['rev-parse', '--absolute-git-dir']).stdout).trim();
    if (!tmp || !dir.startsWith(fs.realpathSync(tmp))) throw new Error(`refusing git ${args[0]} outside the test dir: ${dir}`);
  }
  const result = runGit(cwd, args);
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${String(result.stderr)}`);
  return String(result.stdout).trim();
}

function layServer(dir: string): void {
  fs.copyFileSync(path.join(REPO_ROOT, 'server.sh'), path.join(dir, 'server.sh'));
  fs.chmodSync(path.join(dir, 'server.sh'), 0o755);
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, 'scripts', 'update-all.sh'), path.join(dir, 'scripts', 'update-all.sh'));
  fs.copyFileSync(path.join(REPO_ROOT, 'scripts', 'update-all-scan.mjs'), path.join(dir, 'scripts', 'update-all-scan.mjs'));
}

function writeInstanceEnv(dir: string): void {
  fs.writeFileSync(path.join(dir, '.env'), [
    'PORT=39999',
    'UPDATE_READY_TIMEOUT=2',
    `NPM_LOG=${npmLog}`,
    `CURL_LOG=${curlLog}`,
    `STUB_PID=${process.pid}`,
    'STUB_SCHEME=http',
    ''
  ].join('\n'));
}

interface Origin {
  bare: string;
  seed: string;
}

function makeOrigin(name: string): Origin {
  const bare = path.join(tmp, `${name}.git`);
  const originSeed = path.join(tmp, `${name}-seed`);
  git(tmp, 'init', '-q', '--bare', '-b', 'master', bare);
  git(tmp, 'clone', '-q', bare, originSeed);
  git(originSeed, 'symbolic-ref', 'HEAD', 'refs/heads/master');
  layServer(originSeed);
  fs.writeFileSync(path.join(originSeed, '.gitignore'), 'dist/\nnode_modules/\n.ngdpbase*.pid\n.env\n');
  fs.writeFileSync(path.join(originSeed, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }));
  git(originSeed, 'add', '-A');
  git(originSeed, 'commit', '-q', '-m', 'v1.0.0');
  git(originSeed, 'tag', 'v1.0.0');
  git(originSeed, 'push', '-q', '--tags', 'origin', 'master');
  return { bare, seed: originSeed };
}

function publish(which: Origin, version: string, marker?: 'BREAK_BUILD' | 'BREAK_READY'): string {
  fs.writeFileSync(path.join(which.seed, 'package.json'), JSON.stringify({ name: 'fixture', version }));
  for (const candidate of ['BREAK_BUILD', 'BREAK_READY']) fs.rmSync(path.join(which.seed, candidate), { force: true });
  if (marker) fs.writeFileSync(path.join(which.seed, marker), '');
  git(which.seed, 'add', '-A');
  git(which.seed, 'commit', '-q', '-m', `v${version}`);
  git(which.seed, 'tag', `v${version}`);
  git(which.seed, 'push', '-q', '--tags', 'origin', 'master');
  return git(which.seed, 'rev-parse', 'HEAD');
}

function cloneFrom(which: Origin, name: string): string {
  const dir = path.join(tmp, 'sites', name);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  git(tmp, 'clone', '-q', which.bare, dir);
  writeInstanceEnv(dir);
  return dir;
}

function quote(value: string): string {
  const embedded = ['\'', '\\', '\''].join('');
  return `'${value.split("'").join(embedded)}'`;
}

interface Proc {
  name: string;
  cwd: string;
  status?: string;
  watch?: boolean;
  script?: string;
}

function writeJlist(procs: Proc[]): void {
  const doc = procs.map((proc, index) => ({
    name: proc.name,
    pm_id: index,
    args: ['--token', SECRET],
    pm2_env: {
      pm_cwd: proc.cwd,
      status: proc.status ?? 'online',
      pm_exec_path: proc.script ?? (proc.cwd ? path.join(proc.cwd, 'dist', 'src', 'app.js') : ''),
      watch: proc.watch ?? false,
      env: {
        SECRET_TOKEN: SECRET,
        AWS_SECRET_ACCESS_KEY: SECRET,
        PATH: '/usr/bin'
      },
      NODE_ENV: 'production'
    }
  }));
  fs.writeFileSync(jlistFile, JSON.stringify(doc));
}

function npmLines(): string[] {
  return fs.existsSync(npmLog) ? fs.readFileSync(npmLog, 'utf8').split('\n').filter(Boolean) : [];
}

function installsFor(dir: string): string[] {
  const real = fs.realpathSync(dir);
  return npmLines().filter((line) => line.startsWith(`${real} `) || line.startsWith(`${dir} `));
}

function run(args: string[], extra: NodeJS.ProcessEnv = {}, entry: string = driver): { status: number | null; out: string } {
  const result = spawnSync('bash', [path.join(entry, 'server.sh'), ...args], {
    cwd: entry,
    encoding: 'utf8',
    env: {
      ...envWithoutGit,
      PATH: `${stubBin}:${process.env.PATH}`,
      HOME: home,
      XDG_CONFIG_HOME: xdg,
      PM2_JLIST_FILE: jlistFile,
      PM2_JLIST_EXIT: '0',
      STUB_PID: String(process.pid),
      NPM_LOG: npmLog,
      CURL_LOG: curlLog,
      UPDATE_READY_TIMEOUT: '2',
      PORT: '39999',
      ...extra
    }
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

function deadPid(): number {
  for (let pid = 1000000; pid < 1000200; pid++) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return pid;
    }
  }
  throw new Error('no unused pid');
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdp-update-all-'));
  home = path.join(tmp, 'home');
  xdg = path.join(home, '.config');
  stubBin = path.join(tmp, 'bin');
  npmLog = path.join(tmp, 'npm.log');
  curlLog = path.join(tmp, 'curl.log');
  jlistFile = path.join(tmp, 'pm2-jlist.json');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(xdg, { recursive: true });
  fs.mkdirSync(stubBin, { recursive: true });
  fs.writeFileSync(jlistFile, '[]');

  const made = makeOrigin('origin');
  origin = made.bare;
  seed = made.seed;
  driver = path.join(tmp, 'driver');
  git(tmp, 'clone', '-q', origin, driver);
  writeInstanceEnv(driver);

  fs.writeFileSync(path.join(stubBin, 'npm'), [
    '#!/bin/bash',
    'echo "$(pwd) $*" >> "$NPM_LOG"',
    'if [ "$1 $2" = "run build" ]; then',
    '  [ -f BREAK_BUILD ] && { echo "stub build failed"; exit 1; }',
    '  mkdir -p dist/src && echo "" > dist/src/app.js',
    '  if [ -f BREAK_READY ]; then touch dist/not-ready; else rm -f dist/not-ready; fi',
    'fi',
    'exit 0'
  ].join('\n'));
  fs.writeFileSync(path.join(stubBin, 'npx'), [
    '#!/bin/bash',
    'cmd=""',
    'prev=""',
    'for arg in "$@"; do',
    '  if [ "$prev" = "pm2" ]; then cmd="$arg"; break; fi',
    '  prev="$arg"',
    'done',
    'if [ "$cmd" = "jlist" ]; then',
    '  [ "${PM2_JLIST_EXIT:-0}" = "0" ] || exit "$PM2_JLIST_EXIT"',
    '  cat "$PM2_JLIST_FILE"',
    '  exit 0',
    'fi',
    'case "$cmd" in',
    '  show) printf "%s\\n" "status online" ;;',
    '  pid) printf "%s\\n" "$STUB_PID" ;;',
    'esac',
    'exit 0'
  ].join('\n'));
  fs.writeFileSync(path.join(stubBin, 'curl'), [
    '#!/bin/bash',
    'echo "$*" >> "$CURL_LOG"',
    'url="${@: -1}"',
    'case "$STUB_SCHEME:$url" in',
    '  https:http://*) echo -n 301; exit 0 ;;',
    '  http:https://*) echo -n 000; exit 35 ;;',
    'esac',
    '[ -f dist/not-ready ] && echo -n 503 || echo -n 200'
  ].join('\n'));
  for (const name of ['npm', 'npx', 'curl', 'lsof', 'pgrep', 'pkill']) {
    if (!fs.existsSync(path.join(stubBin, name))) {
      fs.writeFileSync(path.join(stubBin, name), name === 'pkill' ? '#!/bin/bash\nexit 0\n' : '#!/bin/bash\nexit 1\n');
    }
    fs.chmodSync(path.join(stubBin, name), 0o755);
  }
});

afterEach(() => {
  if (tmp && tmp.startsWith(os.tmpdir())) fs.rmSync(tmp, { recursive: true, force: true });
});

describe('./server.sh update all', () => {
  const primary = (): Origin => ({ bare: origin, seed });

  it('still checks out a named tag with ordinary update', () => {
    const tagged = publish(primary(), '1.1.0');
    publish(primary(), '1.2.0');

    const result = run(['update', 'v1.1.0']);

    expect(result.status, result.out).toBe(0);
    expect(git(driver, 'rev-parse', 'HEAD')).toBe(tagged);
    expect(result.out).not.toContain('Summary');
    expect(result.out).not.toContain('pathspec');
  }, 60000);

  it('updates a clean checkout and does not pass all to git', () => {
    const site = cloneFrom(primary(), 'addons');
    const before = git(site, 'rev-parse', 'HEAD');
    const next = publish(primary(), '1.1.0');
    writeJlist([
      { name: 'pm2-logrotate', cwd: path.join(tmp, 'not-a-checkout') },
      { name: 'ngdpbase-addons', cwd: site }
    ]);
    // The dispatcher exports its own .env. The child must load its checkout, not these.
    fs.writeFileSync(path.join(driver, '.env'), `PORT=39991\nFAST_STORAGE=${path.join(tmp, 'should-not-leak')}\n`);

    const result = run(['update', 'all']);

    expect(result.status, result.out).toBe(0);
    expect(git(site, 'rev-parse', 'HEAD')).toBe(next);
    expect(git(site, 'symbolic-ref', '--short', 'HEAD')).toBe('master');
    expect(git(site, 'rev-parse', 'HEAD')).not.toBe(before);
    expect(installsFor(site).filter((line) => line.endsWith(' install')).length).toBe(1);
    expect(result.out).toContain('running: ./server.sh update');
    expect(result.out).not.toContain('running: ./server.sh update all');
    expect(result.out).not.toContain("pathspec 'all'");
    expect(result.out).not.toContain('Cannot check out all');
    expect(result.out).toContain('pm2-logrotate');
    expect(result.out).toContain('Ignored');
    expect(result.out).not.toContain(SECRET);
    expect(result.out).toContain('http://localhost:39999');
    expect(result.out).not.toContain('39991');
    expect(result.out).not.toContain('should-not-leak');
  }, 60000);

  it('dry-run prints the plan and does not fetch, install, or move HEAD', () => {
    const site = cloneFrom(primary(), 'addons');
    const head = git(site, 'rev-parse', 'HEAD');
    const originMaster = git(site, 'rev-parse', 'origin/master');
    publish(primary(), '1.1.0');
    writeJlist([{ name: 'ngdpbase-addons', cwd: site }]);

    const result = run(['update', 'all', '--dry-run']);

    expect(result.status, result.out).toBe(0);
    expect(git(site, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(site, 'rev-parse', 'origin/master')).toBe(originMaster);
    expect(npmLines()).toEqual([]);
    expect(result.out).toContain('dry-run: would run: ./server.sh update');
    expect(result.out).toContain('Dry run: no checkout was updated.');
    expect(result.out).not.toContain(SECRET);
  }, 60000);

  it('updates two clean master checkouts with no config file anywhere', () => {
    const first = cloneFrom(primary(), 'first');
    const second = cloneFrom(primary(), 'second');
    publish(primary(), '1.1.0');
    writeJlist([
      { name: 'first-app', cwd: first },
      { name: 'second-app', cwd: second }
    ]);
    expect(fs.readdirSync(xdg)).toEqual([]);

    const dry = run(['update', 'all', '--dry-run']);

    expect(dry.status, dry.out).toBe(0);
    expect(dry.out.match(/dry-run: would run: \.\/server\.sh update$/gm)).toHaveLength(2);
    expect(dry.out).toContain('[1/2] first-app');
    expect(dry.out).toContain('[2/2] second-app');
    expect(dry.out).not.toContain('skip:');
    expect(dry.out).toContain('would update  2');
    expect(npmLines()).toEqual([]);
  }, 60000);

  it('checks out a release tag passed after all', () => {
    const site = cloneFrom(primary(), 'addons');
    const tagged = publish(primary(), '1.1.0');
    publish(primary(), '1.2.0');
    writeJlist([{ name: 'ngdpbase-addons', cwd: site }]);

    const result = run(['update', 'all', 'v1.1.0']);

    expect(result.status, result.out).toBe(0);
    expect(git(site, 'rev-parse', 'HEAD')).toBe(tagged);
    expect(result.out).toContain('running: ./server.sh update v1.1.0');
  }, 60000);

  it('updates a path with spaces once when PM2 lists it twice, including via a symlink', () => {
    const site = cloneFrom(primary(), 'My Site');
    const link = path.join(tmp, 'sites', 'site-link');
    fs.symlinkSync(site, link);
    const next = publish(primary(), '1.1.0');
    writeJlist([
      { name: 'The Fairways', cwd: site, watch: true },
      { name: 'fairways-again', cwd: link }
    ]);

    const result = run(['update', 'all']);

    expect(result.status, result.out).toBe(0);
    expect(git(site, 'rev-parse', 'HEAD')).toBe(next);
    expect(installsFor(site).filter((line) => line.endsWith(' install'))).toEqual([
      `${fs.realpathSync(site)} install`
    ]);
    expect(result.out).toContain('The Fairways');
    expect(result.out).toContain('My Site');
    expect(result.out).toContain('not release updating');
  }, 60000);

  it('skips dirty, detached, diverged, ahead, and locked checkouts with a reason and still updates the clean one', () => {
    const clean = cloneFrom(primary(), 'clean');
    const dirty = cloneFrom(primary(), 'dirty');
    const staged = cloneFrom(primary(), 'staged');
    const detached = cloneFrom(primary(), 'detached');
    const diverged = cloneFrom(primary(), 'diverged');
    const ahead = cloneFrom(primary(), 'ahead');
    const feature = cloneFrom(primary(), 'feature');
    const locked = cloneFrom(primary(), 'locked');
    fs.writeFileSync(path.join(dirty, 'notes.txt'), 'wip');
    fs.writeFileSync(path.join(staged, 'staged.txt'), 'staged');
    git(staged, 'add', 'staged.txt');
    git(detached, 'checkout', '-q', '--detach');
    const detachedHead = git(detached, 'rev-parse', 'HEAD');
    fs.writeFileSync(path.join(diverged, 'local.txt'), 'keep');
    git(diverged, 'add', 'local.txt');
    git(diverged, 'commit', '-q', '-m', 'local');
    const divergedHead = git(diverged, 'rev-parse', 'HEAD');
    git(feature, 'checkout', '-q', '-b', 'feature');
    fs.writeFileSync(path.join(feature, 'feature.txt'), 'branch work');
    git(feature, 'add', 'feature.txt');
    git(feature, 'commit', '-q', '-m', 'feature');
    const featureHead = git(feature, 'rev-parse', 'HEAD');
    const gitDir = git(locked, 'rev-parse', '--absolute-git-dir');
    fs.writeFileSync(path.join(gitDir, 'index.lock'), '');
    const lockedHead = git(locked, 'rev-parse', 'HEAD');
    const next = publish(primary(), '1.1.0');
    git(diverged, 'fetch', '-q', 'origin');
    // Ahead only: level with the new origin/master, plus a local commit.
    git(ahead, 'fetch', '-q', 'origin');
    git(ahead, 'reset', '-q', '--hard', 'origin/master');
    fs.writeFileSync(path.join(ahead, 'ahead.txt'), 'local only');
    git(ahead, 'add', 'ahead.txt');
    git(ahead, 'commit', '-q', '-m', 'ahead');
    const aheadHead = git(ahead, 'rev-parse', 'HEAD');
    writeJlist([
      { name: 'clean', cwd: clean },
      { name: 'dirty', cwd: dirty },
      { name: 'staged', cwd: staged },
      { name: 'detached', cwd: detached },
      { name: 'diverged', cwd: diverged },
      { name: 'ahead', cwd: ahead },
      { name: 'feature', cwd: feature },
      { name: 'locked', cwd: locked }
    ]);

    const result = run(['update', 'all']);

    expect(result.status, result.out).toBe(1);
    expect(git(clean, 'rev-parse', 'HEAD')).toBe(next);
    expect(git(dirty, 'rev-parse', 'HEAD')).not.toBe(next);
    expect(fs.readFileSync(path.join(dirty, 'notes.txt'), 'utf8')).toBe('wip');
    expect(git(staged, 'diff', '--cached', '--name-only')).toBe('staged.txt');
    expect(git(detached, 'rev-parse', 'HEAD')).toBe(detachedHead);
    expect(git(detached, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('HEAD');
    expect(git(diverged, 'rev-parse', 'HEAD')).toBe(divergedHead);
    expect(fs.existsSync(path.join(diverged, 'local.txt'))).toBe(true);
    expect(git(ahead, 'rev-parse', 'HEAD')).toBe(aheadHead);
    expect(git(feature, 'rev-parse', 'HEAD')).toBe(featureHead);
    expect(git(feature, 'symbolic-ref', '--short', 'HEAD')).toBe('feature');
    expect(git(locked, 'rev-parse', 'HEAD')).toBe(lockedHead);
    expect(fs.existsSync(path.join(gitDir, 'index.lock'))).toBe(true);
    expect(installsFor(dirty)).toEqual([]);
    expect(installsFor(diverged)).toEqual([]);
    expect(result.out).toContain('skip: 1 uncommitted or untracked file(s), first: notes.txt');
    expect(result.out).toContain('skip: 1 uncommitted or untracked file(s), first: staged.txt');
    expect(result.out).toContain('skip: detached HEAD, not on a branch');
    expect(result.out.match(/skip: 1 commit\(s\) ahead of origin\/master/g)).toHaveLength(2);
    expect(result.out).toContain('skip: on branch feature, not master');
    expect(result.out).toContain('skip: git index is locked');
    expect(result.out).toContain('held by git   7');
    expect(result.out).toContain('updated       1');
    expect(result.out).not.toContain('reset --hard');
  }, 60000);

  it('skips a checkout on another branch, even with no commits of its own or a ref given', () => {
    const feature = cloneFrom(primary(), 'feature');
    const detached = cloneFrom(primary(), 'detached');
    const clean = cloneFrom(primary(), 'clean');
    git(feature, 'checkout', '-q', '-b', 'feature');
    const featureHead = git(feature, 'rev-parse', 'HEAD');
    git(detached, 'checkout', '-q', '--detach');
    const detachedHead = git(detached, 'rev-parse', 'HEAD');
    const tagged = publish(primary(), '1.1.0');
    publish(primary(), '1.2.0');
    writeJlist([
      { name: 'feature', cwd: feature },
      { name: 'detached', cwd: detached },
      { name: 'clean', cwd: clean }
    ]);

    const result = run(['update', 'all', 'v1.1.0']);

    expect(result.status, result.out).toBe(1);
    expect(result.out).toContain('skip: on branch feature, not master');
    expect(result.out).toContain('skip: detached HEAD, not on a branch');
    expect(git(feature, 'rev-parse', 'HEAD')).toBe(featureHead);
    expect(git(feature, 'symbolic-ref', '--short', 'HEAD')).toBe('feature');
    expect(installsFor(feature)).toEqual([]);
    expect(git(detached, 'rev-parse', 'HEAD')).toBe(detachedHead);
    expect(git(clean, 'rev-parse', 'HEAD')).toBe(tagged);
  }, 60000);

  it('continues after one checkout fails to build and rolls only that checkout back', () => {
    const goodOrigin = primary();
    const badOrigin = makeOrigin('bad');
    const good = cloneFrom(goodOrigin, 'good');
    const bad = cloneFrom(badOrigin, 'bad');
    const badHead = git(bad, 'rev-parse', 'HEAD');
    const goodNext = publish(goodOrigin, '1.1.0');
    publish(badOrigin, '1.1.0', 'BREAK_BUILD');
    writeJlist([
      { name: 'good', cwd: good },
      { name: 'bad', cwd: bad }
    ]);

    const result = run(['update', 'all']);

    expect(result.status, result.out).toBe(1);
    expect(git(good, 'rev-parse', 'HEAD')).toBe(goodNext);
    expect(git(bad, 'rev-parse', 'HEAD')).toBe(badHead);
    expect(result.out).toContain('Rolled back');
    expect(result.out).toContain('result: updated');
    expect(result.out).toContain('result: failed');
    expect(git(bad, 'status', '--porcelain')).toBe('');
  }, 60000);

  it('leaves a stopped checkout stopped', () => {
    const site = cloneFrom(primary(), 'stopped');
    const head = git(site, 'rev-parse', 'HEAD');
    publish(primary(), '1.1.0');
    writeJlist([{ name: 'stopped-app', cwd: site, status: 'stopped' }]);

    const result = run(['update', 'all']);

    expect(result.status, result.out).toBe(0);
    expect(git(site, 'rev-parse', 'HEAD')).toBe(head);
    expect(result.out).toContain('not online');
    expect(npmLines()).toEqual([]);
  }, 60000);

  it('does not execute PM2 names or paths', () => {
    const site = cloneFrom(primary(), 'ok');
    const next = publish(primary(), '1.1.0');
    const pwnedName = path.join(tmp, 'pwned-name');
    const pwnedCwd = path.join(tmp, 'pwned-cwd');
    writeJlist([
      { name: `$(touch ${pwnedName})`, cwd: path.join(tmp, `no-such; touch ${pwnedCwd}`) },
      { name: 'ok-app', cwd: site }
    ]);

    const result = run(['update', 'all']);

    expect(result.status, result.out).toBe(0);
    expect(git(site, 'rev-parse', 'HEAD')).toBe(next);
    expect(fs.existsSync(pwnedName)).toBe(false);
    expect(fs.existsSync(pwnedCwd)).toBe(false);
    expect(result.out).not.toContain(SECRET);
  }, 60000);

  it('refuses a recursive update all and a second all used as a ref', () => {
    const site = cloneFrom(primary(), 'addons');
    const head = git(site, 'rev-parse', 'HEAD');
    writeJlist([{ name: 'ngdpbase-addons', cwd: site }]);

    const recursive = run(['update', 'all'], { NGDP_UPDATE_ALL_PARENT: '1' });
    const doubled = run(['update', 'all', 'all']);

    expect(recursive.status, recursive.out).toBe(2);
    expect(recursive.out).toContain('recursive');
    expect(doubled.status, doubled.out).toBe(2);
    expect(git(site, 'rev-parse', 'HEAD')).toBe(head);
    expect(npmLines()).toEqual([]);
  }, 60000);

  it('refuses to run while another update all holds the lock, and reclaims a dead lock', () => {
    const site = cloneFrom(primary(), 'addons');
    const head = git(site, 'rev-parse', 'HEAD');
    writeJlist([{ name: 'ngdpbase-addons', cwd: site }]);
    const lock = path.join(xdg, 'ngdpbase', 'update-all.lock');
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    fs.symlinkSync(String(process.pid), lock);

    const held = run(['update', 'all']);

    expect(held.status, held.out).toBe(2);
    expect(held.out).toContain('already running');
    expect(git(site, 'rev-parse', 'HEAD')).toBe(head);

    fs.rmSync(lock);
    fs.symlinkSync(String(deadPid()), lock);
    const reclaimed = run(['update', 'all']);
    expect(reclaimed.status, reclaimed.out).toBe(0);
    expect(reclaimed.out).toContain('result: updated');
    expect(fs.existsSync(lock)).toBe(false);
    expect(fs.lstatSync(path.join(xdg, 'ngdpbase')).isDirectory()).toBe(true);
  }, 60000);

  it('fails closed when PM2 output is missing or not JSON, without echoing it', () => {
    const site = cloneFrom(primary(), 'addons');
    writeJlist([{ name: 'ngdpbase-addons', cwd: site }]);

    const missing = run(['update', 'all'], { PM2_JLIST_EXIT: '1' });
    fs.writeFileSync(jlistFile, `this is not json ${SECRET}`);
    const garbage = run(['update', 'all']);

    expect(missing.status, missing.out).toBe(2);
    expect(missing.out).toContain('Could not read the PM2 process list');
    expect(garbage.status, garbage.out).toBe(2);
    expect(garbage.out).toContain('not usable');
    expect(garbage.out).not.toContain(SECRET);
    expect(missing.out).not.toContain(SECRET);
  }, 60000);

  it('reads the PM2 list after an out-of-date notice, and updates nothing when the notice has no list', () => {
    const site = cloneFrom(primary(), 'noticed');
    const head = git(site, 'rev-parse', 'HEAD');
    publish(primary(), '1.1.0');
    writeJlist([{ name: 'noticed', cwd: site }]);
    const list = fs.readFileSync(jlistFile, 'utf8');
    const notice = '\n\x1b[31m>>>> In-memory PM2 is out-of-date, do:\x1b[39m\n>>>> $ pm2 update\nIn memory PM2 version: 7.0.1\nLocal PM2 version: 7.1.1\n\n\n';

    fs.writeFileSync(jlistFile, notice);
    const noList = run(['update', 'all']);
    fs.writeFileSync(jlistFile, `${notice}${list}\n`);
    const dry = run(['update', 'all', '--dry-run']);

    expect(noList.status, noList.out).toBe(2);
    expect(noList.out).toContain('not usable');
    expect(noList.out).not.toContain('In-memory PM2');
    expect(git(site, 'rev-parse', 'HEAD')).toBe(head);
    expect(installsFor(site)).toEqual([]);
    expect(dry.status, dry.out).toBe(0);
    expect(dry.out).toContain('would run');
  }, 60000);

  it('ignores an inherited GIT_DIR and GIT_INDEX_FILE, so a checkout on another branch is still skipped', () => {
    const feature = cloneFrom(primary(), 'feature');
    const other = cloneFrom(primary(), 'other');
    git(feature, 'checkout', '-q', '-b', 'feature');
    const featureHead = git(feature, 'rev-parse', 'HEAD');
    publish(primary(), '1.1.0');
    writeJlist([{ name: 'feature', cwd: feature }]);
    const otherGit = path.join(other, '.git');

    const result = run(['update', 'all'], { GIT_DIR: otherGit, GIT_INDEX_FILE: path.join(otherGit, 'index'), GIT_WORK_TREE: other });

    expect(result.status, result.out).toBe(1);
    expect(result.out).toContain('skip: on branch feature, not master');
    expect(git(feature, 'symbolic-ref', '--short', 'HEAD')).toBe('feature');
    expect(git(feature, 'rev-parse', 'HEAD')).toBe(featureHead);
    expect(installsFor(feature)).toEqual([]);
  }, 60000);

  it('skips checkouts with files hidden by assume-unchanged or skip-worktree, and keeps the edits', () => {
    const assumed = cloneFrom(primary(), 'assumed');
    const skipped = cloneFrom(primary(), 'skipped');
    fs.appendFileSync(path.join(assumed, '.gitignore'), '# my local edit\n');
    git(assumed, 'update-index', '--assume-unchanged', '.gitignore');
    fs.appendFileSync(path.join(skipped, '.gitignore'), '# my local edit\n');
    git(skipped, 'update-index', '--skip-worktree', '.gitignore');
    const heads = [git(assumed, 'rev-parse', 'HEAD'), git(skipped, 'rev-parse', 'HEAD')];
    fs.appendFileSync(path.join(seed, '.gitignore'), 'upstream/\n');
    publish(primary(), '1.1.0');
    writeJlist([
      { name: 'assumed', cwd: assumed },
      { name: 'skipped', cwd: skipped }
    ]);

    const result = run(['update', 'all']);

    expect(result.status, result.out).toBe(1);
    expect(result.out.match(/skip: files hidden from git status \(assume-unchanged or skip-worktree\)/g)).toHaveLength(2);
    expect([git(assumed, 'rev-parse', 'HEAD'), git(skipped, 'rev-parse', 'HEAD')]).toEqual(heads);
    expect(fs.readFileSync(path.join(assumed, '.gitignore'), 'utf8')).toContain('# my local edit');
    expect(fs.readFileSync(path.join(skipped, '.gitignore'), 'utf8')).toContain('# my local edit');
    expect(installsFor(assumed)).toEqual([]);
  }, 60000);

  it('plain update refuses a checkout with an assume-unchanged file before changing anything', () => {
    fs.appendFileSync(path.join(driver, '.gitignore'), '# my local edit\n');
    git(driver, 'update-index', '--assume-unchanged', '.gitignore');
    const head = git(driver, 'rev-parse', 'HEAD');
    fs.appendFileSync(path.join(seed, '.gitignore'), 'upstream/\n');
    publish(primary(), '1.1.0');

    const result = run(['update']);

    expect(result.status, result.out).toBe(1);
    expect(result.out).toContain('Refusing to update: files hidden from git status');
    expect(result.out).toContain('.gitignore');
    expect(git(driver, 'rev-parse', 'HEAD')).toBe(head);
    expect(fs.readFileSync(path.join(driver, '.gitignore'), 'utf8')).toContain('# my local edit');
    expect(installsFor(driver)).toEqual([]);
  }, 60000);

  it('skips a checkout when origin/master cannot be resolved, even after a fetch', () => {
    const site = cloneFrom(primary(), 'noref');
    git(site, 'commit', '-q', '--allow-empty', '-m', 'local');
    const head = git(site, 'rev-parse', 'HEAD');
    git(site, 'config', '--unset-all', 'remote.origin.fetch');
    git(site, 'update-ref', '-d', 'refs/remotes/origin/master');
    publish(primary(), '1.1.0');
    writeJlist([{ name: 'noref', cwd: site }]);

    const result = run(['update', 'all']);
    const dry = run(['update', 'all', '--dry-run']);

    expect(result.status, result.out).toBe(1);
    expect(result.out).toContain('skip: cannot compare with origin/master');
    expect(dry.out).toContain('skip: cannot compare with origin/master');
    expect(git(site, 'rev-parse', 'HEAD')).toBe(head);
    expect(installsFor(site)).toEqual([]);
  }, 60000);

  it('prints no control characters from PM2 names', () => {
    const site = cloneFrom(primary(), 'evil');
    writeJlist([
      { name: 'evil\x1b]0;PWNED\x07\x1b[2J\u009b', cwd: site },
      { name: 'other\x1b[31mRED\x7f', cwd: path.join(tmp, 'not-a-checkout') }
    ]);

    const dry = run(['update', 'all', '--dry-run']);

    expect(dry.status, dry.out).toBe(0);
    const controls = [...dry.out].filter((ch) => {
      const code = ch.charCodeAt(0);
      return ch !== '\n' && ch !== '\t' && (code < 0x20 || (code >= 0x7f && code <= 0x9f));
    });
    expect(controls).toEqual([]);
    expect(dry.out).toContain('evil?]0;PWNED??[2J?');
    expect(dry.out).toContain('other?[31mRED?');
  }, 60000);

  it('keeps an empty ref in its slot when env is given', () => {
    const site = cloneFrom(primary(), 'emptyref');
    const next = publish(primary(), '1.1.0');
    writeJlist([{ name: 'emptyref', cwd: site }]);

    const dry = run(['update', 'all', '--dry-run', '', 'development']);
    const real = run(['update', 'all', '', 'development']);

    expect(dry.status, dry.out).toBe(0);
    expect(dry.out).toContain('dry-run: would run: ./server.sh update "" development');
    expect(real.out).not.toContain('Cannot check out development');
    expect(git(site, 'symbolic-ref', '--short', 'HEAD')).toBe('master');
    expect(git(site, 'rev-parse', 'HEAD')).toBe(next);
  }, 60000);

  describe('#2305 hardening', () => {
    it('F2: a nested checkout without its own .git is refused by the gate', () => {
      const outer = cloneFrom(primary(), 'outer');
      const inner = path.join(outer, 'inner');
      fs.mkdirSync(inner);
      layServer(inner);
      writeJlist([{ name: 'inner-app', cwd: inner }]);
      const head = git(outer, 'rev-parse', 'HEAD');
      publish(primary(), '1.1.0');

      const result = run(['update', 'all']);

      expect(result.status, result.out).toBe(1);
      expect(result.out).toContain('skip: not the top of its own git repository');
      expect(git(outer, 'rev-parse', 'HEAD')).toBe(head);
      expect(npmLines()).toEqual([]);
    }, 60000);

    it('F3: a lock without a pid is not taken over, and concurrent lockers never both win', () => {
      const site = cloneFrom(primary(), 'addons');
      writeJlist([{ name: 'ngdpbase-addons', cwd: site }]);
      const lock = path.join(xdg, 'ngdpbase', 'update-all.lock');
      fs.mkdirSync(lock, { recursive: true });

      const result = run(['update', 'all']);

      expect(result.status, result.out).toBe(2);
      expect(result.out).toContain('holds no pid');
      expect(fs.existsSync(lock)).toBe(true);
      expect(npmLines()).toEqual([]);
      fs.rmSync(lock, { recursive: true });

      fs.symlinkSync(String(deadPid()), lock);
      const harness = [
        `source ${quote(path.join(REPO_ROOT, 'scripts', 'update-all.sh'))}`,
        'for i in 1 2 3 4 5 6 7 8; do',
        '  ( ngdp_update_all_lock >/dev/null 2>&1 && { echo WON; sleep 2; } ) &',
        'done',
        'wait'
      ].join('\n');
      const raced = spawnSync('bash', ['-c', harness], {
        encoding: 'utf8',
        env: { ...envWithoutGit, HOME: home, XDG_CONFIG_HOME: xdg, PATH: process.env.PATH }
      });
      expect(String(raced.stdout).split('\n').filter((line) => line === 'WON')).toHaveLength(1);
    }, 60000);

    it('F4: refuses to run as root and holds a checkout the invoking uid does not own', () => {
      const site = cloneFrom(primary(), 'addons');
      const head = git(site, 'rev-parse', 'HEAD');
      publish(primary(), '1.1.0');
      writeJlist([{ name: 'ngdpbase-addons', cwd: site }]);
      const idStub = path.join(stubBin, 'id');
      fs.writeFileSync(idStub, '#!/bin/bash\necho "${STUB_UID:-0}"\n');
      fs.chmodSync(idStub, 0o755);

      const asRoot = run(['update', 'all'], { STUB_UID: '0' });
      expect(asRoot.status, asRoot.out).toBe(2);
      expect(asRoot.out).toContain('Refusing to run as root');

      const asOther = run(['update', 'all'], { STUB_UID: '4242' });
      expect(asOther.status, asOther.out).toBe(1);
      expect(asOther.out).toContain('skip: owned by another user');
      expect(git(site, 'rev-parse', 'HEAD')).toBe(head);
      expect(npmLines()).toEqual([]);
    }, 60000);

    it('F5: leaves no temp files behind, with or without a dry run', () => {
      const site = cloneFrom(primary(), 'addons');
      publish(primary(), '1.1.0');
      writeJlist([{ name: 'ngdpbase-addons', cwd: site }]);
      const scratch = path.join(tmp, 'scratch');
      fs.mkdirSync(scratch);

      const dry = run(['update', 'all', '--dry-run'], { TMPDIR: scratch });
      const real = run(['update', 'all'], { TMPDIR: scratch });

      expect(dry.status, dry.out).toBe(0);
      expect(real.status, real.out).toBe(0);
      expect(fs.readdirSync(scratch)).toEqual([]);
    }, 60000);

    it('F6: does not pass test-only STUB_*, NPM_LOG or CURL_LOG variables to the child', () => {
      const site = cloneFrom(primary(), 'addons');
      publish(primary(), '1.1.0');
      writeJlist([{ name: 'ngdpbase-addons', cwd: site }]);
      const probe = path.join(tmp, 'probe.log');
      fs.writeFileSync(path.join(stubBin, 'npm'), [
        '#!/bin/bash',
        `echo "STUB_INSTANCE=\${STUB_INSTANCE-unset} FROM_PARENT=\${PARENT_ONLY_NPM_LOG-unset}" >> ${quote(probe)}`,
        'if [ "$1 $2" = "run build" ]; then mkdir -p dist/src && echo "" > dist/src/app.js; fi',
        'exit 0'
      ].join('\n'));

      const result = run(['update', 'all'], { STUB_INSTANCE: 'leaked', PARENT_ONLY_NPM_LOG: 'leaked' });

      expect(result.status, result.out).toBe(0);
      const seen = fs.readFileSync(probe, 'utf8');
      expect(seen).toContain('STUB_INSTANCE=unset');
      expect(seen).not.toContain('leaked');
      const source = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'update-all.sh'), 'utf8');
      expect(source).not.toMatch(/NPM_LOG|CURL_LOG|STUB_/);
    }, 60000);

    it('F7: does not resolve a checkout from a PM2 script path when the working directory is not one', () => {
      const site = cloneFrom(primary(), 'addons');
      const head = git(site, 'rev-parse', 'HEAD');
      publish(primary(), '1.1.0');
      writeJlist([{ name: 'rogue', cwd: path.join(tmp, 'elsewhere'), script: path.join(site, 'dist', 'src', 'app.js') }]);

      const result = run(['update', 'all']);

      expect(result.status, result.out).toBe(3);
      expect(result.out).toContain('none is an ngdpbase checkout');
      expect(git(site, 'rev-parse', 'HEAD')).toBe(head);
      expect(npmLines()).toEqual([]);
    }, 60000);

    it('F8: refreshes origin/master before the ahead check, skips when it cannot fetch, and a dry run takes no lock', () => {
      const ahead = cloneFrom(primary(), 'ahead');
      fs.writeFileSync(path.join(ahead, 'ahead.txt'), 'local only');
      git(ahead, 'add', 'ahead.txt');
      git(ahead, 'commit', '-q', '-m', 'ahead');
      const aheadHead = git(ahead, 'rev-parse', 'HEAD');
      git(ahead, 'update-ref', 'refs/remotes/origin/master', 'HEAD');
      const offline = cloneFrom(primary(), 'offline');
      git(offline, 'remote', 'set-url', 'origin', path.join(tmp, 'no-such-origin.git'));
      writeJlist([
        { name: 'ahead-app', cwd: ahead },
        { name: 'offline-app', cwd: offline }
      ]);

      const result = run(['update', 'all']);

      expect(result.status, result.out).toBe(1);
      expect(result.out).toContain('skip: 1 commit(s) ahead of origin/master');
      expect(result.out).toContain('skip: could not fetch origin/master');
      expect(git(ahead, 'rev-parse', 'HEAD')).toBe(aheadHead);
      expect(npmLines()).toEqual([]);

      const lock = path.join(xdg, 'ngdpbase', 'update-all.lock');
      fs.mkdirSync(path.dirname(lock), { recursive: true });
      fs.symlinkSync(String(process.pid), lock);
      const dry = run(['update', 'all', '--dry-run']);
      expect(dry.out).not.toContain('already running');
      expect(dry.out).toContain('Dry run');
      expect(fs.readlinkSync(lock)).toBe(String(process.pid));
    }, 60000);

    it('N3: run through a symlinked checkout path, discovery finds the same checkouts as the real path', () => {
      const site = cloneFrom(primary(), 'addons');
      publish(primary(), '1.1.0');
      writeJlist([{ name: 'ngdpbase-addons', cwd: site }]);
      const link = path.join(tmp, 'driver-link');
      fs.symlinkSync(driver, link);

      const real = run(['update', 'all', '--dry-run']);
      const linked = run(['update', 'all', '--dry-run'], {}, link);

      expect(linked.status, linked.out).toBe(real.status);
      expect(linked.out).toContain('[1/1] ngdpbase-addons');
      expect(linked.out).toContain(fs.realpathSync(site));
      expect(linked.out).not.toContain('No ngdpbase checkouts');
    }, 60000);
  });

});

describe('update-all-scan.mjs process entry', () => {
  const scanner = path.join(REPO_ROOT, 'scripts', 'update-all-scan.mjs');

  it('sanitize-pm2 trims whitespace around PM2 app names', () => {
    const jlist = JSON.stringify([{ name: ' \tprod-site  \t', pm2_env: { pm_cwd: '/x/a-site', status: 'online' } }]);
    const result = spawnSync(process.execPath, [scanner, 'sanitize-pm2'], { input: jlist, encoding: 'utf8', env: envWithoutGit });
    expect(result.status).toBe(0);
    expect(result.stdout.split('\0')[0]).toBe('prod-site');
  });

  const sanitize = (input: string) =>
    spawnSync(process.execPath, [scanner, 'sanitize-pm2'], { input, encoding: 'utf8', env: envWithoutGit });
  const jlistLine = JSON.stringify([
    { name: 'site-a', pm2_env: { pm_cwd: '/x/site-a', status: 'online', SECRET_TOKEN: 'do-not-print' } },
    { name: 'site-b', pm2_env: { pm_cwd: '/x/site-b', status: 'stopped' } }
  ]);
  const names = (stdout: string) => stdout.split('\0').slice(0, -1).filter((_, i) => i % 5 === 0);

  it('sanitize-pm2 reads the list after the coloured out-of-date notice', () => {
    const notice = [
      '',
      '\x1b[31m>>>> In-memory PM2 is out-of-date, do:\x1b[39m',
      '>>>> $ pm2 update',
      'In memory PM2 version: 7.0.1',
      'Local PM2 version: 7.1.1',
      '',
      '',
      jlistLine,
      ''
    ].join('\n');
    const result = sanitize(notice);
    expect(result.status, result.stderr).toBe(0);
    expect(names(result.stdout)).toEqual(['site-a', 'site-b']);
    expect(result.stdout.split('\0').slice(0, 5)).toEqual(['site-a', '/x/site-a', '', 'online', '0']);
    expect(result.stdout).not.toContain('do-not-print');
  });

  it('sanitize-pm2 ignores [PM2] and [PM2][WARN] lines before the list', () => {
    const result = sanitize(['[PM2] Spawning PM2 daemon with pm2_home=/x/.pm2', '[PM2][WARN] Current process list is not synchronized', jlistLine].join('\n'));
    expect(result.status, result.stderr).toBe(0);
    expect(names(result.stdout)).toEqual(['site-a', 'site-b']);
  });

  it('sanitize-pm2 fails closed, printing nothing from the input, when no line is a list', () => {
    const result = sanitize(['\x1b[31m>>>> In-memory PM2 is out-of-date, do:\x1b[39m', '[PM2][WARN] do-not-print', '{"not": "a list"}'].join('\n'));
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('pm2-json-unusable\n');
  });

  it('sanitize-pm2 fails closed when more than one line is a list', () => {
    const result = sanitize([jlistLine, '[]'].join('\n'));
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('pm2-json-unusable\n');
  });

  it('sanitize-pm2 drops a path with a control character and replaces them in names', () => {
    const list = JSON.stringify([
      { name: 'a\x1b[2J\x07b\u009b', pm2_env: { pm_cwd: '/x/\x1b[31mred', status: 'online' } }
    ]);
    const result = sanitize(list);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.split('\0').slice(0, 2)).toEqual(['a?[2J?b?', '']);
  });

  it('exits 1 and names the path when its own path cannot be resolved', () => {
    const code = `process.argv[1] = '/nonexistent/update-all-scan.mjs'; await import(${JSON.stringify(scanner)});`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', env: envWithoutGit });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('cannot resolve /nonexistent/update-all-scan.mjs');
  });
});
