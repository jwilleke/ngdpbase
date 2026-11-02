/**
 * #1523: a remembered browser's row names the audit record of its sign-in,
 * so the file provider finds a record by id: in its queue and memory, and in
 * the live log and archives after a restart, when memory holds only the tail.
 */
vi.unmock('../FileAuditProvider');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import FileAuditProvider from '../FileAuditProvider';

let dir: string;

function makeProvider() {
  const config: Record<string, unknown> = {
    'ngdpbase.audit.provider.file.logdirectory': dir,
    'ngdpbase.audit.provider.file.auditfilename': 'audit.log',
    'ngdpbase.audit.provider.file.archivefilename': 'audit-archive.log',
    'ngdpbase.audit.provider.file.maxfilesize': '2KB',
    'ngdpbase.audit.provider.file.maxfiles': 50,
    'ngdpbase.audit.flushinterval': 100000
  };
  const engine = {
    getManager: (name: string) => (name === 'ConfigurationManager'
      ? { getProperty: (k: string, d: unknown) => (k in config ? config[k] : d), getResolvedDataPath: () => dir }
      : null)
  } as never;
  return new FileAuditProvider(engine);
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdp-audit-byid-'));
});

afterEach(async () => {
  // Scoped to this test's own temp dir — never a live data tree.
  await fs.remove(dir);
});

describe('FileAuditProvider.findRecordById (#1523)', () => {
  test('finds a record still in the queue', async () => {
    const p = makeProvider();
    await p.initialize();
    const id = await p.logAuditEvent({ eventType: 'authentication-success', user: 'molly' });
    expect(await p.findRecordById(id)).toMatchObject({ id, user: 'molly' });
    await p.close();
  });

  test('after a restart, finds a record in an archive that memory no longer holds; an unknown id is null', async () => {
    const first = makeProvider();
    await first.initialize();
    const id = await first.logAuditEvent({ eventType: 'authentication-success', user: 'molly', context: { loginMethod: 'password and email link' } });
    await first.flush();
    // Enough later records to rotate the first out of the live log, and out of the 1,000 a restart loads.
    for (let i = 0; i < 1100; i++) await first.logAuditEvent({ eventType: 'page-read', user: `u${i}` });
    await first.flush();
    await first.close();
    expect((await fs.readdir(dir)).some((f) => f.startsWith('audit-archive.log'))).toBe(true);
    const live = path.join(dir, 'audit.log');
    // Straight after a rotation the live log does not exist until the next write.
    if (await fs.pathExists(live)) expect(await fs.readFile(live, 'utf8')).not.toContain(id);

    const again = makeProvider();
    await again.initialize();
    expect((await again.searchAuditLogs({ user: 'molly' })).total).toBe(0); // not in memory
    expect(await again.findRecordById(id)).toMatchObject({ id, user: 'molly', context: { loginMethod: 'password and email link' } });
    expect(await again.findRecordById('no-such-id')).toBeNull();
    await again.close();
  });
});
