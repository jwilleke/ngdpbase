/**
 * #2041 (identity model step 6): footnotes and comments refer to their
 * creator by identity `@id`, never a username.
 *
 * - a new footnote's `createdBy` and a new comment's `author` are the
 *   caller's `@id`; a name with no account is stored as given, and so is
 *   every name while the identity store is down (the write still works);
 * - "is it mine" is the manager's answer (`isCreator`, `isAuthor`): the
 *   caller's `@id`, or their username on a note not yet converted (a vault
 *   page's, which start-up does not open); an orphan matches nobody;
 * - at start-up the public folder is converted once: known usernames become
 *   `@id`s, one with no account becomes `orphan:<name>` and is reported
 *   (log line, needs-attention, counts only); `anonymous`, the system
 *   principal, `@id`s and orphans are left alone; a second start writes
 *   nothing; with the identity store down the pass is postponed and said so;
 * - a deleted account's notes are never a new same-named account's.
 *
 * Sabotage checks (each turned its test red once): storing `ctx.username` in
 * addFootnote / addComment; `return false` at the top of isCreator /
 * isAuthor's @id branch; skipping `this.markNeedsAttention(reason)`; leaving
 * the name in place instead of `orphan:<name>` in convertReference (the new
 * bob then owns old bob's notes); rethrowing in the conversion's catch (a
 * lookup that fails mid-pass then stops the manager starting); removing the
 * `migrated` special case in the footnote conversion (17k orphans, and an account
 * named migrated gains them).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import FootnoteManager from '../FootnoteManager';
import CommentManager from '../CommentManager';
import type { WikiEngine } from '../../types/WikiEngine';
import { fakeIdentityManager, type FakeIdentities } from '../../test-support/identities';

const IDS: Record<string, string> = {
  alice: 'urn:uuid:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  bob: 'urn:uuid:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
};

let tmpDir: string;

function engine(identities: FakeIdentities): WikiEngine {
  const config = {
    getProperty: (_k: string, d: unknown) => d,
    getResolvedDataPath: () => tmpDir
  };
  const audit = { logAuditEvent: async () => 'id' };
  return {
    getManager: (name: string) => (name === 'ConfigurationManager' ? config : name === 'IdentityManager' ? identities : name === 'AuditManager' ? audit : null)
  };
}

const subject = (username: string) => ({ username, roles: ['editor'], isAuthenticated: true });
const pub = (uuid: string) => ({ name: uuid, uuid });
const status = (m: { getManagerStatus(): { state: string; reason?: string } }) => m.getManagerStatus();

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-ids-'));
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('#2041 footnotes', () => {
  test('a new footnote names its creator by identity @id; a name with no account as given', async () => {
    const fm = new FootnoteManager(engine(fakeIdentityManager(IDS)));
    await fm.initialize();
    const mine = await fm.addFootnote(pub('p1'), { display: 'd', url: 'https://x.test/', note: 'n' }, subject('alice'));
    expect(mine.createdBy).toBe(IDS.alice);
    const job = await fm.addFootnote(pub('p1'), { display: 'd', url: 'https://x.test/', note: 'n' }, subject('nobody'));
    expect(job.createdBy).toBe('nobody');
  });

  test('isCreator matches the caller by @id, or by username on a footnote not yet converted, and never an orphan', async () => {
    const fm = new FootnoteManager(engine(fakeIdentityManager(IDS)));
    await fm.initialize();
    expect(await fm.isCreator({ createdBy: IDS.alice }, subject('alice'))).toBe(true);
    expect(await fm.isCreator({ createdBy: IDS.alice }, subject('bob'))).toBe(false);
    expect(await fm.isCreator({ createdBy: 'alice' }, subject('alice'))).toBe(true);
    expect(await fm.isCreator({ createdBy: 'alice' }, subject('bob'))).toBe(false);
    expect(await fm.isCreator({ createdBy: 'orphan:alice' }, subject('alice'))).toBe(false);
    // Even an account made before #2041 reserved the prefix, named exactly like the orphan.
    expect(await fm.isCreator({ createdBy: 'orphan:alice' }, subject('orphan:alice'))).toBe(false);
  });

  test('start-up converts the public folder once, orphans and reports a name with no account, and is safe to run twice', async () => {
    const file = path.join(tmpDir, 'p2.json');
    const before = {
      1: { id: '1', display: '', url: '', note: 'a', createdBy: 'alice', createdAt: 't' },
      2: { id: '2', display: '', url: '', note: 'b', createdBy: 'gone', createdAt: 't' },
      3: { id: '3', display: '', url: '', note: 'c', createdBy: 'anonymous', createdAt: 't' },
      4: { id: '4', display: '', url: '', note: 'd', createdBy: 'system', createdAt: 't' },
      5: { id: '5', display: '', url: '', note: 'e', createdBy: IDS.bob, createdAt: 't' }
    };
    fs.writeFileSync(file, JSON.stringify(before));
    const first = new FootnoteManager(engine(fakeIdentityManager(IDS)));
    await first.initialize();
    const after = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, { createdBy: string }>;
    expect(Object.values(after).map((n) => n.createdBy)).toEqual([IDS.alice, 'orphan:gone', 'anonymous', 'system', IDS.bob]);
    // #2097: an orphan is the intended final state: logged at info, never needs-attention.
    expect(status(first).state).not.toBe('degraded');

    const identities = fakeIdentityManager(IDS);
    const mtime = fs.statSync(file).mtimeMs;
    const second = new FootnoteManager(engine(identities));
    await second.initialize();
    expect(fs.statSync(file).mtimeMs).toBe(mtime);
    expect(identities.lookups).toEqual([]);
  });

  test('the legacy "migrated" creator is orphan:migrated, not counted as needs-attention, not looked up, and never an account named migrated', async () => {
    const file = path.join(tmpDir, 'p-mig.json');
    const note = (id: string, createdBy: string) => ({ id, display: '', url: '', note: id, createdBy, createdAt: 't' });
    fs.writeFileSync(file, JSON.stringify({ 1: note('1', 'migrated'), 2: note('2', 'orphan:migrated'), 3: note('3', 'alice') }));
    // Someone registered the username "migrated".
    const accounts = { ...IDS, migrated: 'urn:uuid:dddddddd-dddd-4ddd-8ddd-dddddddddddd' };
    const identities = fakeIdentityManager(accounts);
    const fm = new FootnoteManager(engine(identities));
    await fm.initialize();
    const after = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, { createdBy: string }>;
    expect(Object.values(after).map((n) => n.createdBy)).toEqual(['orphan:migrated', 'orphan:migrated', IDS.alice]);
    expect(identities.lookups).toEqual(['alice']);
    expect(status(fm).state).not.toBe('degraded');
    expect(await fm.isCreator(after[1] as never, subject('migrated'))).toBe(false);
    // Not yet converted (a vault page's): still nobody's.
    expect(await fm.isCreator({ createdBy: 'migrated' }, subject('migrated'))).toBe(false);
  });

  test('a real orphan is not needs-attention either (#2097: the intended final state)', async () => {
    const file = path.join(tmpDir, 'p-mix.json');
    const note = (id: string, createdBy: string) => ({ id, display: '', url: '', note: id, createdBy, createdAt: 't' });
    fs.writeFileSync(file, JSON.stringify({ 1: note('1', 'migrated'), 2: note('2', 'gone') }));
    const fm = new FootnoteManager(engine(fakeIdentityManager(IDS)));
    await fm.initialize();
    expect(status(fm).state).not.toBe('degraded');
  });

  test('the identity store down: start-up converts nothing and says so; a new footnote is still written', async () => {
    const file = path.join(tmpDir, 'p3.json');
    fs.writeFileSync(file, JSON.stringify({ 1: { id: '1', display: '', url: '', note: 'a', createdBy: 'alice', createdAt: 't' } }));
    const fm = new FootnoteManager(engine(fakeIdentityManager(IDS, { down: true })));
    await fm.initialize();
    expect((JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, { createdBy: string }>)['1'].createdBy).toBe('alice');
    expect(status(fm)).toMatchObject({ state: 'degraded', reason: expect.stringContaining('identity store unavailable, conversion postponed') });
    const written = await fm.addFootnote(pub('p4'), { display: 'd', url: 'https://x.test/', note: 'n' }, subject('alice'));
    expect(written.createdBy).toBe('alice');
  });
  test('a lookup that fails mid-pass postpones the conversion and changes nothing', async () => {
    const file = path.join(tmpDir, 'p5.json');
    fs.writeFileSync(file, JSON.stringify({ 1: { id: '1', display: '', url: '', note: 'a', createdBy: 'alice', createdAt: 't' } }));
    const fm = new FootnoteManager(engine(fakeIdentityManager(IDS, { failLookups: true })));
    // Sabotage check: rethrowing in the catch stops initialize.
    await fm.initialize();
    expect((JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, { createdBy: string }>)['1'].createdBy).toBe('alice');
    expect(status(fm)).toMatchObject({ state: 'degraded', reason: expect.stringContaining('identity store unavailable, conversion postponed') });
  });
});

describe('#2041 comments', () => {
  test('a new comment names its author by identity @id, and its display name is unchanged', async () => {
    const cm = new CommentManager(engine(fakeIdentityManager(IDS)));
    await cm.initialize();
    const c = await cm.addComment(pub('p3'), { ...subject('alice'), displayName: 'Alice A' }, 'hi');
    expect(c).toMatchObject({ author: IDS.alice, authorDisplayName: 'Alice A' });
    expect(await cm.isAuthor(c, subject('alice'))).toBe(true);
    expect(await cm.isAuthor(c, subject('bob'))).toBe(false);
    expect(await cm.isAuthor({ author: 'bob' }, subject('bob'))).toBe(true);
    expect(await cm.isAuthor({ author: 'orphan:bob' }, subject('bob'))).toBe(false);
    expect(await cm.isAuthor({ author: 'orphan:bob' }, subject('orphan:bob'))).toBe(false);
  });

  test('start-up converts the public folder once, orphans and reports a name with no account, and is safe to run twice', async () => {
    const dir = path.join(tmpDir, 'p4');
    fs.mkdirSync(dir, { recursive: true });
    const write = (id: string, author: string) => fs.writeFileSync(path.join(dir, `${id}.json`),
      JSON.stringify({ id, pageUuid: 'p4', author, authorDisplayName: 'Shown', content: 'x', createdAt: 't', deletedBy: 'alice' }));
    write('c1', 'alice');
    write('c2', 'gone');
    write('c3', IDS.bob);
    const first = new CommentManager(engine(fakeIdentityManager(IDS)));
    await first.initialize();
    const read = (id: string) => JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')) as { author: string; authorDisplayName: string; deletedBy: string };
    expect(read('c1')).toMatchObject({ author: IDS.alice, authorDisplayName: 'Shown', deletedBy: 'alice' });
    expect(read('c2').author).toBe('orphan:gone');
    expect(read('c3').author).toBe(IDS.bob);
    // #2097: an orphan is the intended final state: logged at info, never needs-attention.
    expect(status(first).state).not.toBe('degraded');

    const identities = fakeIdentityManager(IDS);
    const second = new CommentManager(engine(identities));
    await second.initialize();
    expect(identities.lookups).toEqual([]);
    expect(read('c1').author).toBe(IDS.alice);
  });

  test.each([{ down: true }, { failLookups: true }])('the identity store down (%o): start-up converts nothing and says so; a new comment is still written', async (opts) => {
    const dir = path.join(tmpDir, 'p5');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'c1.json'), JSON.stringify({ id: 'c1', pageUuid: 'p5', author: 'alice', authorDisplayName: 'A', content: 'x', createdAt: 't' }));
    const cm = new CommentManager(engine(fakeIdentityManager(IDS, opts)));
    await cm.initialize();
    expect(status(cm)).toMatchObject({ state: 'degraded', reason: expect.stringContaining('identity store unavailable, conversion postponed') });
    const c = await cm.addComment(pub('p6'), subject('alice'), 'hi');
    expect(c.author).toBe('alice');
  });
});

describe('#2041 a deleted account\'s notes are never a new same-named account\'s', () => {
  test('delete bob, convert, create a new bob, restart: the new bob owns nothing of old bob\'s', async () => {
    // Written by the old bob, before #2041 (usernames).
    fs.writeFileSync(path.join(tmpDir, 'page-a.json'), JSON.stringify({ 1: { id: '1', display: '', url: '', note: 'old', createdBy: 'bob', createdAt: 't' } }));
    fs.mkdirSync(path.join(tmpDir, 'page-a'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'page-a', 'c1.json'), JSON.stringify({ id: 'c1', pageUuid: 'page-a', author: 'bob', authorDisplayName: 'Bob', content: 'old', createdAt: 't' }));

    // bob's account is deleted; the conversion runs at the next start.
    const accounts: Record<string, string> = { alice: IDS.alice };
    const fm1 = new FootnoteManager(engine(fakeIdentityManager(accounts)));
    const cm1 = new CommentManager(engine(fakeIdentityManager(accounts)));
    await fm1.initialize();
    await cm1.initialize();

    // A new account takes the name bob; the site restarts.
    accounts.bob = 'urn:uuid:cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const fm2 = new FootnoteManager(engine(fakeIdentityManager(accounts)));
    const cm2 = new CommentManager(engine(fakeIdentityManager(accounts)));
    await fm2.initialize();
    await cm2.initialize();

    const newBob = subject('bob');
    const [footnote] = await fm2.getFootnotes(pub('page-a'), newBob);
    const [comment] = await cm2.getComments(pub('page-a'), newBob);
    expect(footnote.createdBy).toBe('orphan:bob');
    expect(comment.author).toBe('orphan:bob');
    expect(await fm2.isCreator(footnote, newBob)).toBe(false);
    expect(await cm2.isAuthor(comment, newBob)).toBe(false);
    expect(status(fm2).state).not.toBe('degraded');
    expect(status(cm2).state).not.toBe('degraded');
  });
});
