/**
 * #2466: what start-up may fix on its own. A rule's `priority` is removed; a
 * page's `access:` becomes an Author Lock only when `edit` is limited to admin
 * alone and that lets in exactly the people the old limit did. Nothing becomes
 * an Audience.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  adminsAreRoleAdmin,
  backUpBeforeRewrite,
  clipText,
  CouldNotTellError,
  exactReplacement,
  failureForLog,
  readSignInDone,
  SIGN_IN_DONE_FILE,
  writeSignInDone,
  stripPolicyPriority,
  withReplacement,
  type SiteFacts
} from '../upgradeLeftovers';

const adminRule = { id: 'admin-full-access', effect: 'allow', subjects: [{ type: 'role', value: 'admin' }], actions: ['admin-system', 'page-read'] };

describe('stripPolicyPriority (R1)', () => {
  test('removes priority from each rule that has one and names it', () => {
    const rules = [{ id: 'a', effect: 'allow', priority: 100 }, { id: 'b', effect: 'deny' }, { effect: 'deny', priority: 0 }];
    const { policies, removed } = stripPolicyPriority(rules);
    expect(removed).toEqual(['a', 'rule 3']);
    expect(policies).toEqual([{ id: 'a', effect: 'allow' }, { id: 'b', effect: 'deny' }, { effect: 'deny' }]);
  });

  test('a priority of 0 or null still counts as present', () => {
    expect(stripPolicyPriority([{ id: 'z', priority: 0 }, { id: 'n', priority: null }]).removed).toEqual(['z', 'n']);
  });

  test('does not change its input, and a list without priority comes back as it is (idempotent)', () => {
    const rules = [{ id: 'a', priority: 1 }];
    const first = stripPolicyPriority(rules);
    expect(rules).toEqual([{ id: 'a', priority: 1 }]);
    const second = stripPolicyPriority(first.policies);
    expect(second.removed).toEqual([]);
    expect(second.policies).toBe(first.policies);
  });

  test('anything that is not a list of rules is returned untouched', () => {
    expect(stripPolicyPriority(undefined)).toEqual({ policies: undefined, removed: [] });
    expect(stripPolicyPriority([null, 'x', 3]).removed).toEqual([]);
  });
});

describe('adminsAreRoleAdmin', () => {
  test('true when the only rule that grants admin-system names the admin role', () => {
    expect(adminsAreRoleAdmin([adminRule, { id: 'r', effect: 'allow', subjects: [{ type: 'role', value: 'reader' }], actions: ['page-read'] }])).toBe(true);
  });

  test('false when another rule gives admin-system to someone else, or a wildcard action reaches it', () => {
    expect(adminsAreRoleAdmin([adminRule, { id: 'x', effect: 'allow', subjects: [{ type: 'user', value: 'bob' }], actions: ['admin-system'] }])).toBe(false);
    expect(adminsAreRoleAdmin([adminRule, { id: 'w', effect: 'allow', subjects: [{ type: 'role', value: 'editor' }], actions: ['*'] }])).toBe(false);
  });

  test('false when the admin rule has a condition, or no rule grants it, or the rules cannot be read', () => {
    expect(adminsAreRoleAdmin([{ ...adminRule, condition: { fn: 'eq' } }])).toBe(false);
    expect(adminsAreRoleAdmin([{ id: 'r', effect: 'allow', subjects: [{ type: 'role', value: 'reader' }], actions: ['page-read'] }])).toBe(false);
    expect(adminsAreRoleAdmin(undefined)).toBe(false);
  });
});

describe('exactReplacement (R2, R3)', () => {
  const site = (over: Partial<SiteFacts> = {}): SiteFacts => ({ adminsAreRoleAdmin: true, authorHoldsAdmin: async () => true, ...over });

  test('edit limited to admin alone is an Author Lock', async () => {
    const r = await exactReplacement({ access: { edit: ['admin'] }, author: 'urn:uuid:1' }, site());
    expect(r).toEqual({ kind: 'author-lock', set: { 'author-lock': true } });
  });

  test('edit limited to admin on a page with no author is an Author Lock', async () => {
    expect((await exactReplacement({ access: { edit: ['admin'] } }, site()))?.kind).toBe('author-lock');
  });

  test('an Author Lock would let a non-admin author in, so there is none', async () => {
    expect(await exactReplacement({ access: { edit: ['admin'] }, author: 'urn:uuid:1' }, site({ authorHoldsAdmin: async () => false }))).toBeNull();
  });

  test('view and edit naming the same people is not converted: an Audience lets a listed person view past the site\'s access rules', async () => {
    expect(await exactReplacement({ access: { view: ['admin', 'editor'], edit: ['editor', 'admin'] } }, site())).toBeNull();
    expect(await exactReplacement({ access: { view: ['admin'], edit: ['admin'] } }, site())).toBeNull();
  });

  test.each([
    ['view alone (an Audience would also stop outsiders changing it)', { view: ['admin', 'editor'] }],
    ['view and edit naming different people', { view: ['admin', 'editor'], edit: ['admin'] }],
    ['both lists without admin (the old limit bound administrators too)', { view: ['editor'], edit: ['editor'] }],
    ['edit limited to someone other than admin', { edit: ['editor'] }],
    ['edit naming admin and others without view', { edit: ['admin', 'editor'] }],
    ['an action Audience cannot express', { edit: ['admin'], delete: ['admin'] }],
    ['an action Audience cannot express, alone', { publish: ['admin'] }],
    ['no list at all', { edit: [] }],
    ['a list that is not names', { edit: [{ role: 'admin' }] }],
    ['an access that is not a table', ['admin']]
  ])('no replacement for %s', async (_why, access) => {
    expect(await exactReplacement({ access }, site())).toBeNull();
  });

  test('no replacement where administrators are not provably the admin role', async () => {
    expect(await exactReplacement({ access: { edit: ['admin'] } }, site({ adminsAreRoleAdmin: false }))).toBeNull();
  });
});

describe('withReplacement', () => {
  test('takes access out, puts the replacement in and keeps every other field', () => {
    const out = withReplacement({ title: 'T', access: { edit: ['admin'] }, tags: ['a'] }, { kind: 'author-lock', set: { 'author-lock': true } });
    expect(out).toEqual({ title: 'T', tags: ['a'], 'author-lock': true });
  });
});

describe('backUpBeforeRewrite (R6)', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upgrade-backup-2466-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('writes the text as it was, owner-only, and never over an earlier copy', () => {
    const when = new Date('2026-11-22T10:00:00Z');
    const first = backUpBeforeRewrite(path.join(dir, 'b'), 'Board Notes.md', 'old text', when);
    expect(fs.readFileSync(first, 'utf8')).toBe('old text');
    if (process.platform !== 'win32') expect(fs.statSync(first).mode & 0o077).toBe(0);
    expect(() => backUpBeforeRewrite(path.join(dir, 'b'), 'Board Notes.md', 'other', when)).toThrow();
    expect(fs.readFileSync(first, 'utf8')).toBe('old text');
  });

  test('an existing folder with wider permissions is made owner-only', () => {
    if (process.platform === 'win32') return;
    fs.mkdirSync(path.join(dir, 'b'), { mode: 0o755 });
    fs.chmodSync(path.join(dir, 'b'), 0o755);
    backUpBeforeRewrite(path.join(dir, 'b'), 'x.md', 'x');
    expect(fs.statSync(path.join(dir, 'b')).mode & 0o077).toBe(0);
  });

  test('a name with path characters stays inside the folder', () => {
    const file = backUpBeforeRewrite(path.join(dir, 'b'), '../../etc/passwd', 'x');
    expect(path.dirname(file)).toBe(path.join(dir, 'b'));
  });
});

describe('clipText', () => {
  test('cuts long text at 200 characters and says it was cut', () => {
    const out = clipText('x'.repeat(500));
    expect(out).toBe(`${'x'.repeat(200)}...`);
    expect(clipText('short')).toBe('short');
  });

  test('line breaks and other control characters become a space, so a value cannot start a line of its own', () => {
    expect(clipText('a\nb\r\nc\u0000d\u2028e')).toBe('a b c d e');
  });

  test('an error gives its message, and anything else its text', () => {
    expect(clipText(new Error('disk full'))).toBe('disk full');
    expect(clipText(new Error('y'.repeat(300))).length).toBe(203);
    expect(clipText(undefined)).toBe('undefined');
  });
});

describe('a fact that could not be looked up is not a "no" (#2466)', () => {
  test('rules that are not loaded: exactReplacement throws CouldNotTellError for a page with a limit, and not for one without', async () => {
    const site: SiteFacts = { adminsAreRoleAdmin: null, authorHoldsAdmin: async () => true };
    await expect(exactReplacement({ access: { edit: ['admin'] } }, site)).rejects.toBeInstanceOf(CouldNotTellError);
    expect(await exactReplacement({}, site)).toBeNull();
  });
});

describe('failureForLog', () => {
  test('is the error class and its code, never its message', () => {
    expect(failureForLog(Object.assign(new Error("no space for 'Secret Plans'"), { code: 'ENOSPC' }))).toBe('Error (ENOSPC)');
    expect(failureForLog(new TypeError('Secret Plans'))).toBe('TypeError');
    expect(failureForLog('Secret Plans')).toBe('string');
  });
});

describe('readSignInDone', () => {
  let folder: string;
  beforeEach(() => { folder = fs.mkdtempSync(path.join(os.tmpdir(), 'signin-done-2466-')); });
  afterEach(() => { fs.rmSync(folder, { recursive: true, force: true }); });
  const put = (text: string): void => fs.writeFileSync(path.join(folder, SIGN_IN_DONE_FILE), text);

  test('a record that is not there is an empty one', () => {
    expect([...(readSignInDone(folder) ?? ['unreadable'])]).toEqual([]);
  });
  test('a record that is there is read, and written back whole', () => {
    writeSignInDone(folder, new Set(['bob', 'ann']));
    expect([...(readSignInDone(folder) ?? [])]).toEqual(['ann', 'bob']);
  });
  test('a record that is there but cannot be read or understood is null, so it is not written over', () => {
    put('{"users": ["ann"');
    expect(readSignInDone(folder)).toBeNull();
    put('{"users": "ann"}');
    expect(readSignInDone(folder)).toBeNull();
    put('[]');
    expect(readSignInDone(folder)).toBeNull();
  });
  test('a path that is a folder cannot be read: null', () => {
    fs.mkdirSync(path.join(folder, SIGN_IN_DONE_FILE));
    expect(readSignInDone(folder)).toBeNull();
  });
});
