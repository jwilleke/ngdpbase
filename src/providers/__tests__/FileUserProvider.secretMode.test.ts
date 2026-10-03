/**
 * #1560 — the user store holds password hashes: written 0600 in a 0700
 * directory, and an existing world-readable users.json is tightened at boot.
 * A temp directory only, removed afterwards.
 */
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
vi.unmock('../../providers/FileUserProvider');
vi.unmock('./src/providers/FileUserProvider');

const { default: FileUserProvider } = await vi.importActual<{ default: typeof import('../FileUserProvider').default }>('../FileUserProvider');

let dir: string;
const engine = () => ({
  getManager: (name: string) => (name === 'ConfigurationManager'
    ? {
      getResolvedDataPath: () => dir,
      getProperty: (key: string, fallback: unknown) =>
        key === 'ngdpbase.user.provider.files.users' ? 'users.json'
          : key === 'ngdpbase.user.provider.files.sessions' ? 'sessions.json' : fallback
    }
    : null)
}) as never;
const mode = async (p: string): Promise<number> => (await fs.stat(p)).mode & 0o777;

describe('FileUserProvider keeps the user store owner-only (#1560)', () => {
  beforeEach(async () => { dir = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'ngdpbase-1560-u-')), 'users'); });
  afterEach(async () => {
    // Only the per-test temp directory — never a live data tree.
    await fs.rm(path.dirname(dir), { recursive: true, force: true });
  });

  test('a new store: directory 700, users.json written 600', async () => {
    const p = new FileUserProvider(engine());
    await p.initialize();
    await p.createUser({ username: 'molly', password: 'scrypt$x', displayName: 'Molly' });
    expect(await mode(dir)).toBe(0o700);
    expect(await mode(path.join(dir, 'users.json'))).toBe(0o600);
  });

  test('an existing world-readable users.json is tightened at boot', async () => {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'users.json'), '{}');
    await fs.chmod(path.join(dir, 'users.json'), 0o644);
    await new FileUserProvider(engine()).initialize();
    expect(await mode(path.join(dir, 'users.json'))).toBe(0o600);
  });
});
