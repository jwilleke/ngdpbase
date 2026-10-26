/**
 * #2041 (identity model step 6): footnotes and comments refer to their
 * creator by identity `@id`, never a username.
 *
 * - a new footnote's `createdBy` and a new comment's `author` are the
 *   caller's `@id`; a name with no account is stored as given;
 * - "is it mine" is the manager's answer (`isCreator`, `isAuthor`): the
 *   caller's `@id`, or their username on a note not yet converted (a vault
 *   page's, which start-up does not open);
 * - at start-up the public folder is converted once: known usernames become
 *   `@id`s, one write per file; an unknown one is left as it is and reported
 *   (log line, needs-attention, counts only); `anonymous`, the system
 *   principal and values already `urn:` are left alone; a second start
 *   writes nothing.
 *
 * Sabotage checks (each turned its test red once): storing `ctx.username` in
 * addFootnote / addComment; `return false` at the top of isCreator /
 * isAuthor's @id branch; skipping `this.markNeedsAttention(reason)`; dropping
 * the `startsWith(IDENTITY_ID_PREFIX)` skip (the second start then looks the
 * @id up as a username and reports it unknown).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import FootnoteManager from '../FootnoteManager';
import CommentManager from '../CommentManager';
import type { WikiEngine } from '../../types/WikiEngine';

const IDS: Record<string, string> = {
  alice: 'urn:uuid:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  bob: 'urn:uuid:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
};

let tmpDir: string;
let lookups: string[];

function engine(): WikiEngine {
  const config = {
    getProperty: (_k: string, d: unknown) => d,
    getResolvedDataPath: () => tmpDir
  };
  const identities = {
    getByUserIdentifier: async (_ctx: unknown, username: string) => {
      lookups.push(username);
      return IDS[username] ? { '@id': IDS[username], identifier: username } : null;
    }
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
  lookups = [];
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('#2041 footnotes', () => {
  test('a new footnote names its creator by identity @id; a name with no account as given', async () => {
    const fm = new FootnoteManager(engine());
    await fm.initialize();
    const mine = await fm.addFootnote(pub('p1'), { display: 'd', url: 'https://x.test/', note: 'n' }, subject('alice'));
    expect(mine.createdBy).toBe(IDS.alice);
    const job = await fm.addFootnote(pub('p1'), { display: 'd', url: 'https://x.test/', note: 'n' }, subject('nobody'));
    expect(job.createdBy).toBe('nobody');
  });

  test('isCreator matches the caller by @id, or by username on a footnote not yet converted', async () => {
    const fm = new FootnoteManager(engine());
    await fm.initialize();
    expect(await fm.isCreator({ createdBy: IDS.alice }, subject('alice'))).toBe(true);
    expect(await fm.isCreator({ createdBy: IDS.alice }, subject('bob'))).toBe(false);
    expect(await fm.isCreator({ createdBy: 'alice' }, subject('alice'))).toBe(true);
    expect(await fm.isCreator({ createdBy: 'alice' }, subject('bob'))).toBe(false);
  });

  test('start-up converts the public folder once, leaves and reports an unknown name, and is safe to run twice', async () => {
    const file = path.join(tmpDir, 'p2.json');
    const before = {
      1: { id: '1', display: '', url: '', note: 'a', createdBy: 'alice', createdAt: 't' },
      2: { id: '2', display: '', url: '', note: 'b', createdBy: 'gone', createdAt: 't' },
      3: { id: '3', display: '', url: '', note: 'c', createdBy: 'anonymous', createdAt: 't' },
      4: { id: '4', display: '', url: '', note: 'd', createdBy: 'system', createdAt: 't' },
      5: { id: '5', display: '', url: '', note: 'e', createdBy: IDS.bob, createdAt: 't' }
    };
    fs.writeFileSync(file, JSON.stringify(before));
    const first = new FootnoteManager(engine());
    await first.initialize();
    const after = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, { createdBy: string }>;
    expect(Object.values(after).map((n) => n.createdBy)).toEqual([IDS.alice, 'gone', 'anonymous', 'system', IDS.bob]);
    expect(status(first)).toMatchObject({ state: 'degraded', reason: expect.stringMatching(/^1 footnote\(s\) name a creator by a username that has no account/) });
    // Counts only: the unknown name is not in the report.
    expect(status(first).reason).not.toContain('gone');

    lookups = [];
    const mtime = fs.statSync(file).mtimeMs;
    const second = new FootnoteManager(engine());
    await second.initialize();
    expect(fs.statSync(file).mtimeMs).toBe(mtime);
    expect(lookups).toEqual(['gone']);
  });
});

describe('#2041 comments', () => {
  test('a new comment names its author by identity @id, and its display name is unchanged', async () => {
    const cm = new CommentManager(engine());
    await cm.initialize();
    const c = await cm.addComment(pub('p3'), { ...subject('alice'), displayName: 'Alice A' }, 'hi');
    expect(c).toMatchObject({ author: IDS.alice, authorDisplayName: 'Alice A' });
    expect(await cm.isAuthor(c, subject('alice'))).toBe(true);
    expect(await cm.isAuthor(c, subject('bob'))).toBe(false);
    expect(await cm.isAuthor({ author: 'bob' }, subject('bob'))).toBe(true);
  });

  test('start-up converts the public folder once, leaves and reports an unknown name, and is safe to run twice', async () => {
    const dir = path.join(tmpDir, 'p4');
    fs.mkdirSync(dir, { recursive: true });
    const write = (id: string, author: string) => fs.writeFileSync(path.join(dir, `${id}.json`),
      JSON.stringify({ id, pageUuid: 'p4', author, authorDisplayName: 'Shown', content: 'x', createdAt: 't', deletedBy: 'alice' }));
    write('c1', 'alice');
    write('c2', 'gone');
    write('c3', IDS.bob);
    const first = new CommentManager(engine());
    await first.initialize();
    const read = (id: string) => JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')) as { author: string; authorDisplayName: string; deletedBy: string };
    expect(read('c1')).toMatchObject({ author: IDS.alice, authorDisplayName: 'Shown', deletedBy: 'alice' });
    expect(read('c2').author).toBe('gone');
    expect(read('c3').author).toBe(IDS.bob);
    expect(status(first)).toMatchObject({ state: 'degraded', reason: expect.stringMatching(/^1 comment\(s\) name an author by a username that has no account/) });

    lookups = [];
    const second = new CommentManager(engine());
    await second.initialize();
    expect(lookups).toEqual(['gone']);
    expect(read('c1').author).toBe(IDS.alice);
  });
});
