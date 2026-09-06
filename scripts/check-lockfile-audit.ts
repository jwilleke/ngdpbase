#!/usr/bin/env tsx
/**
 * Dependency audit over EVERY lockfile in the repo (#1242, #1177).
 *
 * `npm audit` at the root reads the root lockfile and nothing else. Five
 * bundled addons carry their own `package-lock.json`; their dependencies are
 * as loaded into the ngdpbase process as the root's. When `qs` was bumped at
 * the root (#1170) the root audit went clean while `qs` stayed vulnerable in
 * four addons — six open alerts a root-level audit reported as nothing.
 *
 * This walks the tree for `package-lock.json` files (never inside
 * node_modules), runs `npm audit --omit=dev --json` in each directory, and
 * fails on any finding at or above LEVEL. It reads npm's exit code with npm's
 * own semantics — 0 clean, 1 findings, anything else a tool failure — rather
 * than treating non-zero as failure; other package managers exit a severity
 * bitmask, and /pstatus's notes record that trap.
 *
 * Network-dependent: the advisory database is fetched. Offline, every lockfile
 * reports `unreachable` and the run exits 0 with that said plainly — a check
 * that cannot run is announced, never silently green and never a red that
 * blocks an offline commit.
 */
import { spawnSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const REPO = path.resolve(path.dirname(__filename), '..');

/** Findings at this severity or above fail the run. Matches the root's expectation. */
export const LEVEL: Severity = 'moderate';
export type Severity = 'info' | 'low' | 'moderate' | 'high' | 'critical';
const ORDER: Severity[] = ['info', 'low', 'moderate', 'high', 'critical'];

const SKIPPED_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage']);

/**
 * Advisories the operator has decided to carry, for now (#1242).
 *
 * An entry names the GHSA id, the issue that holds the decision, why, and a
 * review date after which the entry stops counting — a tolerated advisory
 * with no expiry is one nobody looks at again. A finding is subtracted only
 * when EVERY advisory behind it is listed and unexpired; a package with one
 * listed and one new advisory still fails.
 */
export interface AllowlistEntry { advisory: string; issue: string; reason: string; reviewBy: string }
export const ALLOWLIST_FILE = 'scripts/audit-allowlist.json';

export function loadAllowlist(repo: string = REPO, now: Date = new Date()): Map<string, AllowlistEntry> {
  const file = path.join(repo, ALLOWLIST_FILE);
  const out = new Map<string, AllowlistEntry>();
  if (!existsSync(file)) return out;
  const entries = JSON.parse(readFileSync(file, 'utf8')) as { entries?: AllowlistEntry[] };
  for (const e of entries.entries ?? []) {
    if (!/^GHSA-[\w-]+$/.test(e.advisory) || !e.issue || !e.reason || !e.reviewBy) continue;
    if (new Date(e.reviewBy).getTime() < now.getTime()) continue; // expired: counts again
    out.set(e.advisory, e);
  }
  return out;
}

/** Every `package-lock.json` under `repo`, relative to it, root first. */
export function findLockfiles(repo: string = REPO): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (!SKIPPED_DIRS.has(entry)) walk(full);
      } else if (entry === 'package-lock.json') {
        out.push(path.relative(repo, full));
      }
    }
  };
  if (existsSync(repo)) walk(repo);
  return out.sort((a, b) => a.length - b.length || a.localeCompare(b));
}

export interface AuditCounts { info: number; low: number; moderate: number; high: number; critical: number; total: number }
export interface LockfileResult {
  lockfile: string;
  status: 'clean' | 'findings' | 'unreachable' | 'error';
  counts: AuditCounts | null;
  /** Findings subtracted because every advisory behind them is allowlisted and unexpired. */
  allowlisted?: string[];
  detail?: string;
}

interface NpmVulnerability {
  severity: Severity;
  via: Array<string | { url?: string; severity?: Severity }>;
}

/** What one `npm audit --json` run returned: its exit code and stdout. Injectable for tests. */
export type AuditRunner = (dir: string) => { status: number | null; stdout: string; stderr: string };

const npmAudit: AuditRunner = (dir) => {
  const r = spawnSync('npm', ['audit', '--omit=dev', '--json'], { cwd: dir, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};

/** Interpret one run the way npm means it. */
export function interpret(lockfile: string, run: ReturnType<AuditRunner>, allow: Map<string, AllowlistEntry> = new Map()): LockfileResult {
  let parsed: { metadata?: { vulnerabilities?: Partial<AuditCounts> }; vulnerabilities?: Record<string, NpmVulnerability>; error?: { code?: string; summary?: string } } | null = null;
  try { parsed = JSON.parse(run.stdout) as typeof parsed; } catch { parsed = null; }

  // npm reports a registry it could not reach as an error object with ENOTFOUND / EAI_AGAIN / ECONNREFUSED.
  const errCode = parsed?.error?.code ?? '';
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ENETUNREACH/.test(errCode + run.stderr)) {
    return { lockfile, status: 'unreachable', counts: null, detail: parsed?.error?.summary ?? errCode };
  }
  if (run.status !== 0 && run.status !== 1) {
    return { lockfile, status: 'error', counts: null, detail: `npm exited ${run.status ?? 'null'}: ${(run.stderr || parsed?.error?.summary || '').trim().slice(0, 200)}` };
  }
  const v = parsed?.metadata?.vulnerabilities;
  if (!v) return { lockfile, status: 'error', counts: null, detail: 'no vulnerabilities block in npm audit output' };
  const counts: AuditCounts = {
    info: v.info ?? 0, low: v.low ?? 0, moderate: v.moderate ?? 0, high: v.high ?? 0, critical: v.critical ?? 0,
    total: v.total ?? ((v.info ?? 0) + (v.low ?? 0) + (v.moderate ?? 0) + (v.high ?? 0) + (v.critical ?? 0))
  };

  // Subtract a package whose every advisory is allowlisted. A package reached
  // only THROUGH another vulnerable package (`via` is a bare name) inherits
  // that package's verdict, so it is subtracted when the package it names is.
  const allowlisted: string[] = [];
  if (allow.size > 0 && parsed?.vulnerabilities) {
    const packages = parsed.vulnerabilities;
    const covered = new Map<string, boolean>();
    const isCovered = (name: string, seen: Set<string> = new Set()): boolean => {
      if (covered.has(name)) return covered.get(name) as boolean;
      if (seen.has(name)) return false;
      seen.add(name);
      const pkg = packages[name];
      if (!pkg || pkg.via.length === 0) return false;
      const ok = pkg.via.every((via) => {
        if (typeof via === 'string') return isCovered(via, seen);
        const id = /GHSA-[\w-]+/.exec(via.url ?? '')?.[0];
        return id !== undefined && allow.has(id);
      });
      covered.set(name, ok);
      return ok;
    };
    for (const [name, pkg] of Object.entries(packages)) {
      if (isCovered(name)) {
        allowlisted.push(name);
        counts[pkg.severity] = Math.max(0, counts[pkg.severity] - 1);
        counts.total = Math.max(0, counts.total - 1);
      }
    }
  }
  return { lockfile, status: atOrAbove(counts, LEVEL) > 0 ? 'findings' : 'clean', counts, ...(allowlisted.length ? { allowlisted } : {}) };
}

/** How many findings sit at `level` or above. */
export function atOrAbove(counts: AuditCounts, level: Severity): number {
  return ORDER.slice(ORDER.indexOf(level)).reduce((n, s) => n + counts[s], 0);
}

export function run(repo: string = REPO, runner: AuditRunner = npmAudit, now: Date = new Date()): LockfileResult[] {
  const allow = loadAllowlist(repo, now);
  return findLockfiles(repo).map((lockfile) => interpret(lockfile, runner(path.join(repo, path.dirname(lockfile))), allow));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  console.log('Dependency audit — every lockfile (#1242)');
  console.log('========================================');
  const results = run();
  let failing = 0;
  for (const r of results) {
    const c = r.counts;
    const line = c ? `critical ${c.critical}, high ${c.high}, moderate ${c.moderate}, low ${c.low}, info ${c.info}` : (r.detail ?? '');
    const allowed = r.allowlisted?.length ? `  (allowlisted: ${r.allowlisted.join(', ')} — see ${ALLOWLIST_FILE})` : '';
    console.log(`  ${r.status.padEnd(11)} ${r.lockfile}  ${line}${allowed}`);
    if (r.status === 'findings' || r.status === 'error') failing++;
  }
  if (results.every((r) => r.status === 'unreachable')) {
    console.log('\nThe advisory registry was unreachable for every lockfile — the audit did NOT run. Not a pass.');
    process.exit(0);
  }
  if (failing === 0) {
    console.log(`\n${results.length} lockfile(s) audited; nothing at ${LEVEL} or above.`);
    process.exit(0);
  }
  console.error(`\n${failing} lockfile(s) with findings at ${LEVEL} or above, or an audit that failed. Run npm audit in that directory.`);
  process.exit(1);
}
