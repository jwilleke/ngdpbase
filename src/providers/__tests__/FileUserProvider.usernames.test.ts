/**
 * The user index compares names normalized (#1436).
 *
 * `FileUserProvider` used to key its map on the raw string, so `jim`, `Jim`
 * and `" jim "` were three separate accounts and `createUser`'s duplicate
 * check did not see the case variants — a lookalike account could be
 * registered beside an existing one.
 *
 * These use a temp directory of their own and remove only that directory.
 * Nothing here points at `./data` (see the teardown note in CLAUDE.md — a
 * previous test wiped a live data tree).
 */
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
// vitest.setup.ts swaps FileUserProvider for a mock in every test file, which
// is right for the managers that merely need A provider — but these are about
// the real one's index, so this file opts back in.
vi.unmock('../../providers/FileUserProvider');
vi.unmock('./src/providers/FileUserProvider');

const { default: FileUserProvider } = await vi.importActual<{ default: typeof import('../FileUserProvider').default }>(
  '../FileUserProvider'
);

let tempDir: string;

/** An engine whose ConfigurationManager points the provider at the temp dir. */
function engineFor(dir: string) {
  return {
    getManager: (name: string) =>
      name === 'ConfigurationManager'
        ? {
          getResolvedDataPath: () => dir,
          getProperty: (key: string, fallback: unknown) =>
            key === 'ngdpbase.user.provider.files.users' ? 'users.json'
              : key === 'ngdpbase.user.provider.files.sessions' ? 'sessions.json'
                : fallback
        }
        : null
  } as never;
}

async function writeUsers(users: Record<string, unknown>): Promise<void> {
  await fs.writeFile(path.join(tempDir, 'users.json'), JSON.stringify(users, null, 2), 'utf8');
}

const user = (username: string) => ({
  username, email: `${username}@example.test`, roles: ['reader'], isActive: true
});

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdp-users-'));
});

afterEach(async () => {
  // Only this test's own mkdtemp directory, never a data tree.
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('#1436 FileUserProvider username normalization', () => {
  test('a name stored capitalised is found by its lowercase form', async () => {
    await writeUsers({ Jim: user('Jim') });
    const provider = new FileUserProvider(engineFor(tempDir));
    await provider.initialize();

    expect(await provider.getUser('jim')).not.toBeNull();
    expect(await provider.getUser('JIM')).not.toBeNull();
    expect(await provider.getUser('  jim  ')).not.toBeNull();
    expect(await provider.userExists('jim')).toBe(true);
  });

  test('the record keeps the name as typed — normalization is for comparison', async () => {
    await writeUsers({ Jim: user('Jim') });
    const provider = new FileUserProvider(engineFor(tempDir));
    await provider.initialize();

    const found = await provider.getUser('jim');
    expect(found?.username).toBe('Jim');
    expect(await provider.getAllUsernames()).toEqual(['Jim']);
  });

  test('a lookalike account cannot be created beside an existing one', async () => {
    await writeUsers({ jim: user('jim') });
    const provider = new FileUserProvider(engineFor(tempDir));
    await provider.initialize();

    await expect(provider.createUser(user('Jim') as never)).rejects.toThrow(/already exists/i);
    await expect(provider.createUser(user(' jim ') as never)).rejects.toThrow(/already exists/i);
  });

  test('a store holding two names that are one account refuses to load', async () => {
    // Silently keeping whichever loaded last would hand one person the
    // other's record, so the provider stops instead of guessing.
    await writeUsers({ jim: user('jim'), Jim: user('Jim') });
    const provider = new FileUserProvider(engineFor(tempDir));

    await expect(provider.initialize()).rejects.toThrow(/differ only in case or spacing/i);
  });

  test('delete and update reach the record whatever case is asked for', async () => {
    await writeUsers({ Jim: user('Jim') });
    const provider = new FileUserProvider(engineFor(tempDir));
    await provider.initialize();

    await provider.updateUser('jim', { ...user('Jim'), email: 'new@example.test' });
    expect((await provider.getUser('JIM'))?.email).toBe('new@example.test');

    expect(await provider.deleteUser('  jim ')).toBe(true);
    expect(await provider.userExists('Jim')).toBe(false);
  });

  test('a saved store reloads to the same accounts', async () => {
    await writeUsers({ Jim: user('Jim') });
    const first = new FileUserProvider(engineFor(tempDir));
    await first.initialize();
    await first.createUser(user('Molly'));

    const second = new FileUserProvider(engineFor(tempDir));
    await second.initialize();
    expect((await second.getAllUsernames()).sort()).toEqual(['Jim', 'Molly']);
    expect(await second.getUser('molly')).not.toBeNull();
  });
});

describe('#1438 the user store is written atomically', () => {
  test('a save leaves no partial file, and the store reloads', async () => {
    await writeUsers({ jim: user('jim') });
    const provider = new FileUserProvider(engineFor(tempDir));
    await provider.initialize();
    await provider.createUser(user('molly'));

    // Temp files are siblings, so a leftover one would sit right here.
    const stray = (await fs.readdir(tempDir)).filter((f) => f.includes('.tmp.'));
    expect(stray).toEqual([]);

    const reloaded = new FileUserProvider(engineFor(tempDir));
    await reloaded.initialize();
    expect((await reloaded.getAllUsernames()).sort()).toEqual(['jim', 'molly']);
  });

  test('the live path is never opened for writing — the temp file is', async () => {
    // The actual guarantee. `fs.writeFile` over the live path truncates it
    // first, which is how an interrupted save leaves a half-file; atomicWrite
    // writes a sibling and renames. So: the destination must never be handed
    // to a plain write.
    await writeUsers({ jim: user('jim') });
    const p1 = new FileUserProvider(engineFor(tempDir));
    await p1.initialize();

    // Installed only now, so the spy sees the provider's save and not this
    // file's own setup helper, which writes the fixture directly.
    const fsPromises = await import('fs');
    const spy = vi.spyOn(fsPromises.promises, 'writeFile');
    await p1.createUser(user('molly'));

    const wroteLivePath = spy.mock.calls.some(
      ([target]) => String(target) === path.join(tempDir, 'users.json')
    );
    expect(wroteLivePath).toBe(false);
    spy.mockRestore();
  });

  test('the store on disk always parses after a save', async () => {
    await writeUsers({ jim: user('jim') });
    const provider = new FileUserProvider(engineFor(tempDir));
    await provider.initialize();

    const before = await fs.readFile(path.join(tempDir, 'users.json'), 'utf8');
    JSON.parse(before); // precondition: valid to begin with

    await provider.createUser(user('molly'));

    const after = await fs.readFile(path.join(tempDir, 'users.json'), 'utf8');
    // Whatever happened, the file on disk parses. That is the whole guarantee:
    // one version or the other, never a mixture (#1438).
    expect(() => JSON.parse(after)).not.toThrow();
    expect(Object.keys(JSON.parse(after)).sort()).toEqual(['jim', 'molly']);
  });
});
