/**
 * #1158 — the critical tier did not mean what the registry says it means.
 *
 * `auditRegistry.ts` defines `critical` as *"the action must not complete
 * unless the record does"*, and `page.delete`, `token.mint`, `token.revoke`,
 * the lifecycle events and `posture.recorded` all carry it. What actually
 * happened was: queue in memory, flush on a 30-second timer, `fs.appendFile`
 * with no fsync. A credential could be minted and the record naming it lost to
 * an unclean exit, which is the case #1111 called the worst one.
 *
 * These assertions are about WHEN the bytes are on disk, so they are written
 * against the file rather than against a spy: a mock proves the code called
 * something, and the guarantee is that the record is readable by another
 * process before the action is allowed to complete.
 */
vi.unmock('../BaseAuditProvider');
vi.unmock('../FileAuditProvider');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import fsp from 'fs/promises';
import FileAuditProvider from '../FileAuditProvider';
import { verifyChain } from '../../utils/auditChain';
import { criticalEventTypes, isCriticalEventType } from '../../utils/auditRegistry';

let dir: string;

/**
 * A flush interval long enough that the timer can never be what wrote a
 * record. If a test sees bytes on disk, the write path put them there.
 */
const NEVER = 10 * 60 * 1000;

function makeProvider(overrides: Record<string, unknown> = {}) {
  const config: Record<string, unknown> = {
    'ngdpbase.audit.provider.file.auditfilename': 'audit.log',
    'ngdpbase.audit.flushinterval': NEVER,
    'ngdpbase.audit.maxqueuesize': 1000,
    ...overrides
  };
  const engine = {
    getManager: (name: string) => (name === 'ConfigurationManager'
      ? {
        getProperty: (k: string, d: unknown) => (k in config ? config[k] : d),
        getResolvedDataPath: () => dir
      }
      : null)
  } as never;
  return new FileAuditProvider(engine);
}

/** What is actually on disk right now, read fresh rather than from memory. */
async function onDisk(): Promise<Record<string, unknown>[]> {
  const file = path.join(dir, 'audit.log');
  if (!(await fs.pathExists(file))) return [];
  const raw = await fs.readFile(file, 'utf8');
  return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
}

const event = (eventType: string) => ({
  eventType,
  user: 'jim',
  action: eventType,
  result: 'success',
  severity: 'low'
});

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-critical-'));
});

afterEach(async () => {
  // Only the temp directory this test created. Never a data directory.
  await fs.remove(dir);
});

describe('#1158 — the critical tier is durable before the action completes', () => {
  test('the registry still declares the events this depends on', () => {
    // Guards the fixtures: if `token.mint` stopped being critical, every
    // assertion below would pass for the wrong reason.
    expect(isCriticalEventType('token.mint')).toBe(true);
    expect(isCriticalEventType('page.delete')).toBe(true);
    expect(isCriticalEventType('page.edit')).toBe(false);
    expect(criticalEventTypes()).toContain('token.mint');
  });

  test('a critical record is readable on disk once the write resolves', async () => {
    const p = makeProvider();
    await p.initialize();

    await p.logAuditEvent(event('token.mint'));

    // No flush() call, no timer — if this passes, writeEvent put it there.
    const records = await onDisk();
    expect(records.map((r) => r.eventType)).toEqual(['token.mint']);

    await p.close();
  });

  test('a standard record is still buffered when the write resolves', async () => {
    // The other half of the guarantee. Making everything synchronous would
    // charge page.view at volume for durability the #1109 decision says it
    // does not need, so this asserts the tier is a real distinction.
    const p = makeProvider();
    await p.initialize();

    await p.logAuditEvent(event('page.edit'));

    expect(await onDisk()).toEqual([]);

    await p.close();
  });

  test('a critical write carries the queued standard records down with it, in chain order', async () => {
    // The reason this goes THROUGH the queue rather than around it. The
    // records are hash-chained, so a critical record written directly while
    // earlier standard records were still queued would land out of sequence
    // and break verification at that point.
    const p = makeProvider();
    await p.initialize();

    await p.logAuditEvent(event('page.edit'));
    await p.logAuditEvent(event('page.rename'));
    expect(await onDisk()).toEqual([]);

    await p.logAuditEvent(event('token.mint'));

    const records = await onDisk();
    expect(records.map((r) => r.eventType)).toEqual(['page.edit', 'page.rename', 'token.mint']);
    expect(records.map((r) => r.seq)).toEqual([1, 2, 3]);
    expect(verifyChain(records as never).ok).toBe(true);

    await p.close();
  });

  test('a critical write does not resolve early because another flush is in flight', async () => {
    // flush() used to `return` when isProcessing was set. A critical caller
    // arriving during the timer's batch was told nothing had gone wrong and
    // resolved with its record still in memory — durability reported, not
    // delivered. The flush chain replaced that guard.
    const p = makeProvider();
    await p.initialize();

    await p.logAuditEvent(event('page.edit'));

    // Start a flush and do NOT await it, so a batch is genuinely in flight.
    const inFlight = p.flush();
    await p.logAuditEvent(event('token.mint'));

    const records = await onDisk();
    expect(records.map((r) => r.eventType)).toContain('token.mint');

    await inFlight;
    await p.close();
  });

  test('a failed write re-queues the batch instead of discarding it', async () => {
    // The catch said `unshift(...this.auditQueue)` — the queue onto itself,
    // after eventsToFlush had been cleared out of it. A failed write silently
    // dropped the batch, and the records the critical tier exists to protect
    // were the ones being lost.
    const p = makeProvider();
    await p.initialize();

    await p.logAuditEvent(event('page.edit'));

    // Make the append fail by replacing the log directory with a file, so the
    // path the provider writes to cannot be created.
    await fs.remove(dir);
    await fs.writeFile(dir, 'not a directory');

    await expect(p.flush()).rejects.toThrow();

    // Restore a writable directory and confirm the record was kept, not lost.
    await fs.remove(dir);
    await fs.ensureDir(dir);
    await p.flush();

    expect((await onDisk()).map((r) => r.eventType)).toEqual(['page.edit']);
  });

  test('a critical write reports its failure rather than resolving', async () => {
    // The caller has to be able to abandon the action. recordAuditEvent turns
    // this rejection into a refusal; swallowing it here is what let a critical
    // event complete unrecorded.
    const p = makeProvider();
    await p.initialize();

    await fs.remove(dir);
    await fs.writeFile(dir, 'not a directory');

    await expect(p.logAuditEvent(event('token.mint') as never)).rejects.toThrow();
  });

  test('the critical write is forced to the device, not just to the page cache', async () => {
    // The ONE assertion here that has to use a spy, and worth saying why: fsync
    // has no observable effect on the filesystem. Every other test in this file
    // passes identically whether the bytes were fsynced or left in the OS page
    // cache — verified by removing the `handle.sync()` call, which kept all of
    // them green. Without this test the durability claim is unguarded, and an
    // unguarded claim is the #1148 defect this issue chain exists to remove.
    const p = makeProvider();
    await p.initialize();

    const opened: Array<{ sync: ReturnType<typeof vi.fn> }> = [];
    const realOpen = fsp.open.bind(fsp);
    const openSpy = vi.spyOn(fsp, 'open').mockImplementation(async (...args: Parameters<typeof fsp.open>) => {
      const handle = await realOpen(...args);
      const sync = vi.fn(() => handle.sync());
      opened.push({ sync });
      return new Proxy(handle, {
        get: (target, prop, receiver) =>
          (prop === 'sync' ? sync : Reflect.get(target, prop, receiver) as unknown)
      });
    });

    try {
      await p.logAuditEvent(event('token.mint'));

      expect(openSpy).toHaveBeenCalled();
      expect(opened).toHaveLength(1);
      expect(opened[0].sync).toHaveBeenCalledTimes(1);
    } finally {
      openSpy.mockRestore();
      await p.close();
    }
  });

  test('a standard write does not pay for an fsync it was not promised', async () => {
    // The cost side of the tier. 0.13 ms/write plain against 8.62 ms with
    // fsync on this repo's storage (see atomicWrite.ts), so making every event
    // synchronous would charge page.view at volume for a guarantee the #1109
    // decision says it does not need.
    const p = makeProvider();
    await p.initialize();

    const openSpy = vi.spyOn(fsp, 'open');
    try {
      await p.logAuditEvent(event('page.edit'));
      await p.flush();
      expect(openSpy).not.toHaveBeenCalled();
    } finally {
      openSpy.mockRestore();
      await p.close();
    }
  });

  test('durability names the tier it covers rather than rounding to a boolean', async () => {
    // D21: state facts, do not score. `fsync: true` would promise durability
    // for the buffered standard events that do not have it; a bare false hides
    // a guarantee the critical path genuinely provides.
    const p = makeProvider();
    await p.initialize();

    const durability = p.getDurability();
    expect(durability).not.toBeNull();
    expect(durability?.fsync).toBe(false);
    expect(durability?.fsyncedClasses).toContain('token.mint');
    expect(durability?.fsyncedClasses).toContain('page.delete');
    expect(durability?.fsyncedClasses).not.toContain('page.edit');
    expect(durability?.bufferedForMs).toBe(NEVER);

    await p.close();
  });

  test('close flushes what is left, so a clean shutdown loses nothing', async () => {
    const p = makeProvider();
    await p.initialize();

    await p.logAuditEvent(event('page.edit'));
    expect(await onDisk()).toEqual([]);

    await p.close();

    expect((await onDisk()).map((r) => r.eventType)).toEqual(['page.edit']);
  });
});
