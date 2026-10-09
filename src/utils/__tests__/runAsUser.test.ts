/**
 * #1693 — the run-as user is a setting (PUID/PGID), required, never root.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { becomeRunAsUser } from '../runAsUser';

/** A process stand-in: starts as `uid:gid`, records the switch. */
function ids(uid: number, gid: number) {
  const calls: string[] = [];
  const p = {
    uid, gid, calls,
    getuid() { return this.uid; },
    getgid() { return this.gid; },
    setuid(id: number) { calls.push(`setuid ${id}`); this.uid = id; },
    setgid(id: number) { calls.push(`setgid ${id}`); this.gid = id; },
    setgroups(g: number[]) { calls.push(`setgroups ${g.join(',')}`); }
  };
  return p;
}

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runas-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('#1693 PUID/PGID are required', () => {
  test.each([
    [{}, /PUID is not set/],
    [{ PUID: '1000' }, /PGID is not set/],
    [{ PUID: 'abc', PGID: '1000' }, /not a numeric id/],
    [{ PUID: '0', PGID: '1000' }, /PUID=0 is root/],
    [{ PUID: '1000', PGID: '0' }, /PGID=0 is root/]
  ])('%j refuses', (env, message) => {
    expect(() => becomeRunAsUser(env as NodeJS.ProcessEnv, dir, undefined, ids(1000, 1000))).toThrow(message);
  });

  test('the refusal says what to set, and names the standard default', () => {
    expect(() => becomeRunAsUser({}, dir, undefined, ids(1000, 1000))).toThrow(/PUID=1000 and PGID=1000/);
  });

  test('no user ids on this platform: nothing to do', () => {
    expect(becomeRunAsUser({}, dir, undefined, null)).toBeNull();
  });
});

describe('#1693 started as root: switch to PUID/PGID', () => {
  test('switches group first, then user, and never stays root', () => {
    const p = ids(0, 0);
    vi.spyOn(fs, 'lchownSync').mockImplementation(() => undefined);
    const r = becomeRunAsUser({ PUID: '977', PGID: '988' }, dir, undefined, p);
    expect(p.calls).toEqual(['setgroups 988', 'setgid 988', 'setuid 977']);
    expect(r).toMatchObject({ uid: 977, gid: 988 });
    vi.restoreAllMocks();
  });

  test('re-owns the data folder when it is not PUID:PGID, and says so', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'X=1');
    const chowned: string[] = [];
    vi.spyOn(fs, 'lchownSync').mockImplementation((p) => { chowned.push(String(p)); });
    const r = becomeRunAsUser({ PUID: '977', PGID: '988' }, dir, undefined, ids(0, 0));
    expect(chowned).toEqual(expect.arrayContaining([path.resolve(dir), path.join(path.resolve(dir), '.env')]));
    expect(r?.notes.join('\n')).toMatch(/Gave .* to 977:988/);
    vi.restoreAllMocks();
  });

  test('a filesystem that refuses the change (NFS) is reported, not fatal', () => {
    vi.spyOn(fs, 'lchownSync').mockImplementation(() => { throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' }); });
    const p = ids(0, 0);
    const r = becomeRunAsUser({ PUID: '977', PGID: '988' }, dir, undefined, p);
    expect(r?.notes.join('\n')).toMatch(/Could not give .*EPERM/);
    expect(p.calls).toContain('setuid 977');
    vi.restoreAllMocks();
  });

  test('a data folder already PUID:PGID is left alone', () => {
    const st = fs.statSync(dir);
    const lchown = vi.spyOn(fs, 'lchownSync');
    becomeRunAsUser({ PUID: String(st.uid), PGID: String(st.gid) }, dir, undefined, ids(0, 0));
    expect(lchown).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe('#1695 the hand-over walks the whole folder and finishes what it started', () => {
  /** Pretend some paths already belong to `owner`; everything else keeps its real owner. */
  function ownedBy(owner: { uid: number; gid: number }, paths: string[]) {
    const real = fs.lstatSync;
    return vi.spyOn(fs, 'lstatSync').mockImplementation(((p: fs.PathLike) => {
      const st = real(p);
      return paths.includes(String(p)) ? Object.assign(Object.create(Object.getPrototypeOf(st)), st, owner) : st;
    }) as typeof fs.lstatSync);
  }

  test('an entry that cannot be changed is skipped and named; the walk goes on', () => {
    const data = path.resolve(dir);
    fs.mkdirSync(path.join(data, 'organizations'));
    fs.writeFileSync(path.join(data, 'organizations', 'org.json'), '{}');
    fs.mkdirSync(path.join(data, 'users'));
    fs.writeFileSync(path.join(data, 'users', 'users.json'), '{}');
    const readOnly = path.join(data, 'organizations', 'org.json');
    const chowned: string[] = [];
    vi.spyOn(fs, 'lchownSync').mockImplementation((p) => {
      if (String(p) === readOnly) throw Object.assign(new Error('EROFS: read-only file system'), { code: 'EROFS' });
      chowned.push(String(p));
    });
    const r = becomeRunAsUser({ PUID: '977', PGID: '988' }, dir, undefined, ids(0, 0));
    // The ConfigMap-style file did not stop the walk: users/ and its file were reached.
    expect(chowned).toEqual(expect.arrayContaining([path.join(data, 'users'), path.join(data, 'users', 'users.json')]));
    const notes = r?.notes.join('\n') ?? '';
    expect(notes).toMatch(/Could not give 1 entry .*org\.json \(EROFS\)/);
    expect(notes).not.toMatch(/NFS\)\. Continuing/);
    vi.restoreAllMocks();
  });

  test('a top folder already PUID:PGID does not stop an unfinished hand-over below it', () => {
    const data = path.resolve(dir);
    fs.mkdirSync(path.join(data, 'pages'));
    fs.writeFileSync(path.join(data, 'pages', 'a.md'), 'x');
    ownedBy({ uid: 977, gid: 988 }, [data]);
    const chowned: string[] = [];
    vi.spyOn(fs, 'lchownSync').mockImplementation((p) => { chowned.push(String(p)); });
    becomeRunAsUser({ PUID: '977', PGID: '988' }, dir, undefined, ids(0, 0));
    expect(chowned).not.toContain(data);
    expect(chowned).toEqual(expect.arrayContaining([path.join(data, 'pages'), path.join(data, 'pages', 'a.md')]));
    vi.restoreAllMocks();
  });

  test('a long list of failures names five and counts the rest', () => {
    for (let i = 0; i < 8; i++) fs.writeFileSync(path.join(dir, `f${i}`), 'x');
    vi.spyOn(fs, 'lchownSync').mockImplementation(() => { throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); });
    const r = becomeRunAsUser({ PUID: '977', PGID: '988' }, dir, undefined, ids(0, 0));
    expect(r?.notes.join('\n')).toMatch(/Could not give 9 entries .*, and 4 more\./);
    vi.restoreAllMocks();
  });
});

describe('#1693 started as non-root: must already be PUID/PGID', () => {
  test('matching ids start, with no switch', () => {
    const p = ids(977, 988);
    expect(becomeRunAsUser({ PUID: '977', PGID: '988' }, dir, undefined, p)).toMatchObject({ uid: 977, gid: 988 });
    expect(p.calls).toEqual([]);
  });

  test('different ids refuse, naming both and what to set', () => {
    expect(() => becomeRunAsUser({ PUID: '1000', PGID: '1000' }, dir, undefined, ids(977, 988)))
      .toThrow(/running as 977:988, but PUID\/PGID say 1000:1000.*PUID=977 and PGID=988/);
  });
});

describe('#1693 SLOW_STORAGE is checked, never re-owned', () => {
  test('not writable refuses', () => {
    vi.spyOn(fs, 'accessSync').mockImplementation(() => { throw new Error('EACCES'); });
    const st = fs.statSync(dir);
    expect(() => becomeRunAsUser({ PUID: String(st.uid), PGID: String(st.gid) }, dir, dir, ids(st.uid, st.gid))).toThrow(/SLOW_STORAGE\) is not writable/);
    vi.restoreAllMocks();
  });
});
