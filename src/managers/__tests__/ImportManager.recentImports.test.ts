/**
 * "Your recent imports" read from the engine's ledger (#2110).
 *
 * - newest first, merged across the receivers the user may use;
 * - only the user's own entries, never another user's, and none from a
 *   receiver they may no longer use;
 * - how many is `ngdpbase.import.engine.recent-imports`;
 * - each links to what it created only when the receiver says this user
 *   may open it (`linkFor`), and only to a path on this site;
 * - the list survives a restart: a new ImportManager over the same ledger
 *   directory shows it.
 */
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import ImportManager from '../ImportManager';
import { MemoryIceLedger } from '../../ice/ledger';
import type { ActorContext } from '../../context/ActorContext';
import type { IceReceiver } from '../../ice/types';

const MOLLY = { username: 'molly', roles: ['editor'], isAuthenticated: true } as unknown as ActorContext;
const BOB = { username: 'bob', roles: ['editor'], isAuthenticated: true } as unknown as ActorContext;
const GRANTS: Record<string, string[]> = { molly: ['page-create', 'asset-upload'], bob: ['page-create'] };

function makeEngine(config: Record<string, unknown> = {}, readable: Set<string> = new Set()) {
  const existing = new Set<string>();
  let uploads = 0;
  const managers: Record<string, unknown> = {
    ConfigurationManager: {
      getProperty: (key: string, fallback: unknown) => (key in config ? config[key] : fallback),
      getResolvedDataPath: (key: string, fallback: string) => (key in config ? config[key] : fallback)
    },
    PolicyDecisionPoint: {
      permits: async (subject: { username: string }, permission: string) => (GRANTS[subject.username] ?? []).includes(permission)
    },
    PageManager: {
      getPageMetadata: async (title: string) => (existing.has(title) ? { uuid: 'u', title } : null),
      normalizePageContent: (content: string) => ({ content, changes: [] }),
      completeNcmConversion: async (content: string) => ({ content, warnings: [] }),
      savePage: async (name: string, content: string, metadata: Record<string, unknown>) => {
        existing.add(name);
        return { content, name, uuid: String(metadata.uuid), previousName: null };
      },
      refreshPageList: async () => undefined,
      mayShowPage: async (name: string, ctx: ActorContext) => readable.has(`${ctx.username}:${name}`)
    },
    AttachmentManager: {
      uploadAttachment: async () => ({ identifier: `att-${++uploads}` })
    }
  };
  return { getManager: (name: string) => managers[name] ?? null };
}

const md = (name: string, text = '# x') => ({ type: 'upload' as const, files: [{ name, bytes: Buffer.from(`${text}\n${name}`) }] });

describe('ImportManager.recentImportsFor (#2110)', () => {
  let clock = Date.parse('2026-10-29T10:00:00.000Z');
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    clock = Date.parse('2026-10-29T10:00:00.000Z');
  });
  afterEach(() => vi.useRealTimers());
  /** Each import a minute after the last, so newest-first is certain. */
  const tick = () => vi.setSystemTime((clock += 60_000));

  async function make(config: Record<string, unknown> = {}, readable?: Set<string>) {
    const im = new ImportManager(makeEngine(config, readable));
    await im.initialize();
    return im;
  }

  test('newest first, across the receivers the user may use, with each file\'s result and receiver', async () => {
    const im = await make();
    im.setImportLedger(new MemoryIceLedger());
    tick(); await im.runImport({ source: md('First.md'), receiver: 'core.pages' }, MOLLY);
    tick(); await im.runImport({ source: { type: 'upload', files: [{ name: 'photo.png', bytes: Buffer.from('PNG') }] }, receiver: 'core.files' }, MOLLY);

    const recent = await im.recentImportsFor(MOLLY);
    expect(recent.map(r => [r.name, r.status, r.receiver, r.receiverLabel])).toEqual([
      ['photo.png', 'imported', 'core.files', 'Files'],
      ['First.md', 'imported', 'core.pages', 'Pages']
    ]);
    expect(recent[1]).toMatchObject({ refs: 1, at: '2026-10-29T10:01:00.000Z' });
  });

  test('a file given a name shows that name, with its own beside it (#2130)', async () => {
    const im = await make();
    im.setImportLedger(new MemoryIceLedger());
    tick(); await im.runImport({ source: { type: 'upload', files: [{ name: 'export_20261029.md', bytes: Buffer.from('# x'), givenName: 'Bank October' }] }, receiver: 'core.pages' }, MOLLY);
    tick(); await im.runImport({ source: md('Kept.md'), receiver: 'core.pages' }, MOLLY);
    const recent = await im.recentImportsFor(MOLLY);
    expect(recent.map(r => [r.givenName, r.name])).toEqual([[undefined, 'Kept.md'], ['Bank October', 'export_20261029.md']]);
  });

  test('only the user\'s own entries, and none from a receiver they may not use', async () => {
    const im = await make();
    im.setImportLedger(new MemoryIceLedger());
    tick(); await im.runImport({ source: md('Mollys.md'), receiver: 'core.pages' }, MOLLY);
    tick(); await im.runImport({ source: md('Bobs.md'), receiver: 'core.pages' }, BOB);
    tick(); await im.runImport({ source: { type: 'upload', files: [{ name: 'mine.png', bytes: Buffer.from('PNG') }] }, receiver: 'core.files' }, MOLLY);

    expect((await im.recentImportsFor(MOLLY)).map(r => r.name)).toEqual(['mine.png', 'Mollys.md']);
    expect((await im.recentImportsFor(BOB)).map(r => r.name)).toEqual(['Bobs.md']);

    // Molly loses asset-upload: her files entries are no longer listed.
    GRANTS['molly'] = ['page-create'];
    try {
      expect((await im.recentImportsFor(MOLLY)).map(r => r.name)).toEqual(['Mollys.md']);
    } finally {
      GRANTS['molly'] = ['page-create', 'asset-upload'];
    }
    expect(await im.recentImportsFor({ username: '' } as ActorContext)).toEqual([]);
  });

  test('how many is ngdpbase.import.engine.recent-imports', async () => {
    const im = await make({ 'ngdpbase.import.engine.recent-imports': 2 });
    im.setImportLedger(new MemoryIceLedger());
    for (const name of ['A.md', 'B.md', 'C.md']) {
      tick(); await im.runImport({ source: md(name), receiver: 'core.pages' }, MOLLY);
    }
    expect((await im.recentImportsFor(MOLLY)).map(r => r.name)).toEqual(['C.md', 'B.md']);
  });

  test('a link only where the receiver says the user may open it', async () => {
    const im = await make({}, new Set(['molly:Open Me']));
    im.setImportLedger(new MemoryIceLedger());
    tick(); await im.runImport({ source: md('Open Me.md'), receiver: 'core.pages' }, MOLLY);
    tick(); await im.runImport({ source: md('Closed.md'), receiver: 'core.pages' }, MOLLY);
    const recent = await im.recentImportsFor(MOLLY);
    expect(recent.find(r => r.name === 'Open Me.md')?.link).toBe('/view/Open%20Me');
    expect(recent.find(r => r.name === 'Closed.md')?.link).toBeUndefined();
    // core.files has no linkFor: nothing is linked.
    tick(); await im.runImport({ source: { type: 'upload', files: [{ name: 'p.png', bytes: Buffer.from('PNG') }] }, receiver: 'core.files' }, MOLLY);
    expect((await im.recentImportsFor(MOLLY))[0].link).toBeUndefined();
  });

  test('a receiver\'s link is used only when it is a path on this site', async () => {
    const im = await make();
    im.setImportLedger(new MemoryIceLedger());
    const links = ['javascript:alert(1)', '//evil.example/x', '/\\evil.example', '/records/1'];
    const receiver: IceReceiver = {
      name: 'records', accepts: ['file'],
      mayUse: async () => true,
      receive: async (item) => ({ status: 'stored', ref: item.name }),
      linkFor: async (ref) => links[Number(ref.slice(0, 1))] ?? null
    };
    im.registerReceiver('acct', receiver);
    for (const n of [0, 1, 2, 3]) {
      tick(); await im.runImport({ source: { type: 'upload', files: [{ name: `${n}.bin`, bytes: Buffer.from(`b${n}`) }] }, receiver: 'acct.records' }, MOLLY);
    }
    const byName = Object.fromEntries((await im.recentImportsFor(MOLLY)).map(r => [r.name, r.link]));
    expect(byName).toEqual({ '0.bin': undefined, '1.bin': undefined, '2.bin': undefined, '3.bin': '/records/1' });
  });

  test('the list survives a restart: a new engine over the same ledger directory shows it', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ice2110-recent-'));
    try {
      const config = { 'ngdpbase.import.engine.ledger-dir': dir };
      const before = await make(config);
      tick(); await before.runImport({ source: md('Kept.md'), receiver: 'core.pages' }, MOLLY);
      expect(before.importRunsFor(MOLLY)).toHaveLength(1);

      const after = await make(config);
      expect(after.importRunsFor(MOLLY)).toEqual([]);
      expect((await after.recentImportsFor(MOLLY)).map(r => [r.name, r.status])).toEqual([['Kept.md', 'imported']]);
      expect(await after.recentImportsFor(BOB)).toEqual([]);
    } finally {
      await fs.remove(dir);
    }
  });
});
