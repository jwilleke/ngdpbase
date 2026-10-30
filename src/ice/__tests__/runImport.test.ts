/**
 * Each rule of one ICE run (#1979), against stand-in shims and receivers:
 * fingerprint skip, unzip, the noise filter, per-file status, chaining, the
 * receiver's door called with the run's context, a refusal by the receiver,
 * the three original choices (D11), and per-item duplicates.
 */
import { packZip } from '../../utils/zipArchive';
import { MemoryIceLedger } from '../ledger';
import { boundScope, keepOriginalsAtUpload, runImport, type IceEngineSettings, type IceRunDeps } from '../runImport';
import type {
  FileDoneInfo, IceItem, IceRunReport, IceRunRequest, ReceiveInfo, ReceiveOutcome, RegisteredReceiver, RegisteredShim, ShimTools
} from '../types';
import type { GuardedResponse } from '../../http/guardedFetch';
import type { ActorContext } from '../../context/ActorContext';

const ALICE: ActorContext = { username: 'alice', roles: ['reader'], isAuthenticated: true } as ActorContext;

const SETTINGS: IceEngineSettings = {
  noise: ['__MACOSX/', '.DS_Store', '._*'],
  zip: { maxEntries: 100, maxTotalBytes: 1_000_000 },
  maxZipDepth: 3,
  maxFileBytes: 1_000_000,
  maxChainDepth: 5,
  defaultOriginal: 'none',
  fetchMaxBytes: 1_000_000,
  maxNameLength: 200
};

type Received = { item: IceItem; ctx: ActorContext; info: ReceiveInfo };

/** A receiver that records what its door was handed, and refuses whom it is told to. */
function recordingReceiver(id: string, accepts: string[], opts: { refuse?: (ctx: ActorContext) => boolean; keeps?: boolean; says?: (n: number) => string | undefined } = {}) {
  const received: Received[] = [];
  const kept: Array<{ item: IceItem; ctx: ActorContext }> = [];
  let n = 0;
  const [owner, name] = id.split('.');
  const receiver: RegisteredReceiver = {
    id, owner, name, accepts,
    mayUse: async (ctx) => !opts.refuse?.(ctx),
    receive: async (item, ctx, info): Promise<ReceiveOutcome> => {
      if (opts.refuse?.(ctx)) return { status: 'refused', message: `${ctx.username} may not` };
      received.push({ item, ctx, info });
      n++;
      const message = opts.says?.(n);
      return { status: 'stored', ref: `${name}-${n}`, ...(message ? { message } : {}) };
    },
    ...(opts.keeps ? {
      keepOriginal: async (item: IceItem, ctx: ActorContext): Promise<ReceiveOutcome> => {
        kept.push({ item, ctx });
        return { status: 'stored', ref: `original-${kept.length}` };
      }
    } : {})
  };
  return { receiver, received, kept };
}

/** A shim reading `.rec` lines, `key=value`, into one `test.record` item per line. */
function recordShim(overrides: Partial<RegisteredShim> = {}): RegisteredShim {
  return {
    id: 'test.rec', owner: 'test', name: 'rec', direction: 'in',
    accepts: { extensions: ['.rec'], canRead: (input) => (input.text ?? '').includes('=') },
    produces: 'test.record',
    receivers: ['test.records'],
    read: async (input) => ({
      items: (input.text ?? '').split('\n').filter(Boolean).map(line => {
        const [key, value] = line.split('=');
        return { kind: 'test.record', name: input.name, data: { key, value }, itemKey: key };
      })
    }),
    ...overrides
  };
}

function deps(shims: RegisteredShim[], receivers: RegisteredReceiver[], ledger = new MemoryIceLedger(), settings: Partial<IceEngineSettings> = {}): IceRunDeps {
  return {
    shims,
    receivers: new Map(receivers.map(r => [r.id, r])),
    ledger,
    settings: { ...SETTINGS, ...settings },
    tools: () => ({ options: {}, fetch: async () => { throw new Error('no network in this test'); } }),
    now: () => new Date('2026-10-22T12:00:00Z')
  };
}

function report(request: IceRunRequest, ctx: ActorContext = ALICE): IceRunReport {
  return { runId: 'run-1', receiver: request.receiver, scope: request.scope ?? `${request.receiver}/${ctx.username}`, username: ctx.username, state: 'queued', files: [] };
}

async function run(d: IceRunDeps, request: IceRunRequest, ctx: ActorContext = ALICE): Promise<IceRunReport> {
  return runImport(d, request, ctx, report(request, ctx));
}

const upload = (name: string, text: string) => ({ name, bytes: Buffer.from(text) });

describe('runImport', () => {
  test('hands each item to the receiver door with the run\'s context, and reports the file imported', async () => {
    const { receiver, received } = recordingReceiver('test.records', ['test.record']);
    const result = await run(deps([recordShim()], [receiver]), { source: { type: 'upload', files: [upload('a.rec', 'bp=120\nhr=60')] }, receiver: 'test.records' });

    expect(result.state).toBe('done');
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatchObject({ name: 'a.rec', status: 'imported', stored: 2, chain: ['test.rec'], refs: ['records-1', 'records-2'] });
    expect(received.map(r => r.item.data)).toEqual([{ key: 'bp', value: '120' }, { key: 'hr', value: '60' }]);
    expect(received.every(r => r.ctx === ALICE)).toBe(true);
    expect(received[0].info).toMatchObject({ runId: 'run-1', chain: ['test.rec'], source: { name: 'a.rec', sha256: expect.stringMatching(/^[0-9a-f]{64}$/) } });
  });

  test('an unchanged file is skipped by its fingerprint; a changed one is imported again', async () => {
    const { receiver, received } = recordingReceiver('test.records', ['test.record']);
    const d = deps([recordShim({ duplicates: 'file' })], [receiver]);
    const req = (text: string): IceRunRequest => ({ source: { type: 'upload', files: [upload('a.rec', text)] }, receiver: 'test.records' });

    await run(d, req('bp=120'));
    const again = await run(d, req('bp=120'));
    expect(again.files[0]).toMatchObject({ status: 'unchanged', refs: ['records-1'] });
    expect(received).toHaveLength(1);

    const changed = await run(d, req('bp=130'));
    expect(changed.files[0].status).toBe('imported');
    expect(received).toHaveLength(2);
  });

  test('fingerprints are per scope: another person importing the same file imports it', async () => {
    const { receiver, received } = recordingReceiver('test.records', ['test.record']);
    const d = deps([recordShim()], [receiver]);
    const req: IceRunRequest = { source: { type: 'upload', files: [upload('a.rec', 'bp=120')] }, receiver: 'test.records' };
    await run(d, req);
    const bob = { username: 'bob', roles: [], isAuthenticated: true } as unknown as ActorContext;
    expect((await run(d, req, bob)).files[0].status).toBe('imported');
    expect(received.map(r => r.ctx.username)).toEqual(['alice', 'bob']);
  });

  test('a file whose last import failed or was refused is tried again', async () => {
    let refuse = true;
    const { receiver } = recordingReceiver('test.records', ['test.record'], { refuse: () => refuse });
    const d = deps([recordShim()], [receiver]);
    const req: IceRunRequest = { source: { type: 'upload', files: [upload('a.rec', 'bp=120')] }, receiver: 'test.records' };
    expect((await run(d, req)).files[0].status).toBe('refused');
    refuse = false;
    expect((await run(d, req)).files[0].status).toBe('imported');
  });

  test('unzips, drops noise, and reports every file', async () => {
    const zip = await packZip([
      { path: 'records/a.rec', bytes: Buffer.from('bp=120') },
      { path: 'records/.DS_Store', bytes: Buffer.from('x') },
      { path: 'records/._a.rec', bytes: Buffer.from('bp=999') },
      { path: 'notes.txt', bytes: Buffer.from('just words') }
    ]);
    const { receiver, received } = recordingReceiver('test.records', ['test.record']);
    const result = await run(deps([recordShim()], [receiver]), {
      source: { type: 'upload', files: [{ name: 'export.zip', bytes: zip }, upload('__MACOSX/x.rec', 'bp=1')] },
      receiver: 'test.records'
    });
    const status = Object.fromEntries(result.files.map(f => [f.name, f.status]));
    // The zip reader already leaves out `.DS_Store` and `__MACOSX/` members;
    // the noise filter catches the rest, and noise outside an archive.
    expect(status).toEqual({
      'export.zip/records/a.rec': 'imported',
      'export.zip/records/._a.rec': 'noise',
      'export.zip/notes.txt': 'unreadable',
      '__MACOSX/x.rec': 'noise'
    });
    expect(received.map(r => r.item.data)).toEqual([{ key: 'bp', value: '120' }]);
  });

  test('noise is not recorded in the ledger; an unreadable file is', async () => {
    const ledger = new MemoryIceLedger();
    const { receiver } = recordingReceiver('test.records', ['test.record']);
    await run(deps([recordShim()], [receiver], ledger), {
      source: { type: 'upload', files: [upload('.DS_Store', 'x'), upload('notes.txt', 'words')] }, receiver: 'test.records'
    });
    expect((await ledger.files('test.records/alice')).map(f => [f.name, f.status])).toEqual([['notes.txt', 'unreadable']]);
  });

  test('a file larger than allowed fails without being read', async () => {
    const read = vi.fn();
    const { receiver } = recordingReceiver('test.records', ['test.record']);
    const result = await run(deps([recordShim({ read })], [receiver], undefined, { maxFileBytes: 4 }), {
      source: { type: 'upload', files: [upload('a.rec', 'bp=120')] }, receiver: 'test.records'
    });
    expect(result.files[0]).toMatchObject({ status: 'failed', message: expect.stringMatching(/larger than the 4 bytes/) });
    expect(read).not.toHaveBeenCalled();
  });

  test('a shim\'s "can I read this?" decides, even when the extension matches', async () => {
    const { receiver } = recordingReceiver('test.records', ['test.record']);
    const result = await run(deps([recordShim()], [receiver]), {
      source: { type: 'upload', files: [upload('a.rec', 'no equals sign here')] }, receiver: 'test.records'
    });
    expect(result.files[0]).toMatchObject({ status: 'unreadable', message: expect.stringMatching(/no shim reads this file/) });
  });

  test('a file with no matching extension is claimed by content', async () => {
    const { receiver } = recordingReceiver('test.records', ['test.record']);
    const result = await run(deps([recordShim()], [receiver]), {
      source: { type: 'upload', files: [upload('export.dat', 'bp=120')] }, receiver: 'test.records'
    });
    expect(result.files[0].status).toBe('imported');
  });

  test('shims chain until an item is of a kind the receiver takes (D9), carrying metadata and warnings', async () => {
    const outer: RegisteredShim = {
      id: 'test.wrap', owner: 'test', name: 'wrap', direction: 'in',
      accepts: { extensions: ['.wrap'] }, produces: 'test.inner', receivers: [],
      read: async (input) => ({
        items: [{ kind: 'test.inner', name: input.name, text: (input.text ?? '').replace(/^WRAP:/, ''), metadata: { source: 'wrap', title: 'from wrap' }, warnings: [{ kind: 'wrap-note', detail: 'unwrapped' }] }]
      })
    };
    const inner: RegisteredShim = recordShim({
      id: 'test.inner-rec', name: 'inner-rec', accepts: { kinds: ['test.inner'] },
      read: async (input) => ({ items: [{ kind: 'test.record', name: input.name, data: input.text, metadata: { title: 'from inner' } }] })
    });
    const { receiver, received } = recordingReceiver('test.records', ['test.record']);
    const result = await run(deps([outer, inner], [receiver]), {
      source: { type: 'upload', files: [upload('a.wrap', 'WRAP:bp=120')] }, receiver: 'test.records'
    });
    expect(result.files[0]).toMatchObject({ status: 'imported', chain: ['test.wrap', 'test.inner-rec'] });
    expect(received[0].item).toMatchObject({ data: 'bp=120', metadata: { source: 'wrap', title: 'from inner' }, warnings: [{ kind: 'wrap-note', detail: 'unwrapped' }] });
    expect(received[0].info.chain).toEqual(['test.wrap', 'test.inner-rec']);
  });

  test('a chain longer than allowed fails the file', async () => {
    const loop: RegisteredShim = {
      id: 'test.loop', owner: 'test', name: 'loop', direction: 'in',
      accepts: { extensions: ['.loop'], kinds: ['test.loop'] }, produces: 'test.loop', receivers: [],
      read: async (input) => ({ items: [{ kind: 'test.loop', name: input.name, text: input.text }] })
    };
    const terminal = recordShim({ id: 'test.end', name: 'end', accepts: { kinds: ['test.loop'] } });
    const { receiver } = recordingReceiver('test.records', ['test.record']);
    const result = await run(deps([loop, terminal], [receiver], undefined, { maxChainDepth: 2 }), {
      source: { type: 'upload', files: [upload('a.loop', 'x')] }, receiver: 'test.records'
    });
    // `loop` is found first for test.loop, so the chain keeps looping until the limit.
    expect(result.files[0]).toMatchObject({ status: 'failed', message: expect.stringMatching(/longer than 2 shims/) });
  });

  test('a shim hands only to receivers it declares (D7)', async () => {
    const { receiver } = recordingReceiver('test.records', ['test.record']);
    const result = await run(deps([recordShim({ receivers: ['other.receiver'] })], [receiver]), {
      source: { type: 'upload', files: [upload('a.rec', 'bp=120')] }, receiver: 'test.records'
    });
    expect(result.files[0].status).toBe('unreadable');
  });

  test('a pinned shim is used, or the file is unreadable', async () => {
    const { receiver } = recordingReceiver('test.records', ['test.record']);
    const d = deps([recordShim()], [receiver]);
    expect((await run(d, { source: { type: 'upload', files: [upload('x.dat', 'bp=1')] }, receiver: 'test.records', shim: 'test.rec' })).files[0].status).toBe('imported');
    expect((await run(d, { source: { type: 'upload', files: [upload('y.dat', 'bp=1')] }, receiver: 'test.records', shim: 'test.nope' })).files[0])
      .toMatchObject({ status: 'unreadable', message: expect.stringMatching(/test.nope is not available/) });
  });

  test('the receiver refusing (its own permission, D5) marks the file refused and stores nothing', async () => {
    const { receiver, received } = recordingReceiver('test.records', ['test.record'], { refuse: (ctx) => ctx.username === 'alice' });
    // Its pre-check let the run through; its door still says no for the item.
    receiver.mayUse = async () => true;
    const result = await run(deps([recordShim()], [receiver]), {
      source: { type: 'upload', files: [upload('a.rec', 'bp=120')] }, receiver: 'test.records'
    });
    expect(result.files[0]).toMatchObject({ status: 'refused', stored: 0, message: 'alice may not' });
    expect(received).toEqual([]);
  });

  test('a shim\'s partial note makes the file partial', async () => {
    const { receiver } = recordingReceiver('test.records', ['test.record']);
    const shim = recordShim({ read: async (input) => ({ items: [{ kind: 'test.record', name: input.name, data: 1 }], partial: '2 sections not read' }) });
    const result = await run(deps([shim], [receiver]), { source: { type: 'upload', files: [upload('a.rec', 'bp=1')] }, receiver: 'test.records' });
    expect(result.files[0]).toMatchObject({ status: 'partial', stored: 1, message: '2 sections not read' });
  });

  test('the receiver\'s own message on a stored item reaches the file\'s status', async () => {
    const { receiver } = recordingReceiver('test.records', ['test.record'], { says: () => '12 new, 0 updated, 0 unchanged' });
    const result = await run(deps([recordShim()], [receiver]), { source: { type: 'upload', files: [upload('a.rec', 'bp=1')] }, receiver: 'test.records' });
    expect(result.files[0]).toMatchObject({ status: 'imported', stored: 1, message: '12 new, 0 updated, 0 unchanged' });
  });

  test('several items\' messages stay short: the same message once, different ones as the first and a count', async () => {
    const same = recordingReceiver('test.records', ['test.record'], { says: () => 'saved' });
    const once = await run(deps([recordShim()], [same.receiver]), { source: { type: 'upload', files: [upload('a.rec', 'bp=1\nhr=2\nrr=3')] }, receiver: 'test.records' });
    expect(once.files[0]).toMatchObject({ status: 'imported', stored: 3, message: 'saved' });

    const differ = recordingReceiver('test.records', ['test.record'], { says: (n) => (n === 2 ? undefined : `item ${n} saved`) });
    const counted = await run(deps([recordShim()], [differ.receiver]), { source: { type: 'upload', files: [upload('a.rec', 'bp=1\nhr=2\nrr=3')] }, receiver: 'test.records' });
    expect(counted.files[0]).toMatchObject({ status: 'imported', stored: 3, message: 'item 1 saved (+1 more)' });
  });

  test('a receiver message and a partial note both reach a partial file; a refusal still names itself', async () => {
    const { receiver } = recordingReceiver('test.records', ['test.record'], { says: () => '1 new' });
    const shim = recordShim({ read: async (input) => ({ items: [{ kind: 'test.record', name: input.name, data: 1 }], partial: '2 sections not read' }) });
    const result = await run(deps([shim], [receiver]), { source: { type: 'upload', files: [upload('a.rec', 'bp=1')] }, receiver: 'test.records' });
    expect(result.files[0]).toMatchObject({ status: 'partial', stored: 1, message: '1 new; 2 sections not read' });

    let calls = 0;
    const mixed: RegisteredReceiver = {
      id: 'test.records', owner: 'test', name: 'records', accepts: ['test.record'], mayUse: async () => true,
      receive: async (): Promise<ReceiveOutcome> => (++calls === 1 ? { status: 'stored', ref: 'r-1', message: '1 new' } : { status: 'refused', message: 'too old' })
    };
    const both = await run(deps([recordShim()], [mixed]), { source: { type: 'upload', files: [upload('a.rec', 'bp=1\nhr=2')] }, receiver: 'test.records' });
    expect(both.files[0]).toMatchObject({ status: 'partial', stored: 1, message: '1 new; refused: too old' });
  });

  test('a shim that throws fails only its file', async () => {
    const { receiver } = recordingReceiver('test.records', ['test.record']);
    const shim = recordShim({ read: async (input) => { if (input.name === 'bad.rec') throw new Error('malformed'); return { items: [{ kind: 'test.record', name: input.name }] }; } });
    const result = await run(deps([shim], [receiver]), {
      source: { type: 'upload', files: [upload('bad.rec', 'a=1'), upload('good.rec', 'a=2')] }, receiver: 'test.records'
    });
    expect(result.files.map(f => [f.name, f.status, f.message])).toEqual([['bad.rec', 'failed', 'malformed'], ['good.rec', 'imported', undefined]]);
  });

  test('an unknown receiver fails the run', async () => {
    const result = await run(deps([recordShim()], []), { source: { type: 'upload', files: [] }, receiver: 'nobody.here' });
    expect(result).toMatchObject({ state: 'failed', error: "No receiver 'nobody.here'" });
  });

  describe('the receiver\'s permission is asked before any work (#2012)', () => {
    /** Everything a run could do before the receiver: each records that it ran. */
    function spies() {
      const work: string[] = [];
      const shim = recordShim({
        accepts: { extensions: ['.rec'], canRead: (input) => { work.push(`canRead ${input.name}`); return true; } },
        read: async (input, tools) => {
          work.push(`read ${input.name}`);
          await tools.fetch('https://example.invalid/more').catch(() => undefined);
          return { items: [{ kind: 'test.record', name: input.name, data: 1 }] };
        }
      });
      return { work, shim };
    }

    test('a refused user: no unzip, no shim, no keep, no fetch; every upload is refused and recorded', async () => {
      const { work, shim } = spies();
      const { receiver, received, kept } = recordingReceiver('test.records', ['test.record'], { keeps: true, refuse: () => true });
      const fetches: string[] = [];
      const ledger = new MemoryIceLedger();
      const d = { ...deps([shim], [receiver], ledger), tools: () => ({ options: {}, fetch: async (url: string) => { fetches.push(url); throw new Error('no'); } }) };
      const zip = await packZip([{ path: 'inner.rec', bytes: Buffer.from('bp=1') }]);

      const result = await run(d, { source: { type: 'upload', files: [upload('a.rec', 'bp=120'), { name: 'more.zip', bytes: zip }] }, receiver: 'test.records', original: 'keep' });

      expect(result.state).toBe('done');
      expect(result.files.map(f => [f.name, f.status, f.message])).toEqual([
        ['a.rec', 'refused', 'You may not import into test.records'],
        ['more.zip', 'refused', 'You may not import into test.records']
      ]);
      expect(work).toEqual([]);
      expect(fetches).toEqual([]);
      expect(received).toEqual([]);
      expect(kept).toEqual([]);
      expect((await ledger.files('test.records/alice')).map(f => [f.name, f.status])).toEqual([['a.rec', 'refused'], ['more.zip', 'refused']]);
    });

    test('a pre-check that throws is a refusal', async () => {
      const { work, shim } = spies();
      const { receiver } = recordingReceiver('test.records', ['test.record']);
      receiver.mayUse = async () => { throw new Error('store down'); };
      const result = await run(deps([shim], [receiver]), { source: { type: 'upload', files: [upload('a.rec', 'bp=1')] }, receiver: 'test.records' });
      expect(result.files[0].status).toBe('refused');
      expect(work).toEqual([]);
    });

    test('a refusal keeps what the scope already holds: an imported entry, and a kept original', async () => {
      let refuse = false;
      const { receiver } = recordingReceiver('test.records', ['test.record'], { keeps: true, refuse: () => refuse });
      const ledger = new MemoryIceLedger();
      const d = deps([recordShim()], [receiver], ledger);
      const done = await run(d, { source: { type: 'upload', files: [upload('a.rec', 'bp=1')] }, receiver: 'test.records', original: 'keep' });
      refuse = true;
      await run(d, { source: { type: 'upload', files: [upload('a.rec', 'bp=1')] }, receiver: 'test.records' });
      expect(await ledger.lastFile('test.records/alice', done.files[0].sha256 ?? '')).toMatchObject({ status: 'imported', original: { ref: 'original-1' } });

      // A file kept but not imported keeps its original reference through the refusal.
      const failing = recordShim({ read: async () => { throw new Error('malformed'); } });
      refuse = false;
      const kept = await run(deps([failing], [receiver], ledger), { source: { type: 'upload', files: [upload('b.rec', 'bp=2')] }, receiver: 'test.records', original: 'keep' });
      refuse = true;
      await run(deps([failing], [receiver], ledger), { source: { type: 'upload', files: [upload('b.rec', 'bp=2')] }, receiver: 'test.records' });
      expect(await ledger.lastFile('test.records/alice', kept.files[0].sha256 ?? '')).toMatchObject({ status: 'refused', original: { ref: 'original-2' } });
    });

    test('a refusal keeps the references the scope already recorded for the file', async () => {
      let refuse = false;
      const { receiver } = recordingReceiver('test.records', ['test.record'], { refuse: () => refuse });
      receiver.receive = async (item): Promise<ReceiveOutcome> => ((item.data as { key: string }).key === 'hr' ? { status: 'refused', message: 'later' } : { status: 'stored', ref: 'records-bp' });
      const ledger = new MemoryIceLedger();
      const d = deps([recordShim()], [receiver], ledger);
      const req: IceRunRequest = { source: { type: 'upload', files: [upload('a.rec', 'bp=1\nhr=2')] }, receiver: 'test.records' };
      const first = await run(d, req);
      expect(first.files[0]).toMatchObject({ status: 'partial', refs: ['records-bp'] });
      refuse = true;
      await run(d, req);
      expect(await ledger.lastFile('test.records/alice', first.files[0].sha256 ?? '')).toMatchObject({ status: 'refused', refs: ['records-bp'] });
    });

    test('nothing is kept at upload for a user the receiver refuses', async () => {
      const { receiver, kept } = recordingReceiver('test.records', ['test.record'], { keeps: true, refuse: () => true });
      receiver.keepsEncrypted = true;
      const live = { ...ALICE, privateStoreHandle: 'alice-session' } as ActorContext;
      const result = await keepOriginalsAtUpload(deps([recordShim()], [receiver]), { source: { type: 'upload', files: [upload('a.rec', 'bp=1')] }, receiver: 'test.records', original: 'keep' }, live, 'test.records/alice');
      expect(result).toEqual({ kept: 0 });
      expect(kept).toEqual([]);
    });
  });

  describe('a partial file is tried again (#2010)', () => {
    /** A receiver that answers duplicate for a key it already holds, and refuses the keys it is told to. */
    function keyedReceiver(refused: Set<string>) {
      const held = new Map<string, string>();
      const receiver: RegisteredReceiver = {
        id: 'test.records', owner: 'test', name: 'records', accepts: ['test.record'], mayUse: async () => true,
        receive: async (item): Promise<ReceiveOutcome> => {
          const key = (item.data as { key: string }).key;
          if (held.has(key)) return { status: 'duplicate', ref: held.get(key) };
          if (refused.has(key)) return { status: 'refused', message: `${key} not allowed` };
          held.set(key, `rec-${key}`);
          return { status: 'stored', ref: `rec-${key}` };
        }
      };
      return { receiver, held };
    }

    test('items refused last time are offered again; items stored are not stored twice', async () => {
      const refused = new Set(['hr']);
      const { receiver, held } = keyedReceiver(refused);
      const d = deps([recordShim({ duplicates: 'file' })], [receiver]);
      const req: IceRunRequest = { source: { type: 'upload', files: [upload('a.rec', 'bp=120\nhr=60')] }, receiver: 'test.records' };

      expect((await run(d, req)).files[0]).toMatchObject({ status: 'partial', stored: 1 });
      // Still refused: offered again, still partial, nothing stored twice.
      expect((await run(d, req)).files[0]).toMatchObject({ status: 'partial', stored: 0, duplicates: 1, message: 'refused: hr not allowed' });
      refused.clear();
      expect((await run(d, req)).files[0]).toMatchObject({ status: 'imported', stored: 1, duplicates: 1 });
      expect([...held.keys()]).toEqual(['bp', 'hr']);
      // Now done: the same bytes are unchanged.
      expect((await run(d, req)).files[0].status).toBe('unchanged');
    });

    test('a receiver with no duplicate check of its own is never handed a stored item twice', async () => {
      let refuseHr = true;
      const { receiver, received } = recordingReceiver('test.records', ['test.record'], { refuse: (ctx) => ctx.username === 'nobody' });
      const inner = receiver.receive;
      receiver.receive = async (item, ctx, info) => (refuseHr && (item.data as { key: string }).key === 'hr' ? { status: 'refused', message: 'later' } : inner(item, ctx, info));
      const d = deps([recordShim({ duplicates: 'file' })], [receiver]);
      const req: IceRunRequest = { source: { type: 'upload', files: [upload('a.rec', 'bp=120\nhr=60')] }, receiver: 'test.records' };
      expect((await run(d, req)).files[0]).toMatchObject({ status: 'partial', stored: 1, refs: ['records-1'] });
      refuseHr = false;
      expect((await run(d, req)).files[0]).toMatchObject({ status: 'imported', stored: 1, duplicates: 1, refs: ['records-1', 'records-2'] });
      expect(received.map(r => (r.item.data as { key: string }).key)).toEqual(['bp', 'hr']);
    });

    test('a file that failed part-way is retried without storing its first items again', async () => {
      let broken = true;
      const { receiver, received } = recordingReceiver('test.records', ['test.record']);
      const inner = receiver.receive;
      receiver.receive = async (item, ctx, info) => {
        if (broken && (item.data as { key: string }).key === 'hr') throw new Error('disk full');
        return inner(item, ctx, info);
      };
      const d = deps([recordShim()], [receiver]);
      const req: IceRunRequest = { source: { type: 'upload', files: [upload('a.rec', 'bp=120\nhr=60')] }, receiver: 'test.records' };
      expect((await run(d, req)).files[0]).toMatchObject({ status: 'failed', message: 'disk full' });
      broken = false;
      expect((await run(d, req)).files[0]).toMatchObject({ status: 'imported', stored: 1, duplicates: 1 });
      expect(received.map(r => (r.item.data as { key: string }).key)).toEqual(['bp', 'hr']);
    });

    test('a shim\'s partial note is read again once; when every item is already stored it is unchanged, and done', async () => {
      const { receiver } = keyedReceiver(new Set());
      const read = vi.fn(async (input: IceItem) => ({ items: [{ kind: 'test.record', name: input.name, data: { key: 'bp' } }], partial: '2 sections not read' }));
      const d = deps([recordShim({ read })], [receiver]);
      const req: IceRunRequest = { source: { type: 'upload', files: [upload('a.rec', 'bp=1')] }, receiver: 'test.records' };
      expect((await run(d, req)).files[0].status).toBe('partial');
      expect((await run(d, req)).files[0]).toMatchObject({ status: 'unchanged', stored: 0, duplicates: 1, message: 'already imported', refs: ['rec-bp'] });
      expect((await run(d, req)).files[0].status).toBe('unchanged');
      expect(read).toHaveBeenCalledTimes(2);
    });

    test('a file whose every item the receiver already held is done: not read again', async () => {
      const { receiver, held } = keyedReceiver(new Set());
      held.set('bp', 'rec-bp');
      const read = vi.fn(async (input: IceItem) => ({ items: [{ kind: 'test.record', name: input.name, data: { key: 'bp' } }] }));
      const d = deps([recordShim({ read })], [receiver]);
      const req: IceRunRequest = { source: { type: 'upload', files: [upload('a.rec', 'bp=1')] }, receiver: 'test.records' };
      expect((await run(d, req)).files[0]).toMatchObject({ status: 'duplicate', duplicates: 1 });
      expect((await run(d, req)).files[0].status).toBe('unchanged');
      expect(read).toHaveBeenCalledTimes(1);
    });

    test('items are skipped by their content, not their position: a shim that inserts an item first still stores the one refused', async () => {
      const { receiver, received } = recordingReceiver('test.records', ['test.record']);
      const inner = receiver.receive;
      let refuseB = true;
      receiver.receive = async (item, ctx, info) => (refuseB && item.data === 'B' ? { status: 'refused', message: 'later' } : inner(item, ctx, info));
      let output = ['A', 'B'];
      const shim = recordShim({ read: async (input) => ({ items: output.map(data => ({ kind: 'test.record', name: input.name, data })) }) });
      const d = deps([shim], [receiver]);
      const req: IceRunRequest = { source: { type: 'upload', files: [upload('a.rec', 'x=1')] }, receiver: 'test.records' };
      expect((await run(d, req)).files[0]).toMatchObject({ status: 'partial', stored: 1 });
      // The shim changed: a new item at position 0, the old position-1 item after it.
      output = ['N', 'A', 'B'];
      refuseB = false;
      expect((await run(d, req)).files[0]).toMatchObject({ status: 'imported', stored: 2, duplicates: 1 });
      expect(received.map(r => r.item.data)).toEqual(['A', 'N', 'B']);
    });

    test('identical items in one file are told apart: the second, refused before, is stored on the retry', async () => {
      const { receiver, received } = recordingReceiver('test.records', ['test.record']);
      const inner = receiver.receive;
      let calls = 0;
      receiver.receive = async (item, ctx, info) => (++calls === 2 ? { status: 'refused', message: 'later' } : inner(item, ctx, info));
      const shim = recordShim({ read: async (input) => ({ items: [{ kind: 'test.record', name: input.name, data: 'same' }, { kind: 'test.record', name: input.name, data: 'same' }] }) });
      const d = deps([shim], [receiver]);
      const req: IceRunRequest = { source: { type: 'upload', files: [upload('a.rec', 'x=1')] }, receiver: 'test.records' };
      expect((await run(d, req)).files[0]).toMatchObject({ status: 'partial', stored: 1 });
      expect((await run(d, req)).files[0]).toMatchObject({ status: 'imported', stored: 1, duplicates: 1 });
      expect(received).toHaveLength(2);
    });
  });

  describe('per-item duplicates', () => {
    test('a shim with per-item duplicates skips items already seen, not the whole file', async () => {
      const { receiver, received } = recordingReceiver('test.records', ['test.record']);
      const d = deps([recordShim({ duplicates: 'item' })], [receiver]);
      await run(d, { source: { type: 'upload', files: [upload('feed.rec', 'a=1\nb=2')] }, receiver: 'test.records' });
      const next = await run(d, { source: { type: 'upload', files: [upload('feed.rec', 'a=1\nb=2\nc=3')] }, receiver: 'test.records' });
      expect(next.files[0]).toMatchObject({ status: 'imported', stored: 1, duplicates: 2 });
      // The same bytes again are not "unchanged": per-item shims skip by item.
      const same = await run(d, { source: { type: 'upload', files: [upload('feed.rec', 'a=1\nb=2\nc=3')] }, receiver: 'test.records' });
      expect(same.files[0]).toMatchObject({ status: 'duplicate', stored: 0, duplicates: 3 });
      expect(received.map(r => (r.item.data as { key: string }).key)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('the original (D11)', () => {
    const req = (original: 'cite' | 'keep' | 'none'): IceRunRequest => ({
      source: { type: 'upload', files: [upload('a.rec', 'bp=120')] }, receiver: 'test.records', original
    });

    test('none: no citation, nothing kept', async () => {
      const { receiver, received, kept } = recordingReceiver('test.records', ['test.record'], { keeps: true });
      await run(deps([recordShim()], [receiver]), req('none'));
      expect(received[0].info.citation).toBeUndefined();
      expect(received[0].info.original).toBeUndefined();
      expect(kept).toEqual([]);
    });

    test('cite: every item carries a citation to the origin', async () => {
      const { receiver, received, kept } = recordingReceiver('test.records', ['test.record'], { keeps: true });
      await run(deps([recordShim()], [receiver]), req('cite'));
      expect(received[0].info.citation).toEqual({ name: 'a.rec', sha256: expect.stringMatching(/^[0-9a-f]{64}$/), importedAt: '2026-10-22T12:00:00.000Z' });
      expect(kept).toEqual([]);
    });

    test('keep: a receiver that keeps its own originals is handed the file, with the context', async () => {
      const { receiver, received, kept } = recordingReceiver('test.records', ['test.record'], { keeps: true });
      const result = await run(deps([recordShim()], [receiver]), req('keep'));
      expect(kept).toHaveLength(1);
      expect(kept[0].ctx).toBe(ALICE);
      expect(kept[0].item.bytes?.toString()).toBe('bp=120');
      expect(received[0].info.original).toEqual({ name: 'a.rec', sha256: expect.any(String), ref: 'original-1' });
      expect(result.files[0].original?.ref).toBe('original-1');
    });

    test('keep: otherwise the files receiver\'s door keeps it', async () => {
      const { receiver, received } = recordingReceiver('test.records', ['test.record']);
      const files = recordingReceiver('core.files', ['file']);
      await run(deps([recordShim()], [receiver, files.receiver]), req('keep'));
      expect(files.received).toHaveLength(1);
      expect(files.received[0]).toMatchObject({ ctx: ALICE, item: { kind: 'file', name: 'a.rec' } });
      expect(received[0].info.original?.ref).toBe('files-1');
    });

    test('keep: when keeping is refused, nothing is imported', async () => {
      const { receiver, received } = recordingReceiver('test.records', ['test.record']);
      const files = recordingReceiver('core.files', ['file'], { refuse: () => true });
      const result = await run(deps([recordShim()], [receiver, files.receiver]), req('keep'));
      expect(result.files[0]).toMatchObject({ status: 'refused', message: expect.stringMatching(/keeping the original was refused/) });
      expect(received).toEqual([]);
    });

    describe('a kept original is kept once per fingerprint (#2011)', () => {
      /** A shim that throws until told not to: a conversion that fails after the original was kept. */
      function flakyShim(): { shim: RegisteredShim; fix: () => void } {
        let broken = true;
        const ok = recordShim();
        return {
          shim: recordShim({ read: async (input, tools) => { if (broken) throw new Error('malformed'); return ok.read!(input, tools); } }),
          fix: () => { broken = false; }
        };
      }

      test('the receiver\'s own keepOriginal: a retry after a failed conversion reuses the kept original', async () => {
        const { receiver, received, kept } = recordingReceiver('test.records', ['test.record'], { keeps: true });
        const flaky = flakyShim();
        const ledger = new MemoryIceLedger();
        const d = deps([flaky.shim], [receiver], ledger);

        const first = await run(d, req('keep'));
        expect(first.files[0]).toMatchObject({ status: 'failed', message: 'malformed', original: { ref: 'original-1' } });
        expect(kept).toHaveLength(1);

        const failedAgain = await run(d, req('keep'));
        expect(failedAgain.files[0]).toMatchObject({ status: 'failed', original: { ref: 'original-1' } });
        expect(kept).toHaveLength(1);

        flaky.fix();
        const retried = await run(d, req('keep'));
        expect(retried.files[0]).toMatchObject({ status: 'imported', original: { ref: 'original-1' } });
        expect(kept).toHaveLength(1);
        expect(received[0].info.original).toEqual({ name: 'a.rec', sha256: expect.any(String), ref: 'original-1' });
        expect((await ledger.lastFile('test.records/alice', retried.files[0].sha256 ?? ''))?.original).toMatchObject({ ref: 'original-1', door: 'test.records' });
      });

      test('the files receiver: a retry after a failed conversion reuses the kept attachment', async () => {
        const { receiver, received } = recordingReceiver('test.records', ['test.record']);
        const files = recordingReceiver('core.files', ['file']);
        const flaky = flakyShim();
        const d = deps([flaky.shim], [receiver, files.receiver]);

        expect((await run(d, req('keep'))).files[0]).toMatchObject({ status: 'failed', original: { ref: 'files-1' } });
        flaky.fix();
        expect((await run(d, req('keep'))).files[0]).toMatchObject({ status: 'imported', original: { ref: 'files-1' } });
        expect(files.received).toHaveLength(1);
        expect(received[0].info.original?.ref).toBe('files-1');
      });

      test('a retry after the receiver refused every item reuses the kept original', async () => {
        let refuse = true;
        const { receiver, kept } = recordingReceiver('test.records', ['test.record'], { keeps: true, refuse: () => refuse });
        receiver.mayUse = async () => true;
        const d = deps([recordShim()], [receiver]);
        expect((await run(d, req('keep'))).files[0].status).toBe('refused');
        refuse = false;
        expect((await run(d, req('keep'))).files[0]).toMatchObject({ status: 'imported', original: { ref: 'original-1' } });
        expect(kept).toHaveLength(1);
      });

      test('a different keeping door keeps its own copy', async () => {
        const files = recordingReceiver('core.files', ['file']);
        const plain = recordingReceiver('test.records', ['test.record']);
        const keeper = recordingReceiver('test.records', ['test.record'], { keeps: true });
        const flaky = flakyShim();
        const ledger = new MemoryIceLedger();
        // The same scope, first through core.files, then through a receiver that keeps its own.
        await run(deps([flaky.shim], [plain.receiver, files.receiver], ledger), req('keep'));
        flaky.fix();
        const result = await run(deps([flaky.shim], [keeper.receiver, files.receiver], ledger), req('keep'));
        expect(result.files[0]).toMatchObject({ status: 'imported', original: { ref: 'original-1' } });
        expect(files.received).toHaveLength(1);
        expect(keeper.kept).toHaveLength(1);
      });

      test('a successful keep is unchanged: the same bytes again are skipped, and nothing more is kept', async () => {
        const { receiver, kept } = recordingReceiver('test.records', ['test.record'], { keeps: true });
        const d = deps([recordShim()], [receiver]);
        expect((await run(d, req('keep'))).files[0]).toMatchObject({ status: 'imported', original: { ref: 'original-1' } });
        expect((await run(d, req('keep'))).files[0].status).toBe('unchanged');
        expect(kept).toHaveLength(1);
      });

      test('a per-item shim reads the same bytes again but keeps the original once', async () => {
        const { receiver, kept } = recordingReceiver('test.records', ['test.record'], { keeps: true });
        const d = deps([recordShim({ duplicates: 'item' })], [receiver]);
        await run(d, req('keep'));
        expect((await run(d, req('keep'))).files[0]).toMatchObject({ status: 'duplicate', original: { ref: 'original-1' } });
        expect(kept).toHaveLength(1);
      });
    });

    test('the default comes from configuration', async () => {
      const { receiver, received } = recordingReceiver('test.records', ['test.record']);
      await run(deps([recordShim()], [receiver], undefined, { defaultOriginal: 'cite' }), {
        source: { type: 'upload', files: [upload('a.rec', 'bp=1')] }, receiver: 'test.records'
      });
      expect(received[0].info.citation).toBeDefined();
    });
  });

  describe('keeping at upload, into an encrypted store (#2034)', () => {
    /** The request's context: it carries the session's key handle. A job's context never does. */
    const LIVE = { ...ALICE, privateStoreHandle: 'alice-session' } as ActorContext;
    const req = (files = [upload('a.rec', 'bp=120')]): IceRunRequest => ({ source: { type: 'upload', files }, receiver: 'test.records', original: 'keep' });

    /** A receiver keeping into an encrypted store: like `dekFor`, only a context holding the key may write it. */
    function sealedKeeper(opts: { refuse?: boolean } = {}) {
      const r = recordingReceiver('test.records', ['test.record'], { keeps: true });
      const inner = r.receiver.keepOriginal!;
      r.receiver.keepsEncrypted = true;
      r.receiver.keepOriginal = async (item, ctx) => {
        if (opts.refuse) return { status: 'refused', message: 'Your health record is locked. Unlock it and try again.' };
        if (!(ctx as { privateStoreHandle?: string }).privateStoreHandle) return { status: 'refused', message: 'encrypted store is locked' };
        return inner(item, ctx);
      };
      return r;
    }

    test('keeps each original with the request context, and the run reuses it without the key', async () => {
      const { receiver, received, kept } = sealedKeeper();
      const ledger = new MemoryIceLedger();
      const d = deps([recordShim()], [receiver], ledger);

      const atUpload = await keepOriginalsAtUpload(d, req(), LIVE, 'test.records/alice');
      expect(atUpload).toEqual({ kept: 1 });
      expect(kept).toHaveLength(1);
      expect(kept[0].ctx).toBe(LIVE);

      // The run carries a job context: no key handle. It keeps nothing more.
      const result = await run(d, req());
      expect(result.files[0]).toMatchObject({ status: 'imported', original: { ref: 'original-1' } });
      expect(kept).toHaveLength(1);
      expect(received[0].ctx).toBe(ALICE);
      expect(received[0].info.original).toEqual({ name: 'a.rec', sha256: expect.any(String), ref: 'original-1' });
    });

    test('without it, the run alone cannot keep: the store refuses a context with no key', async () => {
      const { receiver, received } = sealedKeeper();
      const result = await run(deps([recordShim()], [receiver]), req());
      expect(result.files[0]).toMatchObject({ status: 'refused', message: expect.stringMatching(/encrypted store is locked/) });
      expect(received).toEqual([]);
    });

    test('a refused keep names the file and records nothing kept', async () => {
      const { receiver, kept } = sealedKeeper({ refuse: true });
      const ledger = new MemoryIceLedger();
      const atUpload = await keepOriginalsAtUpload(deps([recordShim()], [receiver], ledger), req(), LIVE, 'test.records/alice');
      expect(atUpload).toEqual({ kept: 0, refused: { name: 'a.rec', message: 'Your health record is locked. Unlock it and try again.' } });
      expect(kept).toEqual([]);
      expect(await ledger.files('test.records/alice')).toEqual([]);
    });

    test('a keep that throws is a refusal, with its message', async () => {
      const { receiver } = sealedKeeper();
      receiver.keepOriginal = async () => { throw new Error('disk full'); };
      const atUpload = await keepOriginalsAtUpload(deps([recordShim()], [receiver]), req(), LIVE, 'test.records/alice');
      expect(atUpload.refused).toEqual({ name: 'a.rec', message: 'disk full' });
    });

    test('decides as the run does: zip members each, noise and unreadable files not, the same bytes once', async () => {
      const { receiver, kept } = sealedKeeper();
      const zip = await packZip([
        { path: 'one.rec', bytes: Buffer.from('bp=1') },
        { path: 'again.rec', bytes: Buffer.from('bp=1') },
        { path: '.DS_Store', bytes: Buffer.from('x') },
        { path: 'notes.txt', bytes: Buffer.from('no shim reads this') }
      ]);
      const d = deps([recordShim()], [receiver]);
      const atUpload = await keepOriginalsAtUpload(d, req([{ name: 'export.zip', bytes: zip }]), LIVE, 'test.records/alice');
      expect(atUpload).toEqual({ kept: 1 });
      expect(kept.map(k => k.item.name)).toEqual(['export.zip/one.rec']);
    });

    test('a file the scope already imported is not kept again', async () => {
      const { receiver, kept } = sealedKeeper();
      const d = deps([recordShim()], [receiver]);
      await keepOriginalsAtUpload(d, req(), LIVE, 'test.records/alice');
      await run(d, req());
      expect(await keepOriginalsAtUpload(d, req(), LIVE, 'test.records/alice')).toEqual({ kept: 0 });
      expect(kept).toHaveLength(1);
    });

    test('nothing is kept at upload for a receiver that does not keep into an encrypted store, or a run not keeping', async () => {
      const plain = recordingReceiver('test.records', ['test.record'], { keeps: true });
      expect(await keepOriginalsAtUpload(deps([recordShim()], [plain.receiver]), req(), LIVE, 'test.records/alice')).toEqual({ kept: 0 });
      expect(plain.kept).toEqual([]);

      const sealed = sealedKeeper();
      const cite = { ...req(), original: 'cite' as const };
      expect(await keepOriginalsAtUpload(deps([recordShim()], [sealed.receiver]), cite, LIVE, 'test.records/alice')).toEqual({ kept: 0 });
      expect(sealed.kept).toEqual([]);
    });
  });

  describe('a URL source (#2109)', () => {
    type FetchCall = { url: string; opts: Parameters<ShimTools['fetch']>[1] };
    const response = (body: string, status = 200, type = 'text/plain; charset=utf-8'): GuardedResponse =>
      ({ status, headers: { 'content-type': type }, body: Buffer.from(body), finalUrl: 'https://feed.test/', chain: ['https://feed.test/'] });

    /** Deps whose engine fetch and shim fetch answer from `pages`, recording each call. */
    function urlDeps(shims: RegisteredShim[], receivers: RegisteredReceiver[], pages: Record<string, GuardedResponse>, ledger = new MemoryIceLedger()) {
      const calls: FetchCall[] = [];
      const fetch: ShimTools['fetch'] = async (url, opts) => {
        calls.push({ url, opts });
        const page = pages[url];
        if (!page) throw new Error(`refused: ${url}`);
        return page;
      };
      const d: IceRunDeps = { ...deps(shims, receivers, ledger), fetch, tools: () => ({ options: { site: 'yes', delimiter: ',' }, fetch }) };
      return { d, calls };
    }
    const urlReq = (extra: Partial<IceRunRequest> = {}): IceRunRequest => ({
      source: { type: 'url', url: 'https://feed.test/list.rec', headers: { 'User-Agent': 'feed-bot/1' }, timeoutMs: 9000, metadata: { feed: 'quakes' } },
      receiver: 'test.records', shim: 'test.rec', ...extra
    });

    test('the engine fetches the URL with the source\'s headers and timeout, and the file carries the source\'s metadata', async () => {
      const { receiver, received } = recordingReceiver('test.records', ['test.record']);
      const { d, calls } = urlDeps([recordShim()], [receiver], { 'https://feed.test/list.rec': response('a=1\nb=2') });
      const r = await run(d, urlReq());
      expect(r.files).toMatchObject([{ name: 'https://feed.test/list.rec', status: 'imported', stored: 2 }]);
      expect(calls).toEqual([{ url: 'https://feed.test/list.rec', opts: { maxBytes: 1_000_000, timeoutMs: 9000, headers: { 'User-Agent': 'feed-bot/1' } } }]);
      const meta = { feed: 'quakes', sourceUrl: 'https://feed.test/list.rec' };
      expect(received.map(x => x.item.metadata)).toEqual([meta, meta]);
    });

    test('a failed or non-2xx fetch fails the file; nothing is handed', async () => {
      const { receiver, received } = recordingReceiver('test.records', ['test.record']);
      const { d } = urlDeps([recordShim()], [receiver], { 'https://feed.test/list.rec': response('down', 503) });
      expect((await run(d, urlReq())).files).toMatchObject([{ status: 'failed', message: 'HTTP 503 from https://feed.test/list.rec' }]);
      const refused = urlDeps([recordShim()], [receiver], {});
      expect((await run(refused.d, urlReq({ source: { type: 'url', url: 'http://10.0.0.1/x', name: 'inside' } }))).files)
        .toMatchObject([{ name: 'inside', status: 'failed', message: 'refused: http://10.0.0.1/x' }]);
      expect(received).toEqual([]);
    });

    test('a receiver that refuses the run is asked first: nothing is fetched (#2012)', async () => {
      const { receiver } = recordingReceiver('test.records', ['test.record'], { refuse: () => true });
      const { d, calls } = urlDeps([recordShim()], [receiver], { 'https://feed.test/list.rec': response('a=1') });
      expect((await run(d, urlReq())).files).toMatchObject([{ name: 'https://feed.test/list.rec', status: 'refused' }]);
      expect(calls).toEqual([]);
    });

    test('the run\'s options reach its shims over the site\'s; a follow-up fetch carries the source\'s headers and timeout', async () => {
      const { receiver } = recordingReceiver('test.records', ['test.record']);
      let seen: Record<string, unknown> = {};
      const indexShim = recordShim({
        read: async (input, tools) => {
          seen = tools.options;
          const items: IceItem[] = [];
          for (const url of (input.text ?? '').split('\n').filter(Boolean)) {
            const res = await tools.fetch(url, { headers: { Accept: 'text/plain' } });
            items.push({ kind: 'test.record', name: url, data: res.body.toString() });
          }
          return { items };
        }
      });
      const { d, calls } = urlDeps([indexShim], [receiver], {
        'https://feed.test/list.rec': response('https://feed.test/1\nhttps://feed.test/2'),
        'https://feed.test/1': response('one'), 'https://feed.test/2': response('two')
      });
      const r = await run(d, urlReq({ options: { delimiter: ';', itemsPath: 'rows' } }));
      expect(r.files[0]).toMatchObject({ status: 'imported', stored: 2 });
      expect(seen).toEqual({ site: 'yes', delimiter: ';', itemsPath: 'rows' });
      expect(calls.slice(1)).toEqual([
        { url: 'https://feed.test/1', opts: { timeoutMs: 9000, headers: { 'User-Agent': 'feed-bot/1', Accept: 'text/plain' } } },
        { url: 'https://feed.test/2', opts: { timeoutMs: 9000, headers: { 'User-Agent': 'feed-bot/1', Accept: 'text/plain' } } }
      ]);
    });
  });

  describe('a receiver that settles each file (fileDone, #2109)', () => {
    const req = (files: Array<{ name: string; bytes: Buffer }>): IceRunRequest => ({ source: { type: 'upload', files }, receiver: 'test.records' });
    function snapshotReceiver() {
      const settled: FileDoneInfo[] = [];
      const { receiver, received } = recordingReceiver('test.records', ['test.record']);
      receiver.fileDone = async (_ctx, info) => {
        settled.push(info);
        return `${info.items.length} held`;
      };
      return { receiver, received, settled };
    }

    test('gets every item the file held, those skipped as already seen included; seen keys are read and written once per file', async () => {
      const { receiver, received, settled } = snapshotReceiver();
      const ledger = new MemoryIceLedger();
      const reads = vi.spyOn(ledger, 'seenItems');
      const writes = vi.spyOn(ledger, 'recordItems');
      const d = deps([recordShim({ duplicates: 'item' })], [receiver], ledger);
      await run(d, req([upload('a.rec', 'a=1\nb=2')]));
      const second = await run(d, req([upload('b.rec', 'a=1\nb=2\nc=3')]));
      expect(received.map(r => (r.item.data as { key: string }).key)).toEqual(['a', 'b', 'c']);
      expect(settled.map(s => s.items.map(i => i.itemKey))).toEqual([['a', 'b'], ['a', 'b', 'c']]);
      expect(second.files[0]).toMatchObject({ status: 'imported', stored: 1, duplicates: 2, message: '3 held' });
      expect(reads).toHaveBeenCalledTimes(2);
      expect(writes).toHaveBeenCalledTimes(2);
    });

    test('a file whose every item was seen is a duplicate and still settled', async () => {
      const { receiver, settled } = snapshotReceiver();
      const d = deps([recordShim({ duplicates: 'item' })], [receiver]);
      await run(d, req([upload('a.rec', 'a=1')]));
      const again = await run(d, req([upload('a.rec', 'a=1')]));
      expect(again.files[0]).toMatchObject({ status: 'duplicate', message: '1 held' });
      expect(settled).toHaveLength(2);
    });

    test('a fileDone that throws fails the file, and its new item keys are not recorded', async () => {
      const { receiver, received } = snapshotReceiver();
      receiver.fileDone = async () => { throw new Error('store is read-only'); };
      const d = deps([recordShim({ duplicates: 'item' })], [receiver]);
      expect((await run(d, req([upload('a.rec', 'a=1')]))).files[0]).toMatchObject({ status: 'failed', message: 'store is read-only' });
      delete receiver.fileDone;
      expect((await run(d, req([upload('a.rec', 'a=1')]))).files[0]).toMatchObject({ status: 'imported', stored: 1 });
      expect(received).toHaveLength(2);
    });
  });
});

describe('a format that spans an archive (#2118)', () => {
  /** A shim that reads each member with the archive beside it: an index member is read through the others. */
  function layoutShim(): RegisteredShim {
    return {
      id: 'test.layout', owner: 'test', name: 'layout', direction: 'in',
      accepts: { canRead: (input) => !!input.archive },
      produces: 'test.record',
      receivers: ['test.records'],
      read: async (input) => {
        const archive = input.archive!;
        if (archive.path === 'index.txt') return { items: [], skip: 'the index, read with what it names' };
        const named = archive.read('index.txt')?.toString('utf8') ?? '';
        return { items: [{ kind: 'test.record', name: input.name, data: { path: archive.path, named, siblings: archive.paths.length } }] };
      }
    };
  }

  test('each member is handed on its own, with the archive beside it; a member with nothing of its own is noise, unrecorded', async () => {
    const zip = await packZip([
      { path: 'index.txt', bytes: Buffer.from('a.dat') },
      { path: 'a.dat', bytes: Buffer.from('one') }
    ]);
    const ledger = new MemoryIceLedger();
    const { receiver, received } = recordingReceiver('test.records', ['test.record']);
    const request: IceRunRequest = { source: { type: 'upload', files: [{ name: 'bundle.zip', bytes: zip }] }, receiver: 'test.records' };
    const result = await run(deps([layoutShim()], [receiver], ledger), request);

    expect(result.files.map(f => [f.name, f.status, f.message])).toEqual([
      ['bundle.zip/index.txt', 'noise', 'the index, read with what it names'],
      ['bundle.zip/a.dat', 'imported', undefined]
    ]);
    expect(received.map(r => r.item.data)).toEqual([{ path: 'a.dat', named: 'a.dat', siblings: 2 }]);
    expect((await ledger.files(report(request).scope)).map(f => f.name)).toEqual(['bundle.zip/a.dat']);
  });

  test('a file uploaded on its own has no archive', async () => {
    const { receiver } = recordingReceiver('test.records', ['test.record']);
    const result = await run(deps([layoutShim()], [receiver]), { source: { type: 'upload', files: [upload('a.dat', 'one')] }, receiver: 'test.records' });
    expect(result.files[0].status).toBe('unreadable');
  });

  test('the request\'s place within the receiver reaches every item, and the receiver settles the run once', async () => {
    const { receiver, received } = recordingReceiver('test.records', ['test.record']);
    const done: IceRunReport[] = [];
    receiver.runDone = async (_ctx, r) => { done.push(r); };
    const result = await run(deps([recordShim()], [receiver]), {
      source: { type: 'upload', files: [upload('a.rec', 'a=1\nb=2'), upload('b.rec', 'c=3')] }, receiver: 'test.records', target: 'vault'
    });
    expect(received.map(r => r.info.target)).toEqual(['vault', 'vault', 'vault']);
    expect(done).toEqual([result]);
  });

  test('a refused run is not settled', async () => {
    const { receiver } = recordingReceiver('test.records', ['test.record'], { refuse: () => true });
    const runDone = vi.fn();
    receiver.runDone = runDone;
    await run(deps([recordShim()], [receiver]), { source: { type: 'upload', files: [upload('a.rec', 'a=1')] }, receiver: 'test.records' });
    expect(runDone).not.toHaveBeenCalled();
  });

  test('a bound scope narrows by the place, then by the caller\'s own scope', () => {
    expect(boundScope('core.private-store', 'molly', 'vault')).toBe('ice2/core.private-store/molly/vault');
    expect(boundScope('phr.records', 'molly', undefined, 'src-1')).toBe('ice2/phr.records/molly/src-1');
    expect(boundScope('core.pages', 'molly')).toBe('ice2/core.pages/molly');
  });
});
