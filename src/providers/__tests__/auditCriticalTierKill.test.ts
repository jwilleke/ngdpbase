/**
 * #1158 — the unclean-exit case, proved with an actual unclean exit.
 *
 * Every other assertion about the critical tier runs in-process, so all of
 * them are ultimately a statement about what this process can see. The claim
 * being made is stronger than that: a `token-mint` record must survive the
 * process dying without ever unwinding — no `close()`, no flush timer, no
 * `finally`, no exit handler.
 *
 * So this spawns a real child, mints in it, and `SIGKILL`s it. SIGKILL cannot
 * be caught or ignored, which is the point: nothing in the child gets a chance
 * to tidy up, exactly as in a power loss or an OOM kill. If the record is on
 * disk afterwards, it was written before the mint returned.
 *
 * __What this proves and what it does not.__ It proves the bytes left the
 * process and reached the filesystem before the action completed. It does NOT
 * prove they survive power loss — that needs the fsync the sibling suite
 * asserts with a spy, and even fsync trusts a disk controller's cache. The two
 * suites are complementary, and neither is sufficient alone.
 *
 * Runs against `dist/`, so it exercises the built artefact rather than the
 * sources. It skips rather than fails when `dist` is absent, because a fresh
 * checkout that has not run `npm run build` should not see a red suite for a
 * missing build — but the skip is reported so it cannot pass silently.
 */
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const DIST = path.join(process.cwd(), 'dist', 'src', 'providers', 'FileAuditProvider.js');
const DIST_REGISTRY = path.join(process.cwd(), 'dist', 'src', 'utils', 'auditRegistry.js');
const SHIPPED_CONFIG = path.join(process.cwd(), 'config', 'app-default-config.json');
const built = fs.existsSync(DIST);

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-kill-'));
});

afterEach(async () => {
  // Only the temp directory this test created. Never a data directory.
  await fs.remove(dir);
});

/**
 * The child: mint a critical event, then kill itself with no unwinding at all.
 *
 * The flush interval is ten minutes and nothing calls `close()`, so the timer
 * and the shutdown path are both excluded as explanations. The only thing that
 * can put the record on disk is `writeEvent` itself.
 */
function childScript(logDir: string): string {
  return `
import { readFileSync } from 'fs';
import FileAuditProvider from ${JSON.stringify(DIST)};
import { bindAuditEvents, AUDIT_EVENTS_KEY } from ${JSON.stringify(DIST_REGISTRY)};

// #1200: the tier comes from configuration, bound at boot by AuditManager.
// This child has no AuditManager, so it binds the shipped map itself — the
// same thing vitest.setup.ts does for in-process tests.
const shipped = JSON.parse(readFileSync(${JSON.stringify(SHIPPED_CONFIG)}, 'utf8'));
bindAuditEvents((key, d) => (key === AUDIT_EVENTS_KEY ? shipped[key] : d));

const config = {
  'ngdpbase.audit.provider.file.auditfilename': 'audit.log',
  'ngdpbase.audit.flushinterval': 600000,
  'ngdpbase.audit.maxqueuesize': 1000
};
const engine = {
  getManager: (name) => (name === 'ConfigurationManager'
    ? {
      getProperty: (k, d) => (k in config ? config[k] : d),
      getResolvedDataPath: () => ${JSON.stringify(logDir)}
    }
    : null)
};

const provider = new FileAuditProvider(engine);
await provider.initialize();
await provider.logAuditEvent({
  eventType: 'token-mint',
  user: 'jim',
  action: 'token-mint',
  result: 'success',
  severity: 'low',
  metadata: { id: 'tok-killed' }
});

// The mint has returned. Die the way a power cut does: no unwinding, no
// handlers, no flush. Anything still buffered at this instant is gone.
process.kill(process.pid, 'SIGKILL');
`;
}

describe.skipIf(!built)('#1158 — a critical record survives an unclean exit', () => {
  test('SIGKILL immediately after token-mint leaves the record on disk', () => {
    const script = path.join(dir, 'mint-and-die.mjs');
    fs.writeFileSync(script, childScript(dir));

    let killed = false;
    try {
      execFileSync(process.execPath, [script], { stdio: 'pipe', timeout: 30000 });
    } catch (err) {
      // Expected: the child SIGKILLs itself, so execFileSync throws.
      killed = (err as { signal?: string }).signal === 'SIGKILL';
      if (!killed) {
        const e = err as { stderr?: Buffer; signal?: string; status?: number };
        throw new Error(
          `child did not die by SIGKILL (signal=${String(e.signal)} status=${String(e.status)}): ` +
          String(e.stderr ?? '')
        );
      }
    }

    // Guards the test itself: if the child exited normally, it never proved
    // anything about an unclean exit and the assertion below would be hollow.
    expect(killed).toBe(true);

    const logFile = path.join(dir, 'audit.log');
    expect(fs.existsSync(logFile)).toBe(true);

    const records = fs.readFileSync(logFile, 'utf8')
      .split('\n').filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>);

    expect(records.map((r) => r.eventType)).toEqual(['token-mint']);
    expect(records[0].seq).toBe(1);
    // The chain stamp survived with it — a record without its hash would be
    // unverifiable, which is no better than a missing one.
    expect(typeof records[0].hash).toBe('string');
  }, 40000);
});

// A skipped suite must announce itself; a silently absent proof is the thing
// this whole issue chain keeps finding.
describe.runIf(!built)('#1158 — unclean-exit proof', () => {
  test.fails('requires dist/ — run `npm run build` to exercise it', () => {
    throw new Error('dist/ not built');
  });
});
