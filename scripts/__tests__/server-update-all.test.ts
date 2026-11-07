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

function run(args: string[], extra: NodeJS.ProcessEnv = {}): { status: number | null; out: string } {
  const result = spawnSync('bash', [path.join(driver, 'server.sh'), ...args], {
    cwd: driver,
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

    expect(result.status, result.out).toBe(0);
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

    expect(result.status, result.out).toBe(0);
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

  it('updates a path with spaces once when PM2 lists it twice, including via a symlink and the script path', () => {
    const site = cloneFrom(primary(), 'My Site');
    const link = path.join(tmp, 'sites', 'site-link');
    fs.symlinkSync(site, link);
    const next = publish(primary(), '1.1.0');
    writePolicy([`manual ${site}`]);
    writeJlist([
      { name: 'The Fairways', cwd: site, watch: true },
      { name: 'fairways-again', cwd: link },
      { name: 'from-script', cwd: '', script: path.join(site, 'dist', 'src', 'app.js') }
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
    fs.writeFileSync(path.join(ahead, 'ahead.txt'), 'local only');
    git(ahead, 'add', 'ahead.txt');
    git(ahead, 'commit', '-q', '-m', 'ahead');
    const aheadHead = git(ahead, 'rev-parse', 'HEAD');
    git(feature, 'checkout', '-q', '-b', 'feature');
    const featureHead = git(feature, 'rev-parse', 'HEAD');
    const gitDir = git(locked, 'rev-parse', '--absolute-git-dir');
    fs.writeFileSync(path.join(gitDir, 'index.lock'), '');
    const lockedHead = git(locked, 'rev-parse', 'HEAD');
    const next = publish(primary(), '1.1.0');
    git(diverged, 'fetch', '-q', 'origin');
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
    fs.mkdirSync(lock, { recursive: true });
    fs.writeFileSync(path.join(lock, 'pid'), String(process.pid));

    const held = run(['update', 'all', '--dry-run']);

    expect(held.status, held.out).toBe(2);
    expect(held.out).toContain('already running');
    expect(git(site, 'rev-parse', 'HEAD')).toBe(head);

    fs.writeFileSync(path.join(lock, 'pid'), String(deadPid()));
    const reclaimed = run(['update', 'all', '--dry-run']);
    expect(reclaimed.status, reclaimed.out).toBe(0);
    expect(reclaimed.out).toContain('dry-run: would run: ./server.sh update');
    expect(fs.existsSync(lock)).toBe(false);
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

    expect(result.status, result.out).toBe(3);
    expect(git(site, 'rev-parse', 'HEAD')).toBe(head);
    expect(result.out).toContain('No automatic updater script found');
  }, 60000);
});
