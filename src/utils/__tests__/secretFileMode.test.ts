/**
 * #1560 — secret files are owner-only. Works in its own temp directory and
 * removes only that.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chmodSecretFile, ensureSecretDir, secureExistingSecretFile } from '../secretFileMode';

const mode = (p: string): number => fs.statSync(p).mode & 0o777;

describe('secret file modes (#1560)', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1560-')); });
  afterEach(() => {
    vi.restoreAllMocks();
    // Only the per-test temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('a world-readable secret file is tightened to 600, and says so', () => {
    const f = path.join(dir, 'users.json');
    fs.writeFileSync(f, '{}', { mode: 0o644 });
    fs.chmodSync(f, 0o644);
    expect(secureExistingSecretFile(f)).toMatch(/Tightened .*users\.json from 644 to 600/);
    expect(mode(f)).toBe(0o600);
  });

  test('an owner-only file is left alone; a missing one is fine', () => {
    const f = path.join(dir, 'ok.json');
    fs.writeFileSync(f, '{}');
    fs.chmodSync(f, 0o600);
    expect(secureExistingSecretFile(f)).toBeNull();
    expect(secureExistingSecretFile(path.join(dir, 'absent.json'))).toBeNull();
  });

  test('a file owned by another account refuses, naming both UIDs', () => {
    const f = path.join(dir, 'users.json');
    fs.writeFileSync(f, '{}');
    if (typeof process.getuid !== 'function') return; // no UIDs on this platform
    const real = fs.statSync;
    vi.spyOn(fs, 'statSync').mockImplementation(((p: fs.PathLike) => Object.assign(real(p), { uid: process.getuid() + 1 })));
    expect(() => secureExistingSecretFile(f)).toThrow(new RegExp(`owned by UID ${process.getuid() + 1}, but the server runs as UID ${process.getuid()}`));
  });

  test('a secret directory is created, and tightened, owner-only', () => {
    const d = path.join(dir, 'users');
    expect(ensureSecretDir(d)).toBeNull();
    expect(mode(d)).toBe(0o700);
    fs.chmodSync(d, 0o755);
    ensureSecretDir(d);
    expect(mode(d)).toBe(0o700);
  });

  test('chmodSecretFile makes a written file owner-only', () => {
    const f = path.join(dir, 'backup.json.gz');
    fs.writeFileSync(f, 'x');
    fs.chmodSync(f, 0o644);
    expect(chmodSecretFile(f)).toBeNull();
    expect(mode(f)).toBe(0o600);
  });
});
