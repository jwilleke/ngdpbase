/**
 * #2041 (identity model step 6): at start-up (FormsDataManager.initialize) the
 * forms add-on converts every stored submission's `submittedBy` username to
 * the submitter's identity `@id`, or to `orphan:<name>` when the name has no
 * account, keeping the name as `submitterName`, under the system context,
 * one write per submission file. `anonymous`, the system principal, `@id`s
 * and orphans are left alone, so a second start writes nothing. Orphans are
 * reported on the dashboard (getManagerStatus), counts only. With the
 * identity store down the pass is postponed and said so.
 *
 * Sabotage checks (each turned a test red once): leaving the name in place
 * instead of `orphan:<name>` (the second start then looks it up again, and a
 * new account would take it); returning `{ state: 'ready' }` from
 * getManagerStatus regardless; rethrowing in the conversion's catch (a lookup
 * that fails mid-pass then stops the add-on starting).
 */
import os from 'os';
import path from 'path';
import { promises as fsp } from 'fs';
import FormsDataManager from '../managers/FormsDataManager';
import { buildAddonHost } from '../../../dist/src/utils/addonHost.js';
import { fakeIdentityManager } from '../../../dist/src/test-support/identities.js';

const IDS: Record<string, string> = { ann: 'urn:uuid:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
let dir: string;

function manager(identities: unknown): FormsDataManager {
  const engine = { getManager: (name: string) => (name === 'IdentityManager' ? identities : null) };
  return new FormsDataManager(engine, dir, buildAddonHost('forms', {}));
}

async function store(id: string, submittedBy: string): Promise<string> {
  const folder = path.join(dir, 'submissions', 'f1');
  await fsp.mkdir(folder, { recursive: true });
  const file = path.join(folder, `${id}.json`);
  await fsp.writeFile(file, JSON.stringify({ id, formId: 'f1', submittedAt: '2026-10-01T00:00:00Z', submittedBy, data: {}, status: 'pending' }));
  return file;
}

const read = async (f: string) => JSON.parse(await fsp.readFile(f, 'utf8')) as { submittedBy: string; submitterName?: string };

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'forms-2041-'));
});
afterEach(async () => { await fsp.rm(dir, { recursive: true, force: true }); });

test('known usernames become @ids and unknown ones orphans, the name kept; reported; a second start writes nothing', async () => {
  const known = await store('a1', 'ann');
  const unknown = await store('a2', 'gone');
  const anon = await store('a3', 'anonymous');
  const sys = await store('a4', 'system');

  const first = manager(fakeIdentityManager(IDS));
  await first.initialize();
  expect(await read(known)).toMatchObject({ submittedBy: IDS.ann, submitterName: 'ann' });
  expect(await read(unknown)).toMatchObject({ submittedBy: 'orphan:gone', submitterName: 'gone' });
  expect((await read(anon)).submittedBy).toBe('anonymous');
  expect((await read(sys)).submittedBy).toBe('system');
  expect(first.getManagerStatus()).toMatchObject({ state: 'degraded', kind: 'attention', reason: expect.stringMatching(/^1 form submission\(s\) are orphaned/) });
  expect(first.getManagerStatus().reason).not.toContain('gone');

  const identities = fakeIdentityManager(IDS);
  const mtime = (await fsp.stat(known)).mtimeMs;
  const second = manager(identities);
  await second.initialize();
  expect(identities.lookups).toEqual([]);
  expect((await fsp.stat(known)).mtimeMs).toBe(mtime);
});

test('with nothing left to convert or orphaned the add-on is ready', async () => {
  await store('b1', 'ann');
  const m = manager(fakeIdentityManager(IDS));
  await m.initialize();
  expect(m.getManagerStatus()).toEqual({ state: 'ready' });
});

test.each([{ down: true }, { failLookups: true }])('the identity store down (%o): nothing is converted, the pass is postponed and said so', async (opts) => {
  const file = await store('c1', 'ann');
  const m = manager(fakeIdentityManager(IDS, opts));
  await m.initialize();
  expect((await read(file)).submittedBy).toBe('ann');
  expect(m.getManagerStatus()).toMatchObject({ state: 'degraded', reason: expect.stringContaining('identity store unavailable, conversion postponed') });
});

test('delete bob, convert, create a new bob, restart: the new bob is not the submitter of old bob\'s submissions', async () => {
  const file = await store('d1', 'bob');
  const accounts: Record<string, string> = { ...IDS };
  await manager(fakeIdentityManager(accounts)).initialize();
  accounts.bob = 'urn:uuid:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  await manager(fakeIdentityManager(accounts)).initialize();
  expect((await read(file)).submittedBy).toBe('orphan:bob');
});
