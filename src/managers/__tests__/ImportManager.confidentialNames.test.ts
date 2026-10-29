/**
 * A confidential import's file names stay out of application logs and
 * notices (#2110). Confidential means the destination is encrypted: a
 * receiver that keeps into a sealed store (`keepsEncrypted`). The uploader
 * still sees the names on their own status; the audit log keeps them (not
 * tested here, and not changed). Every other import logs names as before.
 *
 * The guard: one distinctive file name is driven through every way a
 * confidential run can end (imported, kept at upload, a receiver throwing
 * with the name in its message, an archive that cannot be read, a run-level
 * failure whose error names the file) and every logger and notification call
 * is searched for it. A control run into an ordinary receiver proves the
 * search would find a name that was logged.
 */
import ImportManager from '../ImportManager';
import BackgroundJobManager from '../BackgroundJobManager';
import { MemoryIceLedger } from '../../ice/ledger';
import logger from '../../utils/logger';
import type { ActorContext } from '../../context/ActorContext';
import type { IceItem, IceLedger, IceReceiver, IceUpload } from '../../ice/types';

const SECRET = 'oncology-referral-Smith';
const MOLLY = { username: 'molly', roles: ['editor'], isAuthenticated: true } as unknown as ActorContext;

const LEVELS = ['info', 'warn', 'error', 'debug'] as const;
type MockFn = { mock: { calls: unknown[][] }; mockClear(): void };

/** Everything written to the logger or the notices, as text: messages, objects, and errors' messages and stacks. */
function written(notices: MockFn): string {
  const calls = [...LEVELS.flatMap(l => (logger[l] as unknown as MockFn).mock.calls), ...notices.mock.calls];
  return calls.map(args => args.map(a => (a instanceof Error ? `${a.message} ${a.stack ?? ''}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')).join('\n');
}

/** A ledger that fails the run (not one file) with an error naming the file. */
class FailingLedger extends MemoryIceLedger implements IceLedger {
  override async lastFile(): Promise<never> {
    throw new Error(`ledger could not read ${SECRET}.xml`);
  }
}

async function make() {
  const notices = vi.fn();
  const managers: Record<string, unknown> = {
    ConfigurationManager: { getProperty: (_k: string, f: unknown) => f, getResolvedDataPath: (_k: string, f: string) => f },
    PolicyDecisionPoint: { permits: async () => true },
    NotificationManager: { createNotification: notices, addNotification: notices, notify: notices }
  };
  const engine = { getManager: (name: string) => managers[name] ?? null };
  const jobs = new BackgroundJobManager(engine);
  managers['BackgroundJobManager'] = jobs;
  const im = new ImportManager(engine);
  await im.initialize();
  im.setImportLedger(new MemoryIceLedger());
  // The vault receiver: the destination is encrypted.
  const door = (encrypted: boolean): IceReceiver => ({
    name: encrypted ? 'records' : 'plain', accepts: ['file'],
    ...(encrypted ? { keepsEncrypted: true } : {}),
    mayUse: async () => true,
    receive: async (item: IceItem) => {
      if (item.name.includes('throws')) throw new Error(`could not store ${item.name}`);
      return { status: 'stored', ref: `rec-${item.name}` };
    },
    keepOriginal: async (item: IceItem) => ({ status: 'stored', ref: `orig-${item.name}` })
  });
  im.registerReceiver('vaultrec', door(true));
  im.registerReceiver('plainrec', door(false));
  for (const l of LEVELS) logger[l].mockClear();
  return { im, jobs, notices: notices as unknown as MockFn };
}

const files = (): IceUpload[] => [
  { name: `${SECRET}.xml`, bytes: Buffer.from('<a>1</a>') },
  { name: `${SECRET}-throws.xml`, bytes: Buffer.from('<a>2</a>') },
  { name: `${SECRET}.zip`, bytes: Buffer.from('not a zip') }
];

describe('a confidential import keeps file names out of logs and notices (#2110)', () => {
  test('only an encrypted destination is confidential', async () => {
    const { im } = await make();
    expect(im.isConfidential('vaultrec.records')).toBe(true);
    expect(im.isConfidential('plainrec.plain')).toBe(false);
    expect(im.isConfidential('core.files')).toBe(false);
    expect(im.isConfidential('core.pages')).toBe(false);
    expect(im.isConfidential('nobody.here')).toBe(false);
  });

  test('every way a run can end, run, queued and kept at upload, logs and notifies no file name', async () => {
    const { im, jobs, notices } = await make();
    const run = await im.runImport({ source: { type: 'upload', files: files() }, receiver: 'vaultrec.records', original: 'keep' }, MOLLY);
    // The uploader still sees every name on their own status.
    expect(run.files.map(f => f.name)).toEqual([`${SECRET}.zip`, `${SECRET}.xml`, `${SECRET}-throws.xml`]);
    expect(run.files.map(f => f.status)).toEqual(['failed', 'imported', 'failed']);

    const queued = await im.enqueueUpload({ source: { type: 'upload', files: [{ name: `${SECRET}-2.xml`, bytes: Buffer.from('<b/>') }] }, receiver: 'vaultrec.records', original: 'keep' }, MOLLY);
    await jobs.whenIdle();
    await vi.waitFor(() => expect(im.getImportRun(queued, MOLLY)?.state).toBe('done'));

    im.setImportLedger(new FailingLedger());
    const failed = await im.runImport({ source: { type: 'upload', files: files() }, receiver: 'vaultrec.records' }, MOLLY);
    expect(failed.state).toBe('failed');
    expect(failed.error).toContain(SECRET);

    expect(written(notices)).not.toContain(SECRET);
  });

  test('control: an ordinary import still logs the file name, so the search above would find one', async () => {
    const { im, notices } = await make();
    im.setImportLedger(new FailingLedger());
    const failed = await im.runImport({ source: { type: 'upload', files: files() }, receiver: 'plainrec.plain' }, MOLLY);
    expect(failed.state).toBe('failed');
    expect(written(notices)).toContain(SECRET);
  });
});
