/**
 * The name a user gives what an upload becomes (#2130): the rule, and the
 * engine applying it. The receiver decides where the thing goes; the name is
 * checked as a name only, never as a location.
 */
import { packZip } from '../../utils/zipArchive';
import { TITLE_RULE_MESSAGE } from '../../utils/pageTitleRule';
import { MemoryIceLedger } from '../ledger';
import { appliedGivenName, defaultGivenName, givenNameProblem, type IceNameForm } from '../givenName';
import { runImport, type IceEngineSettings, type IceRunDeps } from '../runImport';
import type { IceItem, IceRunReport, IceRunRequest, ReceiveInfo, RegisteredReceiver } from '../types';
import type { ActorContext } from '../../context/ActorContext';

const ALICE = { username: 'alice', roles: ['reader'], isAuthenticated: true } as ActorContext;
const SETTINGS: IceEngineSettings = {
  noise: [], zip: { maxEntries: 100, maxTotalBytes: 1_000_000 }, maxZipDepth: 3, maxFileBytes: 1_000_000,
  maxChainDepth: 5, defaultOriginal: 'none', fetchMaxBytes: 1_000_000, maxNameLength: 40
};

describe('the name rule (#2130)', () => {
  test('the default is the file\'s own name; for a title, without its extension', () => {
    expect(defaultGivenName('file', 'export_20261029.csv')).toBe('export_20261029.csv');
    expect(defaultGivenName('title', 'export_20261029.csv')).toBe('export_20261029');
    expect(defaultGivenName('title', 'archive.zip/inner/notes.md')).toBe('notes');
  });

  test('a name kept as it is is not applied; a new one is, trimmed', () => {
    expect(appliedGivenName('file', 'IMG_1234.jpg', 'IMG_1234.jpg')).toBeUndefined();
    expect(appliedGivenName('title', 'IMG_1234', 'IMG_1234.jpg')).toBeUndefined();
    expect(appliedGivenName('file', '  Beach.jpg ', 'IMG_1234.jpg')).toBe('Beach.jpg');
  });

  test.each<[IceNameForm, string, string, RegExp | string]>([
    ['title', '   ', 'a.md', /Give it a name/],
    ['title', 'x'.repeat(41), 'a.md', /up to 40 characters/],
    ['title', 'Bad\u0007Bell', 'a.md', /control characters/],
    ['title', 'Docs/Setup', 'a.md', TITLE_RULE_MESSAGE],
    ['title', 'What?', 'a.md', TITLE_RULE_MESSAGE],
    ['file', '../etc/passwd.csv', 'a.csv', /cannot contain \/ or \\/],
    ['file', 'sub\\a.csv', 'a.csv', /cannot contain \/ or \\/],
    ['file', '.hidden.csv', 'a.csv', /cannot start with a dot/],
    ['file', 'Bank October.txt', 'export.csv', /Keep the file's extension, \.csv/],
    ['file', 'Bank October', 'export.csv', /Keep the file's extension, \.csv/],
    ['file', 'notes.txt', 'README', /no extension/]
  ])('%s %j for %s is refused', (form, given, original, message) => {
    const problem = givenNameProblem(form, given, original, 40);
    expect(problem).toEqual(typeof message === 'string' ? message : expect.stringMatching(message));
  });

  test('good names pass: a title with spaces, a file keeping its extension in any case', () => {
    expect(givenNameProblem('title', 'Bank statement, October', 'export.csv', 40)).toBeNull();
    expect(givenNameProblem('file', 'Bank October.CSV', 'export.csv', 40)).toBeNull();
  });
});

type Received = { item: IceItem; info: ReceiveInfo };

function receiver(names?: IceNameForm) {
  const received: Received[] = [];
  const r: RegisteredReceiver = {
    id: 'test.things', owner: 'test', name: 'things', accepts: ['file'], ...(names ? { names } : {}),
    mayUse: async () => true,
    receive: async (item, _ctx, info) => {
      received.push({ item, info });
      return { status: 'stored', ref: info.givenName ?? item.name };
    }
  };
  return { r, received };
}

function deps(r: RegisteredReceiver, ledger = new MemoryIceLedger()): IceRunDeps {
  return {
    shims: [], receivers: new Map([[r.id, r]]), ledger, settings: SETTINGS,
    tools: () => ({ options: {}, fetch: async () => { throw new Error('no network'); } }),
    now: () => new Date('2026-10-29T12:00:00Z')
  };
}

async function run(d: IceRunDeps, request: IceRunRequest): Promise<IceRunReport> {
  return runImport(d, request, ALICE, { runId: 'run-1', receiver: request.receiver, scope: 's', username: 'alice', state: 'queued', files: [] });
}

const file = (name: string, givenName?: string) => ({ name, bytes: Buffer.from(`bytes of ${name}`), ...(givenName !== undefined ? { givenName } : {}) });

describe('the engine applies a given name (#2130)', () => {
  test('a new name reaches the receiver, the report and the ledger, beside the file\'s own', async () => {
    const { r, received } = receiver('file');
    const ledger = new MemoryIceLedger();
    const result = await run(deps(r, ledger), { source: { type: 'upload', files: [file('export.csv', 'Bank October.csv')] }, receiver: r.id });
    expect(received[0].info.givenName).toBe('Bank October.csv');
    expect(received[0].item.name).toBe('export.csv');
    expect(result.files[0]).toMatchObject({ name: 'export.csv', givenName: 'Bank October.csv', status: 'imported' });
    expect((await ledger.files('s'))[0]).toMatchObject({ name: 'export.csv', givenName: 'Bank October.csv' });
  });

  test('the default: no name, or the file\'s own name kept, gives the receiver none', async () => {
    const { r, received } = receiver('file');
    await run(deps(r), { source: { type: 'upload', files: [file('a.csv'), file('b.csv', 'b.csv')] }, receiver: r.id });
    expect(received.map(x => x.info.givenName)).toEqual([undefined, undefined]);
  });

  test('an invalid name refuses the file with why, and the next try with another name is read again', async () => {
    const { r, received } = receiver('file');
    const d = deps(r);
    const bad = await run(d, { source: { type: 'upload', files: [file('export.csv', '../up.csv')] }, receiver: r.id });
    expect(bad.files[0]).toMatchObject({ status: 'refused', message: 'A file name cannot contain / or \\.' });
    expect(received).toHaveLength(0);
    const good = await run(d, { source: { type: 'upload', files: [file('export.csv', 'Bank.csv')] }, receiver: r.id });
    expect(good.files[0]).toMatchObject({ status: 'imported', givenName: 'Bank.csv' });
  });

  test('a receiver that names things itself is never handed a name', async () => {
    const { r, received } = receiver();
    const result = await run(deps(r), { source: { type: 'upload', files: [file('export.csv', 'Anything at all')] }, receiver: r.id });
    expect(received[0].info.givenName).toBeUndefined();
    expect(result.files[0].givenName).toBeUndefined();
  });

  test('a zip\'s files keep their own names', async () => {
    const { r, received } = receiver('file');
    const zip = await packZip([{ path: 'one.csv', bytes: Buffer.from('1') }, { path: 'two.csv', bytes: Buffer.from('2') }]);
    const result = await run(deps(r), { source: { type: 'upload', files: [{ name: 'all.zip', bytes: zip, givenName: 'Renamed.zip' }] }, receiver: r.id });
    expect(received.map(x => x.info.givenName)).toEqual([undefined, undefined]);
    expect(result.files.map(f => [f.name, f.givenName])).toEqual([['all.zip/one.csv', undefined], ['all.zip/two.csv', undefined]]);
  });
});

describe('a name given is never silently dropped (operator, 2026-10-29)', () => {
  /** A receiver that already holds everything, under another name, and links to it. */
  function holding(link: string) {
    const r: RegisteredReceiver = {
      id: 'test.things', owner: 'test', name: 'things', accepts: ['file'], names: 'file',
      mayUse: async () => true,
      receive: async () => ({ status: 'duplicate', ref: 'thing-7', heldAs: 'scan0042.pdf' }),
      linkFor: async () => link
    };
    return r;
  }

  test('held under another name: duplicate, says where, links there, and the name is not recorded as applied', async () => {
    const ledger = new MemoryIceLedger();
    const result = await run(deps(holding('/things/7'), ledger), { source: { type: 'upload', files: [file('copy.pdf', 'Taxes.pdf')] }, receiver: 'test.things' });
    expect(result.files[0]).toMatchObject({ status: 'duplicate', heldAs: 'scan0042.pdf', link: '/things/7', message: 'This file is already on the site as "scan0042.pdf"; rename it there.' });
    expect(result.files[0].givenName).toBeUndefined();
    const entry = (await ledger.files('s'))[0];
    expect(entry).toMatchObject({ heldAs: 'scan0042.pdf' });
    expect(entry.givenName).toBeUndefined();
  });

  test('a link to another origin is never offered', async () => {
    const result = await run(deps(holding('https://evil.example/x')), { source: { type: 'upload', files: [file('copy.pdf', 'Taxes.pdf')] }, receiver: 'test.things' });
    expect(result.files[0].link).toBeUndefined();
  });

  test('without a name given, a held item is a plain duplicate, as today', async () => {
    const result = await run(deps(holding('/things/7')), { source: { type: 'upload', files: [file('copy.pdf')] }, receiver: 'test.things' });
    expect(result.files[0].status).toBe('duplicate');
    expect(result.files[0].message).toBeUndefined();
    expect(result.files[0].link).toBeUndefined();
  });

  test('the same bytes again: under the name they have, today\'s "already imported"; under another, where they are', async () => {
    const { r } = receiver('file');
    const d = deps(r);
    await run(d, { source: { type: 'upload', files: [file('export.csv', 'Bank.csv')] }, receiver: r.id });
    const again = await run(d, { source: { type: 'upload', files: [file('export.csv', 'Bank.csv')] }, receiver: r.id });
    expect(again.files[0]).toMatchObject({ status: 'unchanged', message: expect.stringMatching(/^already imported /) });
    const renamed = await run(d, { source: { type: 'upload', files: [file('export.csv', 'Other.csv')] }, receiver: r.id });
    expect(renamed.files[0]).toMatchObject({ status: 'unchanged', message: 'This file is already on the site as "Bank.csv"; rename it there.' });
  });
});
