/**
 * Each rule of one ICE run (#1979), against stand-in shims and receivers:
 * fingerprint skip, unzip, the noise filter, per-file status, chaining, the
 * receiver's door called with the run's context, a refusal by the receiver,
 * the three original choices (D11), and per-item duplicates.
 */
import { packZip } from '../../utils/zipArchive';
import { MemoryIceLedger } from '../ledger';
import { keepOriginalsAtUpload, runImport, type IceEngineSettings, type IceRunDeps } from '../runImport';
import type {
  IceItem, IceRunReport, IceRunRequest, ReceiveInfo, ReceiveOutcome, RegisteredReceiver, RegisteredShim
} from '../types';
import type { ActorContext } from '../../context/ActorContext';

const ALICE: ActorContext = { username: 'alice', roles: ['reader'], isAuthenticated: true } as ActorContext;

const SETTINGS: IceEngineSettings = {
  noise: ['__MACOSX/', '.DS_Store', '._*'],
  zip: { maxEntries: 100, maxTotalBytes: 1_000_000 },
  maxZipDepth: 3,
  maxFileBytes: 1_000_000,
  maxChainDepth: 5,
  defaultOriginal: 'none'
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
});
