/**
 * #2041 (identity model step 6): at start-up (FormsDataManager.initialize) the forms add-on converts every
 * stored submission's `submittedBy` username to the submitter's identity
 * `@id`, keeping the name as `submitterName`, under the system context, one
 * write per submission file. `anonymous`, the system principal and values
 * already an `@id` are left alone, so a second start writes nothing. A
 * username with no account is left and reported on the dashboard
 * (getManagerStatus), counts only.
 *
 * Sabotage checks (each turned a test red once): dropping the `urn:` skip
 * (the second start then looks the @id up); returning `{ state: 'ready' }`
 * from getManagerStatus regardless.
 */
import os from 'os';
import path from 'path';
import { promises as fsp } from 'fs';
import FormsDataManager from '../managers/FormsDataManager';
import { buildAddonHost } from '../../../dist/src/utils/addonHost.js';

const IDS: Record<string, string> = { ann: 'urn:uuid:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
let dir: string;
let lookups: string[];

function manager(): FormsDataManager {
  const engine = {
    getManager: (name: string) => (name === 'IdentityManager'
      ? { getByUserIdentifier: async (_ctx: unknown, u: string) => { lookups.push(u); return IDS[u] ? { '@id': IDS[u] } : null; } }
      : null)
  };
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
  lookups = [];
});
afterEach(async () => { await fsp.rm(dir, { recursive: true, force: true }); });

test('known usernames become @ids with the name kept, unknown ones stay and are reported, and a second start writes nothing', async () => {
  const known = await store('a1', 'ann');
  const unknown = await store('a2', 'gone');
  const anon = await store('a3', 'anonymous');
  const sys = await store('a4', 'system');

  const first = manager();
  await first.initialize();
  expect(await read(known)).toMatchObject({ submittedBy: IDS.ann, submitterName: 'ann' });
  expect(await read(unknown)).toMatchObject({ submittedBy: 'gone' });
  expect((await read(anon)).submittedBy).toBe('anonymous');
  expect((await read(sys)).submittedBy).toBe('system');
  expect(first.getManagerStatus()).toMatchObject({ state: 'degraded', kind: 'attention', reason: expect.stringMatching(/^1 form submission\(s\) name a submitter by a username that has no account/) });
  expect(first.getManagerStatus().reason).not.toContain('gone');

  lookups = [];
  const mtime = (await fsp.stat(known)).mtimeMs;
  const second = manager();
  await second.initialize();
  expect(lookups).toEqual(['gone']);
  expect((await fsp.stat(known)).mtimeMs).toBe(mtime);
});

test('with nothing left to convert the add-on is ready', async () => {
  await store('b1', 'ann');
  const m = manager();
  await m.initialize();
  expect(m.getManagerStatus()).toEqual({ state: 'ready' });
});
