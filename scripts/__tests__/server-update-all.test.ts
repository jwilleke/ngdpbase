/**
 * `./server.sh update all`.
 *
 * The real server.sh runs against throwaway git checkouts. `npx`, `npm`, `curl`,
 * `lsof`, `pgrep` and `pkill` are stubs, so nothing starts a server or talks to
 * a real PM2 daemon. Git is real, inside the temp directory only. HOME and
 * XDG_CONFIG_HOME point at that directory, so LaunchAgents and the policy file
 * are fixtures, not the machine running the test.
 */

import { randomUUID } from 'crypto';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { classifyScript } from '../update-all-scan.mjs';

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
  fs.writeFileSync(path.join(originSeed, '.gitignore'), 'dist/\nnode_modules/\n.ngdpbase*.pid\n.ngdpbase-update-policy\n.env\n');
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

function writePolicy(lines: string[]): void {
  const dir = path.join(xdg, 'ngdpbase');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'update-policy'), `${lines.join('\n')}\n`);
}

function quote(value: string): string {
  const embedded = ['\'', '\\', '\''].join('');
  return `'${value.split("'").join(embedded)}'`;
}

function writeUpdater(sites: string[], pinned: string[], extra = ''): string {
  const bin = path.join(home, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const script = path.join(bin, 'ngdp-autoupdate.sh');
  fs.writeFileSync(script, [
    '#!/bin/bash',
    'SITES=(',
    ...sites.map((site) => `  ${quote(site)}`),
    ')',
    'PINNED=(',
    ...pinned.map((site) => `  ${quote(site)}`),
    ')',
    'TAG=v1.0.0',
    'for site in "${SITES[@]}"; do',
    '  (cd "$site" && ./server.sh update "$TAG")',
    'done',
    extra,
    ''
  ].join('\n'));
  fs.chmodSync(script, 0o755);
  const agents = path.join(home, 'Library', 'LaunchAgents');
  fs.mkdirSync(agents, { recursive: true });
  fs.writeFileSync(path.join(agents, 'com.example.ngdp-autoupdate.plist'), [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<plist version="1.0"><dict>',
    '<key>ProgramArguments</key>',
    '<array>',
    `<string>${script}</string>`,
    '</array>',
    '<key>StartInterval</key><integer>900</integer>',
    '</dict></plist>',
    ''
  ].join('\n'));
  return script;
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
      NGDP_UPDATE_CRONTAB_FILE: '',
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

  it('updates an explicitly manual checkout and does not pass all to git', () => {
    const site = cloneFrom(primary(), 'addons');
    const before = git(site, 'rev-parse', 'HEAD');
    const next = publish(primary(), '1.1.0');
    writePolicy([`manual ${site}`, 'nope not-a-line', 'manual relative/path', 'manual /no/such/ngdpbase-dir']);
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
    expect(result.out).toContain('update-policy:2 ignored');
    expect(result.out).toContain('update-policy:3 ignored');
    expect(result.out).toContain('update-policy:4 ignored');
  }, 60000);

  it('dry-run prints the plan and does not fetch, install, or move HEAD', () => {
    const site = cloneFrom(primary(), 'addons');
    const head = git(site, 'rev-parse', 'HEAD');
    const originMaster = git(site, 'rev-parse', 'origin/master');
    publish(primary(), '1.1.0');
    writePolicy([`manual ${site}`]);
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

  it('checks out a release tag passed after all', () => {
    const site = cloneFrom(primary(), 'addons');
    const tagged = publish(primary(), '1.1.0');
    publish(primary(), '1.2.0');
    writePolicy([`manual ${site}`]);
    writeJlist([{ name: 'ngdpbase-addons', cwd: site }]);

    const result = run(['update', 'all', 'v1.1.0']);

    expect(result.status, result.out).toBe(0);
    expect(git(site, 'rev-parse', 'HEAD')).toBe(tagged);
    expect(result.out).toContain('running: ./server.sh update v1.1.0');
  }, 60000);

  it('skips updater-owned and pinned checkouts and updates one the updater does not list', () => {
    const auto = cloneFrom(primary(), 'fairways');
    const pinned = cloneFrom(primary(), 'accounting');
    const other = cloneFrom(primary(), 'encrypted');
    const autoHead = git(auto, 'rev-parse', 'HEAD');
    const pinnedHead = git(pinned, 'rev-parse', 'HEAD');
    const next = publish(primary(), '1.1.0');
    const script = writeUpdater([auto], [pinned]);
    writeJlist([
      { name: 'The Fairways', cwd: auto, watch: true },
      { name: 'Accounting Dev', cwd: pinned },
      { name: 'ngdp-encrypted', cwd: other }
    ]);

    const result = run(['update', 'all']);

    expect(result.status, result.out).toBe(0);
    expect(git(auto, 'rev-parse', 'HEAD')).toBe(autoHead);
    expect(git(pinned, 'rev-parse', 'HEAD')).toBe(pinnedHead);
    expect(git(other, 'rev-parse', 'HEAD')).toBe(next);
    expect(installsFor(auto)).toEqual([]);
    expect(installsFor(pinned)).toEqual([]);
    expect(installsFor(other).some((line) => line.endsWith(' install'))).toBe(true);
    expect(result.out).toContain('skip (automatic)');
    expect(result.out).toContain('skip (pinned)');
    expect(result.out).toContain(script);
    expect(result.out).toContain('not listed by the automatic updater');
    expect(result.out).toContain('not release updating');
    expect(result.out).toContain('The Fairways');
    expect(result.out).not.toContain(SECRET);
  }, 60000);

  it('pins a checkout by its PM2 name in a comment and updates one the script does not mention', () => {
    const auto = cloneFrom(primary(), 'fairways');
    const named = cloneFrom(primary(), 'accounting');
    const other = cloneFrom(primary(), 'encrypted');
    const autoHead = git(auto, 'rev-parse', 'HEAD');
    const namedHead = git(named, 'rev-parse', 'HEAD');
    const next = publish(primary(), '1.1.0');
    writeUpdater([auto], [], '# Accounting Dev explicitly excluded as pinned\n');
    writeJlist([
      { name: 'The Fairways', cwd: auto },
      { name: 'Accounting Dev', cwd: named },
      { name: 'ngdp-encrypted', cwd: other }
    ]);

    const result = run(['update', 'all']);

    expect(result.status, result.out).toBe(0);
    expect(git(auto, 'rev-parse', 'HEAD')).toBe(autoHead);
    expect(git(named, 'rev-parse', 'HEAD')).toBe(namedHead);
    expect(git(other, 'rev-parse', 'HEAD')).toBe(next);
    expect(result.out).toContain('skip (pinned)');
    expect(result.out).toContain('not listed by the automatic updater');
    expect(installsFor(named)).toEqual([]);
  }, 60000);

  it('still updates an explicit manual checkout when the updater script is incomplete', () => {
    const auto = cloneFrom(primary(), 'fairways');
    const manual = cloneFrom(primary(), 'addons');
    const loose = cloneFrom(primary(), 'encrypted');
    const autoHead = git(auto, 'rev-parse', 'HEAD');
    const looseHead = git(loose, 'rev-parse', 'HEAD');
    const next = publish(primary(), '1.1.0');
    writeUpdater([auto], [], 'OTHER="$UNRESOLVED"\n# pinned somewhere, path not given\n');
    writePolicy([`manual ${manual}`]);
    writeJlist([
      { name: 'The Fairways', cwd: auto },
      { name: 'ngdpbase-addons', cwd: manual },
      { name: 'ngdp-encrypted', cwd: loose }
    ]);

    const result = run(['update', 'all']);

    expect(result.status, result.out).toBe(3);
    expect(git(auto, 'rev-parse', 'HEAD')).toBe(autoHead);
    expect(git(manual, 'rev-parse', 'HEAD')).toBe(next);
    expect(git(loose, 'rev-parse', 'HEAD')).toBe(looseHead);
    expect(result.out).toContain('incomplete');
    expect(result.out).toContain('unknown ownership');
  }, 60000);

  it('does not let one manual policy line authorize every other checkout', () => {
    const named = cloneFrom(primary(), 'addons');
    const other = cloneFrom(primary(), 'encrypted');
    const otherHead = git(other, 'rev-parse', 'HEAD');
    const next = publish(primary(), '1.1.0');
    writePolicy([`manual "${named}"`]);
    writeJlist([
      { name: 'ngdpbase-addons', cwd: named },
      { name: 'ngdp-encrypted', cwd: other }
    ]);

    const result = run(['update', 'all']);

    expect(result.status, result.out).toBe(3);
    expect(git(named, 'rev-parse', 'HEAD')).toBe(next);
    expect(git(other, 'rev-parse', 'HEAD')).toBe(otherHead);
    expect(result.out).toContain(`manual ${fs.realpathSync(other)}`);
  }, 60000);

  it('keeps an updater-owned checkout skipped when the policy file says manual', () => {
    const auto = cloneFrom(primary(), 'fairways');
    const head = git(auto, 'rev-parse', 'HEAD');
    publish(primary(), '1.1.0');
    writeUpdater([auto], []);
    writePolicy([`manual ${auto}`]);
    writeJlist([{ name: 'The Fairways', cwd: auto }]);

    const result = run(['update', 'all']);

    expect(result.status, result.out).toBe(0);
    expect(git(auto, 'rev-parse', 'HEAD')).toBe(head);
    expect(result.out).toContain('also marked manual, still skipped');
    expect(npmLines()).toEqual([]);
  }, 60000);

  it('honors a one-word checkout policy file without treating the tree as dirty', () => {
    const site = cloneFrom(primary(), 'addons');
    fs.writeFileSync(path.join(site, '.ngdpbase-update-policy'), 'manual\n');
    const next = publish(primary(), '1.1.0');
    writeJlist([{ name: 'ngdpbase-addons', cwd: site }]);

    expect(git(site, 'status', '--porcelain')).toBe('');
    const result = run(['update', 'all']);

    expect(result.status, result.out).toBe(0);
    expect(git(site, 'rev-parse', 'HEAD')).toBe(next);
  }, 60000);

  it('updates a path with spaces once when PM2 lists it twice, including via a symlink', () => {
    const site = cloneFrom(primary(), 'My Site');
    const link = path.join(tmp, 'sites', 'site-link');
    fs.symlinkSync(site, link);
    const next = publish(primary(), '1.1.0');
    writePolicy([`manual ${site}`]);
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

  it('holds dirty, detached, diverged, ahead, and locked checkouts and still updates the clean one', () => {
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
    writePolicy([clean, dirty, staged, detached, diverged, ahead, feature, locked].map((dir) => `manual ${dir}`));
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
    expect(result.out).toContain('skip (dirty)');
    expect(result.out).toContain('notes.txt');
    expect(result.out).toContain('skip (detached)');
    expect(result.out).toContain('skip (divergent)');
    expect(result.out).toContain('skip (ahead)');
    expect(result.out).toContain('skip (not-on-master)');
    expect(result.out).toContain('skip (index-locked)');
    expect(result.out).not.toContain('reset --hard');
  }, 60000);

  it('updates a non-master checkout when a ref is given, and still skips a detached one', () => {
    const feature = cloneFrom(primary(), 'feature');
    const detached = cloneFrom(primary(), 'detached');
    git(feature, 'checkout', '-q', '-b', 'feature');
    git(detached, 'checkout', '-q', '--detach');
    const detachedHead = git(detached, 'rev-parse', 'HEAD');
    const tagged = publish(primary(), '1.1.0');
    publish(primary(), '1.2.0');
    writePolicy([`manual ${feature}`, `manual ${detached}`]);
    writeJlist([
      { name: 'feature', cwd: feature },
      { name: 'detached', cwd: detached }
    ]);

    const result = run(['update', 'all', 'v1.1.0']);

    expect(result.status, result.out).toBe(1);
    expect(git(feature, 'rev-parse', 'HEAD')).toBe(tagged);
    expect(git(detached, 'rev-parse', 'HEAD')).toBe(detachedHead);
  }, 60000);

  it('continues after one checkout fails to build and rolls only that checkout back', () => {
    const goodOrigin = primary();
    const badOrigin = makeOrigin('bad');
    const good = cloneFrom(goodOrigin, 'good');
    const bad = cloneFrom(badOrigin, 'bad');
    const badHead = git(bad, 'rev-parse', 'HEAD');
    const goodNext = publish(goodOrigin, '1.1.0');
    publish(badOrigin, '1.1.0', 'BREAK_BUILD');
    writePolicy([`manual ${good}`, `manual ${bad}`]);
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
    writePolicy([`manual ${site}`]);
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
    writePolicy([`manual ${site}`]);
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

  it('exits 3 when every checkout has unknown ownership', () => {
    const site = cloneFrom(primary(), 'addons');
    const head = git(site, 'rev-parse', 'HEAD');
    publish(primary(), '1.1.0');
    writeJlist([{ name: 'ngdpbase-addons', cwd: site }]);

    const result = run(['update', 'all']);

    expect(result.status, result.out).toBe(3);
    expect(git(site, 'rev-parse', 'HEAD')).toBe(head);
    expect(result.out).toContain('unknown ownership');
    expect(result.out).toContain('update-policy');
    expect(result.out).toContain(`manual ${fs.realpathSync(site)}`);
    expect(npmLines()).toEqual([]);
  }, 60000);

  it('refuses a recursive update all and a second all used as a ref', () => {
    const site = cloneFrom(primary(), 'addons');
    const head = git(site, 'rev-parse', 'HEAD');
    writePolicy([`manual ${site}`]);
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
    writePolicy([`manual ${site}`]);
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
    writePolicy([`manual ${site}`]);
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

  it('reads an updater from crontab or a systemd user unit, not only LaunchAgents', () => {
    const auto = cloneFrom(primary(), 'fairways');
    const other = cloneFrom(primary(), 'encrypted');
    const autoHead = git(auto, 'rev-parse', 'HEAD');
    const next = publish(primary(), '1.1.0');
    const script = path.join(home, 'bin', 'ngdp-autoupdate.sh');
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.writeFileSync(script, [
      '#!/bin/bash',
      'SITES=(',
      `  ${quote(auto)}`,
      ')',
      'for site in "${SITES[@]}"; do',
      '  (cd "$site" && ./server.sh update "$TAG")',
      'done',
      ''
    ].join('\n'));
    const cron = path.join(tmp, 'crontab');
    fs.writeFileSync(cron, `*/15 * * * * ${script}\n`);
    writeJlist([
      { name: 'The Fairways', cwd: auto },
      { name: 'ngdp-encrypted', cwd: other }
    ]);

    const fromCron = run(['update', 'all'], { NGDP_UPDATE_CRONTAB_FILE: cron });

    expect(fromCron.status, fromCron.out).toBe(0);
    expect(git(auto, 'rev-parse', 'HEAD')).toBe(autoHead);
    expect(git(other, 'rev-parse', 'HEAD')).toBe(next);

    const unitDir = path.join(xdg, 'systemd', 'user');
    fs.mkdirSync(unitDir, { recursive: true });
    fs.writeFileSync(path.join(unitDir, 'ngdp-autoupdate.service'), `[Service]\nExecStart=${script}\n`);
    const second = cloneFrom(primary(), 'addons');
    const secondHead = git(auto, 'rev-parse', 'HEAD');
    publish(primary(), '1.2.0');
    writeJlist([
      { name: 'The Fairways', cwd: auto },
      { name: 'ngdpbase-addons', cwd: second }
    ]);
    const emptyCron = path.join(tmp, 'empty-cron');
    fs.writeFileSync(emptyCron, '');
    const fromUnit = run(['update', 'all'], { NGDP_UPDATE_CRONTAB_FILE: emptyCron });

    expect(fromUnit.status, fromUnit.out).toBe(0);
    expect(git(auto, 'rev-parse', 'HEAD')).toBe(secondHead);
    expect(git(second, 'rev-parse', 'HEAD')).toBe(git(seed, 'rev-parse', 'HEAD'));
  }, 60000);

  it('does not treat server.sh itself as an automatic updater', () => {
    const site = cloneFrom(primary(), 'addons');
    const head = git(site, 'rev-parse', 'HEAD');
    publish(primary(), '1.1.0');
    const agents = path.join(home, 'Library', 'LaunchAgents');
    fs.mkdirSync(agents, { recursive: true });
    fs.writeFileSync(path.join(agents, 'com.example.direct.plist'), [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<plist version="1.0"><dict><key>ProgramArguments</key><array>',
      `<string>${path.join(site, 'server.sh')}</string>`,
      '<string>update</string>',
      '</array></dict></plist>',
      ''
    ].join('\n'));
    writeJlist([{ name: 'ngdpbase-addons', cwd: site }]);

    const result = run(['update', 'all']);

    // A plist that runs the checkout's server.sh update is an updater of that
    // checkout, so it is skipped as automatic. server.sh itself is not scanned as one.
    expect(result.status, result.out).toBe(0);
    expect(git(site, 'rev-parse', 'HEAD')).toBe(head);
    expect(result.out).toContain('skip (automatic)');
    expect(npmLines()).toEqual([]);
  }, 60000);

  describe('#2305 hardening', () => {
    function loopUpdater(): string {
      const script = path.join(home, 'bin', 'ngdp-loop.sh');
      fs.mkdirSync(path.dirname(script), { recursive: true });
      fs.writeFileSync(script, ['#!/bin/bash', 'for d in "$HOME"/sites/*; do', '  (cd "$d" && ./server.sh update)', 'done', ''].join('\n'));
      fs.chmodSync(script, 0o755);
      const agents = path.join(home, 'Library', 'LaunchAgents');
      fs.mkdirSync(agents, { recursive: true });
      fs.writeFileSync(path.join(agents, 'com.example.loop.plist'), `<plist><dict><array><string>${script}</string></array></dict></plist>\n`);
      return script;
    }

    it('F1: updates nothing it cannot prove unowned when an updater loops over a directory or a cron line runs update', () => {
      const site = cloneFrom(primary(), 'looped');
      const other = cloneFrom(primary(), 'other');
      const siteHead = git(site, 'rev-parse', 'HEAD');
      const otherHead = git(other, 'rev-parse', 'HEAD');
      publish(primary(), '1.1.0');
      writeJlist([
        { name: 'looped-app', cwd: site },
        { name: 'other-app', cwd: other }
      ]);
      const script = loopUpdater();

      const looped = run(['update', 'all']);

      expect(looped.status, looped.out).toBe(3);
      expect(looped.out).toContain(script);
      expect(looped.out).toContain('could not read which checkouts it updates');
      expect(looped.out).toContain(`manual ${fs.realpathSync(site)}`);
      expect(npmLines()).toEqual([]);

      fs.rmSync(path.join(home, 'Library'), { recursive: true });
      const cron = path.join(tmp, 'crontab');
      fs.writeFileSync(cron, '0 3 * * * cd ~/sites/looped && ./server.sh update\n');
      const fromCron = run(['update', 'all'], { NGDP_UPDATE_CRONTAB_FILE: cron });
      expect(fromCron.status, fromCron.out).toBe(3);
      expect(fromCron.out).toContain('crontab');
      expect(fromCron.out).toContain('could not read which checkouts it updates');
      expect(git(site, 'rev-parse', 'HEAD')).toBe(siteHead);
      expect(git(other, 'rev-parse', 'HEAD')).toBe(otherHead);
      expect(npmLines()).toEqual([]);

      fs.writeFileSync(cron, `0 3 * * * cd ${other} && ./server.sh update\n`);
      const named = run(['update', 'all', '--dry-run'], { NGDP_UPDATE_CRONTAB_FILE: cron });
      expect(named.out).toContain('skip (automatic)');
    }, 60000);

    it('F2: a nested checkout without its own .git is refused by the gate', () => {
      const outer = cloneFrom(primary(), 'outer');
      const inner = path.join(outer, 'inner');
      fs.mkdirSync(inner);
      layServer(inner);
      writePolicy([`manual ${inner}`]);
      writeJlist([{ name: 'inner-app', cwd: inner }]);
      const head = git(outer, 'rev-parse', 'HEAD');
      publish(primary(), '1.1.0');

      const result = run(['update', 'all']);

      expect(result.status, result.out).toBe(1);
      expect(result.out).toContain('skip (not-git)');
      expect(git(outer, 'rev-parse', 'HEAD')).toBe(head);
      expect(npmLines()).toEqual([]);
    }, 60000);

    it('F3: a lock without a pid is not taken over, and concurrent lockers never both win', () => {
      const site = cloneFrom(primary(), 'addons');
      writePolicy([`manual ${site}`]);
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
      writePolicy([`manual ${site}`]);
      writeJlist([{ name: 'ngdpbase-addons', cwd: site }]);
      const idStub = path.join(stubBin, 'id');
      fs.writeFileSync(idStub, '#!/bin/bash\necho "${STUB_UID:-0}"\n');
      fs.chmodSync(idStub, 0o755);

      const asRoot = run(['update', 'all'], { STUB_UID: '0' });
      expect(asRoot.status, asRoot.out).toBe(2);
      expect(asRoot.out).toContain('Refusing to run as root');

      const asOther = run(['update', 'all'], { STUB_UID: '4242' });
      expect(asOther.status, asOther.out).toBe(1);
      expect(asOther.out).toContain('skip (not-owned)');
      expect(git(site, 'rev-parse', 'HEAD')).toBe(head);
      expect(npmLines()).toEqual([]);
    }, 60000);

    it('F5: leaves no temp files behind, with or without a dry run', () => {
      const site = cloneFrom(primary(), 'addons');
      publish(primary(), '1.1.0');
      writePolicy([`manual ${site}`]);
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
      writePolicy([`manual ${site}`]);
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
      writePolicy([`manual ${site}`]);
      writeJlist([{ name: 'rogue', cwd: path.join(tmp, 'elsewhere'), script: path.join(site, 'dist', 'src', 'app.js') }]);

      const result = run(['update', 'all']);

      expect(result.status, result.out).toBe(3);
      expect(result.out).toContain('none is an ngdpbase checkout');
      expect(git(site, 'rev-parse', 'HEAD')).toBe(head);
      expect(npmLines()).toEqual([]);
    }, 60000);

    it('F8: refreshes origin/master before the ahead check, says ahead-unknown when it cannot, and a dry run takes no lock', () => {
      const ahead = cloneFrom(primary(), 'ahead');
      fs.writeFileSync(path.join(ahead, 'ahead.txt'), 'local only');
      git(ahead, 'add', 'ahead.txt');
      git(ahead, 'commit', '-q', '-m', 'ahead');
      const aheadHead = git(ahead, 'rev-parse', 'HEAD');
      git(ahead, 'update-ref', 'refs/remotes/origin/master', 'HEAD');
      const offline = cloneFrom(primary(), 'offline');
      git(offline, 'remote', 'set-url', 'origin', path.join(tmp, 'no-such-origin.git'));
      writePolicy([`manual ${ahead}`, `manual ${offline}`]);
      writeJlist([
        { name: 'ahead-app', cwd: ahead },
        { name: 'offline-app', cwd: offline }
      ]);

      const result = run(['update', 'all']);

      expect(result.status, result.out).toBe(1);
      expect(result.out).toContain('skip (ahead)');
      expect(result.out).toContain('skip (ahead-unknown)');
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

    it('N1: a pin that matches no checkout stops the run, naming it', () => {
      const auto = cloneFrom(primary(), 'fairways');
      const other = cloneFrom(primary(), 'encrypted');
      const otherHead = git(other, 'rev-parse', 'HEAD');
      publish(primary(), '1.1.0');
      writeUpdater([auto], [path.join(tmp, 'sites', 'Encrypted-typo')]);
      writeJlist([
        { name: 'The Fairways', cwd: auto },
        { name: 'ngdp-encrypted', cwd: other }
      ]);

      const result = run(['update', 'all']);

      expect(result.status, result.out).toBe(3);
      expect(result.out).toContain('Encrypted-typo');
      expect(result.out).toContain('unknown ownership');
      expect(git(other, 'rev-parse', 'HEAD')).toBe(otherHead);
      expect(npmLines()).toEqual([]);
    }, 60000);

    it('N2: a single-word PM2 app name followed by (pinned) still pins', () => {
      const auto = cloneFrom(primary(), 'fairways');
      const named = cloneFrom(primary(), 'addons-instance');
      const namedHead = git(named, 'rev-parse', 'HEAD');
      publish(primary(), '1.1.0');
      writeUpdater([auto], [], '# ngdpbase-addons (pinned)\n');
      writeJlist([
        { name: 'The Fairways', cwd: auto },
        { name: 'ngdpbase-addons', cwd: named }
      ]);

      const result = run(['update', 'all']);

      expect(result.status, result.out).toBe(0);
      expect(result.out).toContain('skip (pinned)');
      expect(git(named, 'rev-parse', 'HEAD')).toBe(namedHead);
      expect(installsFor(named)).toEqual([]);
    }, 60000);

    it('N3: run through a symlinked checkout path, discovery finds the same checkouts as the real path', () => {
      const site = cloneFrom(primary(), 'addons');
      publish(primary(), '1.1.0');
      writePolicy([`manual ${site}`]);
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

    it('N1: a (pinned) basename with the wrong case blocks the run and names the pin', () => {
      const auto = cloneFrom(primary(), 'fairways');
      const held = cloneFrom(primary(), 'ngdpbase-accounting');
      const other = cloneFrom(primary(), 'encrypted');
      const heads = [held, other].map((dir) => git(dir, 'rev-parse', 'HEAD'));
      publish(primary(), '1.1.0');
      writeUpdater([auto], [], '# Ngdpbase-Accounting (pinned)\n');
      writeJlist([
        { name: 'The Fairways', cwd: auto },
        { name: 'Accounting Dev', cwd: held },
        { name: 'ngdp-encrypted', cwd: other }
      ]);

      const result = run(['update', 'all']);

      expect(result.status, result.out).toBe(3);
      expect(result.out).toContain('Ngdpbase-Accounting');
      expect(result.out).toContain('unknown ownership');
      expect([held, other].map((dir) => git(dir, 'rev-parse', 'HEAD'))).toEqual(heads);
      expect(npmLines()).toEqual([]);
    }, 60000);

    it('N4: other PM2 app names on a (pinned) comment line stay pinned', () => {
      const rows = classifyScript(
        ['# Not here: geohazardwatch, yourphr, ngdpbase-accounting (pinned)', 'SITES=(', '  /x/a-site', ')', 'for s in "${SITES[@]}"; do', '  ./server.sh update', 'done', ''].join('\n'),
        '/updater.sh',
        ['geohazardwatch', 'yourphr', 'Accounting Dev']
      );
      expect(rows.filter((row) => row[0] === 'name').map((row) => row[2])).toEqual(['geohazardwatch', 'yourphr']);
      expect(rows.filter((row) => row[0] === 'basename').map((row) => row[2])).toEqual(['ngdpbase-accounting']);
    });

    it('N5: every ambiguous pin reason is shown', () => {
      const a1 = cloneFrom(primary(), 'one/ngdpbase-accounting');
      const a2 = cloneFrom(primary(), 'two/ngdpbase-accounting');
      const b1 = cloneFrom(primary(), 'one/ngdpbase-reports');
      const b2 = cloneFrom(primary(), 'two/ngdpbase-reports');
      const auto = cloneFrom(primary(), 'fairways');
      writeUpdater([auto], [], '# ngdpbase-accounting (pinned), ngdpbase-reports (pinned)\n');
      writeJlist([
        { name: 'Acc one', cwd: a1 },
        { name: 'Acc two', cwd: a2 },
        { name: 'Rep one', cwd: b1 },
        { name: 'Rep two', cwd: b2 },
        { name: 'The Fairways', cwd: auto }
      ]);

      const result = run(['update', 'all', '--dry-run']);

      expect(result.status, result.out).toBe(3);
      const why = result.out.split('\n').find((line) => line.includes('ownership is incomplete')) ?? '';
      expect(why).toContain('basename ngdpbase-accounting');
      expect(why).toContain('basename ngdpbase-reports');
    }, 60000);

    it('N6: a stopped PM2 entry does not count as a running checkout for a pin', () => {
      const live = cloneFrom(primary(), 'one/ngdpbase-accounting');
      const stopped = cloneFrom(primary(), 'two/ngdpbase-accounting');
      const auto = cloneFrom(primary(), 'fairways');
      writeUpdater([auto], [], '# ngdpbase-accounting (pinned)\n');
      writeJlist([
        { name: 'Acc live', cwd: live },
        { name: 'Acc stopped', cwd: stopped, status: 'stopped' },
        { name: 'The Fairways', cwd: auto }
      ]);

      const result = run(['update', 'all', '--dry-run']);

      expect(result.out).not.toContain('2 running checkouts use it');
      expect(result.out).not.toContain('unknown ownership');
      expect(result.status, result.out).toBe(0);
      expect(result.out).toContain('skip (pinned)');
    }, 60000);
  });

  it('dry-runs the updater comment that pins one directory basename', () => {
    const place = (rel: string): string => {
      const dir = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(dir), { recursive: true });
      git(tmp, 'clone', '-q', origin, dir);
      writeInstanceEnv(dir);
      return dir;
    };
    const jimstest = place('github/ngdpbase');
    const fairways = place('github/fairways-base');
    const yourphr = place('github/ngdpbase-yourphr');
    const accounting = place('github/ngdpbase-accounting');
    const addons = place('instances/ngdpbase-addons-instance');
    const encrypted = place('github/ngdpbase-encrypted');
    const tempBuild = path.join(tmp, 'temp-builds', 'ngdpbase');
    const heads = [jimstest, fairways, yourphr, accounting, addons, encrypted].map((dir) => git(dir, 'rev-parse', 'HEAD'));
    const script = path.join(home, 'bin', 'ngdp-autoupdate.sh');
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.writeFileSync(script, [
      '# Order matters: jimstest first, then satellites. Not here on purpose:',
      '# geohazardwatch, yourphr, ngdpbase-accounting (pinned), worktrees.',
      'SITES=(',
      `  ${jimstest}`,
      `  ${fairways}`,
      `  ${yourphr}`,
      `  ${tempBuild}`,
      ')',
      'TAG=v1.0.0',
      'for site in "${SITES[@]}"; do',
      '  (cd "$site" && ./server.sh update "$TAG")',
      'done',
      '# skip a checkout that has local changes',
      ''
    ].join('\n'));
    const agents = path.join(home, 'Library', 'LaunchAgents');
    fs.mkdirSync(agents, { recursive: true });
    fs.writeFileSync(path.join(agents, 'com.example.ngdp-autoupdate.plist'), [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<plist version="1.0"><dict><key>ProgramArguments</key><array>',
      `<string>${script}</string>`,
      '</array></dict></plist>',
      ''
    ].join('\n'));
    writeJlist([
      { name: 'jimstest', cwd: jimstest },
      { name: 'The Fairways', cwd: fairways },
      { name: 'ngdpbase-yourphr', cwd: yourphr },
      { name: 'Accounting Dev', cwd: accounting },
      { name: 'ngdpbase-addons', cwd: addons },
      { name: 'ngdp-encrypted', cwd: encrypted }
    ]);

    const result = run(['update', 'all', '--dry-run']);

    expect(result.status, result.out).toBe(0);
    expect(result.out).not.toContain('ambiguous-pin');
    expect(result.out).not.toContain('unknown ownership');
    expect(result.out.match(/skip \(automatic\)/g)).toHaveLength(3);
    expect(result.out).toContain('skip (pinned)');
    expect(result.out).toContain(accounting);
    expect(result.out).not.toContain('site list stays authoritative');
    const blocks = result.out.split(/\n(?=\[\d+\/\d+\])/);
    const yourBlock = blocks.find((block) => block.includes(yourphr));
    expect(yourBlock).toContain('skip (automatic)');
    expect(yourBlock).not.toContain('skip (pinned)');
    expect(result.out.match(/dry-run: would run: \.\/server\.sh update/g)).toEqual([
      'dry-run: would run: ./server.sh update',
      'dry-run: would run: ./server.sh update'
    ]);
    expect(blocks.find((block) => block.includes(addons))).toContain('dry-run: would run: ./server.sh update');
    expect(blocks.find((block) => block.includes(encrypted))).toContain('dry-run: would run: ./server.sh update');
    expect(npmLines()).toEqual([]);
    [jimstest, fairways, yourphr, accounting, addons, encrypted].forEach((dir, index) => {
      expect(git(dir, 'rev-parse', 'HEAD')).toBe(heads[index]);
    });
  }, 60000);

  it('does not guess when two checkouts share a pinned directory basename', () => {
    const place = (rel: string): string => {
      const dir = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(dir), { recursive: true });
      git(tmp, 'clone', '-q', origin, dir);
      writeInstanceEnv(dir);
      return dir;
    };
    const first = place('one/ngdpbase-accounting');
    const second = place('two/ngdpbase-accounting');
    const auto = place('github/fairways-base');
    const other = place('instances/ngdpbase-addons-instance');
    const heads = [first, second, auto, other].map((dir) => git(dir, 'rev-parse', 'HEAD'));
    const script = path.join(home, 'bin', 'ngdp-autoupdate.sh');
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.writeFileSync(script, [
      '# ngdpbase-accounting (pinned)',
      'SITES=(',
      `  ${auto}`,
      ')',
      'for site in "${SITES[@]}"; do',
      '  (cd "$site" && ./server.sh update "$TAG")',
      'done',
      ''
    ].join('\n'));
    const agents = path.join(home, 'Library', 'LaunchAgents');
    fs.mkdirSync(agents, { recursive: true });
    fs.writeFileSync(path.join(agents, 'com.example.collide.plist'), [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<plist version="1.0"><dict><key>ProgramArguments</key><array>',
      `<string>${script}</string>`,
      '</array></dict></plist>',
      ''
    ].join('\n'));
    writeJlist([
      { name: 'Accounting Dev', cwd: first },
      { name: 'Accounting Dev copy', cwd: second },
      { name: 'The Fairways', cwd: auto },
      { name: 'ngdpbase-addons', cwd: other }
    ]);

    const result = run(['update', 'all', '--dry-run']);

    expect(result.status, result.out).toBe(3);
    expect(result.out).toContain('2 running checkouts use it');
    expect(result.out).toContain('unknown ownership');
    expect(result.out).not.toContain('dry-run: would run:');
    expect(npmLines()).toEqual([]);
    [first, second, auto, other].forEach((dir, index) => {
      expect(git(dir, 'rev-parse', 'HEAD')).toBe(heads[index]);
    });
  }, 60000);
});

describe('updater comment fixture', () => {
  const fixture = [
    '# Order matters: jimstest first, then satellites. Not here on purpose:',
    '# geohazardwatch, yourphr, ngdpbase-accounting (pinned), worktrees.',
    'SITES=(',
    '  /Volumes/hd2A/workspaces/github/ngdpbase',
    '  /Volumes/hd2A/workspaces/github/fairways-base',
    '  /Volumes/hd2A/workspaces/github/ngdpbase-yourphr',
    '  /Volumes/hd2/ngdp-temp-builds/ngdpbase',
    ')',
    'for site in "${SITES[@]}"; do',
    '  (cd "$site" && ./server.sh update "$TAG")',
    'done',
    '# skip a checkout that has local changes',
    ''
  ].join('\n');

  it('keeps the site list authoritative and pins the marked basename and the other named app', () => {
    const rows = classifyScript(fixture, '/updater.sh', [
      'Accounting Dev',
      'yourphr',
      'jimstest',
      'The Fairways',
      'ngdpbase-yourphr'
    ]);
    const autos = rows.filter((row) => row[0] === 'path' && row[1] === 'auto').map((row) => row[2]);
    expect(autos).toEqual([
      '/Volumes/hd2A/workspaces/github/ngdpbase',
      '/Volumes/hd2A/workspaces/github/fairways-base',
      '/Volumes/hd2A/workspaces/github/ngdpbase-yourphr',
      '/Volumes/hd2/ngdp-temp-builds/ngdpbase'
    ]);
    expect(rows.filter((row) => row[0] === 'basename')).toEqual([
      ['basename', 'pinned', 'ngdpbase-accounting', '/updater.sh']
    ]);
    // N4: the other PM2 app name on the pin line stays pinned.
    expect(rows.filter((row) => row[0] === 'name')).toEqual([['name', 'pinned', 'yourphr', '/updater.sh']]);
    expect(rows.some((row) => row[0] === 'note' && row[1] === 'block')).toBe(false);
  });
});

describe('a pin line that pins nothing blocks even beside a real pin', () => {
  const wrap = (pinLines: string[]) =>
    ['# /tmp (pinned)', ...pinLines, 'SITES=(', '  /x/a-site', ')', 'for s in "${SITES[@]}"; do', '  ./server.sh update', 'done', ''].join('\n');
  const blocks = (text: string, names: string[]) =>
    classifyScript(text, '/updater.sh', names).filter((row) => row[0] === 'note' && row[1] === 'block');

  it('control: the real pin alone does not block', () => {
    expect(blocks(wrap([]), ['wiki-prod'])).toEqual([]);
  });

  it('blocks on an unmatched short basename', () => {
    expect(blocks(wrap(['# blog (pinned)']), ['wiki-prod']).map((r) => r[2]).join()).toContain('# blog (pinned)');
  });

  it('blocks on a case mismatch with a PM2 app name', () => {
    expect(blocks(wrap(['# skip Wiki-Prod']), ['wiki-prod']).map((r) => r[2]).join()).toContain('Wiki-Prod');
  });

  it('pins array names that are PM2 apps and blocks on names that are not', () => {
    const rows = classifyScript(wrap(['PINNED=(wiki-prod)']), '/updater.sh', ['wiki-prod']);
    expect(rows.filter((r) => r[0] === 'name').map((r) => r[2])).toEqual(['wiki-prod']);
    expect(blocks(wrap(['PINNED=(wiki-prod)']), ['wiki-prod'])).toEqual([]);
    expect(blocks(wrap(['PINNED=(wiki-prd)']), ['wiki-prod']).map((r) => r[2]).join()).toContain('wiki-prd');
  });

  it('blocks on a $HOME path pin', () => {
    expect(blocks(wrap(['# $HOME/sites/wiki (pinned)']), ['wiki-prod']).map((r) => r[2]).join()).toContain('$HOME/sites/wiki');
  });

  describe('a pin array entry built from a variable blocks and is named', () => {
    const quoted = ['PINNED=(/srv/old-site "$HOME/sites/wiki")'];
    const multiLine = ['PINNED=(', '  /srv/old-site', '  ${SITES_DIR}/wiki', ')'];
    const bare = (pinLines: string[]) =>
      [...pinLines, 'SITES=(', '  /x/a-site', ')', 'for s in "${SITES[@]}"; do', '  ./server.sh update', 'done', ''].join('\n');

    it('single-line quoted $HOME entry, beside another pin', () => {
      expect(blocks(wrap(quoted), ['wiki-prod']).map((r) => r[2]).join()).toContain('$HOME/sites/wiki');
    });

    it('single-line quoted $HOME entry, as the only pin', () => {
      expect(blocks(bare(quoted), ['wiki-prod']).map((r) => r[2]).join()).toContain('$HOME/sites/wiki');
    });

    it('multi-line ${SITES_DIR} entry, beside another pin', () => {
      expect(blocks(wrap(multiLine), ['wiki-prod']).map((r) => r[2]).join()).toContain('${SITES_DIR}/wiki');
    });

    it('multi-line ${SITES_DIR} entry, as the only pin', () => {
      expect(blocks(bare(multiLine), ['wiki-prod']).map((r) => r[2]).join()).toContain('${SITES_DIR}/wiki');
    });
  });

  it('counts a PM2 app name in a pin array when it is the only pin', () => {
    const text = ['PINNED=(wiki-prod)', 'SITES=(', '  /x/a-site', ')', 'for s in "${SITES[@]}"; do', '  ./server.sh update', 'done', ''].join(
      '\n'
    );
    const rows = classifyScript(text, '/updater.sh', ['wiki-prod']);
    expect(rows.filter((r) => r[0] === 'name').map((r) => r[2])).toEqual(['wiki-prod']);
    expect(blocks(text, ['wiki-prod'])).toEqual([]);
  });
});

describe('every pin line is read in full or blocks', () => {
  const tail = ['SITES=(', '  /x/a-site', ')', 'for s in "${SITES[@]}"; do', '  ./server.sh update', 'done', ''];
  const layouts: [string, (pinLines: string[]) => string][] = [
    ['alone', (pinLines) => [...pinLines, ...tail].join('\n')],
    ['beside another pin', (pinLines) => ['# /usr (pinned)', ...pinLines, ...tail].join('\n')]
  ];
  const rowsFor = (text: string) => classifyScript(text, '/updater.sh', ['wiki-prod']);
  const blockText = (text: string) =>
    rowsFor(text)
      .filter((row) => row[0] === 'note' && row[1] === 'block')
      .map((row) => row[2])
      .join('\n');
  const pinnedPaths = (text: string) => rowsFor(text).filter((row) => row[0] === 'path' && row[1] === 'pinned').map((row) => row[2]);
  const pinnedNames = (text: string) => rowsFor(text).filter((row) => row[0] === 'name').map((row) => row[2]);
  const varPath = fs.realpathSync('/var');

  const prefixes = ['declare -a ', 'declare -ga ', 'typeset -a ', 'readonly ', 'readonly -a ', 'local ', 'export ', '  local -a '];

  // Literal entries in every prefixed form are pinned, one-line and multi-line.
  const literal: [string, string[]][] = [];
  for (const prefix of prefixes) {
    literal.push([`${prefix}PINNED=(/var wiki-prod)`, [`${prefix}PINNED=(/var wiki-prod)`]]);
    literal.push([`${prefix}SKIP=( multi-line )`, [`${prefix}SKIP=(`, '  /var', '  wiki-prod', ')']]);
  }
  literal.push(['PINNED+=(/var wiki-prod)', ['PINNED+=(/var wiki-prod)']]);
  literal.push(['PINNED+=( multi-line )', ['PINNED+=(', '  /var', '  wiki-prod', ')']]);
  literal.push(['exclude=(/var wiki-prod) in lower case', ['exclude=(/var wiki-prod)']]);
  literal.push(['PINNED=/var:wiki-prod string', ['PINNED=/var:wiki-prod']]);
  literal.push(['local in a function', ['pins() {', '  local PINNED=(', '    /var', '    wiki-prod', '  )', '}']]);

  for (const [label, pinLines] of literal) {
    for (const [layout, build] of layouts) {
      it(`pins /var and wiki-prod from ${label}, ${layout}`, () => {
        const text = build(pinLines);
        expect(pinnedPaths(text)).toContain(varPath);
        expect(pinnedNames(text)).toContain('wiki-prod');
        expect(blockText(text)).toBe('');
      });
    }
  }

  // A variable, command or ~ left on any pin line blocks and is named, even next to a literal pin.
  const unresolved: [string, string[], string][] = [];
  for (const prefix of prefixes) {
    unresolved.push([`${prefix}PINNED=(/var "$HOME/x")`, [`${prefix}PINNED=(/var "$HOME/x")`], '$HOME/x']);
    unresolved.push([`${prefix}PINNED=( multi-line $HOME )`, [`${prefix}PINNED=(`, '  /var', '  "$HOME/x"', ')'], '$HOME/x']);
  }
  unresolved.push(['PINNED+=(/var "$HOME/x") after PINNED=(/var)', ['PINNED=(/var)', 'PINNED+=(/var "$HOME/x")'], '$HOME/x']);
  unresolved.push(['PINNED+=( multi-line $HOME )', ['PINNED=(/var)', 'PINNED+=(', '  /var', '  ${SITES_DIR}/wiki', ')'], '${SITES_DIR}/wiki']);
  unresolved.push(['PINNED=/var:$HOME/x string', ['PINNED=/var:$HOME/x'], '$HOME/x']);
  unresolved.push(['export PINNED="/var $HOME/x" string', ['export PINNED="/var $HOME/x"'], '$HOME/x']);
  unresolved.push(['PINNED=~/wiki string', ['PINNED=~/wiki'], '~/wiki']);
  unresolved.push(['PINNED=(/var `cat /etc/pins`)', ['PINNED=(/var `cat /etc/pins`)'], '`cat']);
  unresolved.push(['# pinned: /var $HOME/sites/wiki', ['# pinned: /var $HOME/sites/wiki'], '$HOME/sites/wiki']);
  unresolved.push(['# pinned: then /var $HOME/sites/wiki on the next comment', ['# pinned:', '#   /var $HOME/sites/wiki'], '$HOME/sites/wiki']);
  unresolved.push(['# /var (pinned) and ~/wiki', ['# /var (pinned) and ~/wiki'], '~/wiki']);

  for (const [label, pinLines, named] of unresolved) {
    for (const [layout, build] of layouts) {
      it(`blocks on ${label}, ${layout}`, () => {
        expect(blockText(build(pinLines))).toContain(named);
      });
    }
  }

  // A pin variable filled in a way the scan does not read blocks, naming the line.
  const unreadable: [string, string[], string][] = [];
  unreadable.push(['a pin array opened mid-line', ['true; PINNED=(/var)'], 'true; PINNED=(/var)']);
  unreadable.push(['a multi-line pin array opened mid-line', ['true; PINNED=(', '  /srv/unread-site', ')'], 'true; PINNED=(']);
  // A quoted string is one path, as in an array, so a space-separated list in quotes names a path that does not exist.
  unreadable.push(['a quoted space-separated pin string', ['export PINNED="/var wiki-prod"'], '/var wiki-prod']);
  unreadable.push(['readarray into a pin array', ['readarray -t PINNED < /etc/pins'], 'readarray -t PINNED']);
  unreadable.push(['an indexed pin assignment with a variable', ['PINNED[0]=$HOME/x'], '$HOME/x']);

  for (const [label, pinLines, named] of unreadable) {
    for (const [layout, build] of layouts) {
      it(`blocks on ${label}, ${layout}`, () => {
        expect(blockText(build(pinLines))).toContain(named);
      });
    }
  }
});

describe('update-all-scan.mjs process entry', () => {
  const scanner = path.join(REPO_ROOT, 'scripts', 'update-all-scan.mjs');

  it('sanitize-pm2 trims whitespace around PM2 app names', () => {
    const jlist = JSON.stringify([{ name: ' \tprod-site  \t', pm2_env: { pm_cwd: '/x/a-site', status: 'online' } }]);
    const result = spawnSync(process.execPath, [scanner, 'sanitize-pm2'], { input: jlist, encoding: 'utf8', env: envWithoutGit });
    expect(result.status).toBe(0);
    expect(result.stdout.split('\0')[0]).toBe('prod-site');
  });

  it('exits 1 and names the path when its own path cannot be resolved', () => {
    const code = `process.argv[1] = '/nonexistent/update-all-scan.mjs'; await import(${JSON.stringify(scanner)});`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', env: envWithoutGit });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('cannot resolve /nonexistent/update-all-scan.mjs');
  });
});
