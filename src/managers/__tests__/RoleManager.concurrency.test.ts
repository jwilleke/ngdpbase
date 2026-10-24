/**
 * Concurrent role changes all land, and a change that is not saved says so (#2015).
 *
 * jimstest, 2026-10-23: E2E accounts created side by side, each with `reader`.
 * Membership was a read-modify-write of the role's member list with nothing
 * keeping two of them apart, so two adds to one role each read the list before
 * the other wrote it and the later write dropped the earlier member. When the
 * write itself failed (a temp-file collision, ENOENT on rename), the failure
 * was only logged: the account was created without its role and the
 * administrator was never told.
 *
 * A real RoleManager over a real FileRoleProvider in a temp folder, with
 * Date.now frozen so every write lands in the same millisecond.
 */
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import RoleManager from '../RoleManager';
import { RoleChangeError } from '../../utils/roleChangeError';

const ORG = { '@id': 'https://example.com/', url: 'https://example.com/' };
const personId = (u: string) => `urn:person:${u}`;
const ADMIN = { username: 'admin', roles: ['admin'] } as never;
const ACCOUNTS = Array.from({ length: 30 }, (_, i) => `user${i}`);

describe('RoleManager membership under concurrency (#2015)', () => {
  let tmpDir: string;
  let manager: RoleManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'role-concurrency-'));
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (key: string, d: unknown) =>
          key === 'ngdpbase.roles.definitions' ? { reader: {}, editor: {} } : d,
        getResolvedDataPath: () => path.join(tmpDir, 'roles')
      },
      PersonManager: { getByIdentifier: (_ctx: unknown, u: string) => Promise.resolve({ '@id': personId(u) }) },
      OrganizationManager: { getInstallOrg: () => Promise.resolve(ORG) },
      UserManager: { getUser: (u: string) => Promise.resolve({ username: u }) }
    };
    manager = new RoleManager({ getManager: (n: string) => managers[n] ?? null });
    await manager.initialize();
    vi.spyOn(Date, 'now').mockReturnValue(1792753824698);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // Only this test's temp directory — never a live data tree.
    await fs.remove(tmpDir);
  });

  /** Members as stored on disk, read past every cache. */
  const stored = async (role: string): Promise<string[]> => {
    manager.invalidateCache();
    const record = await manager.getByOrgAndPosition(ORG['@id'], role);
    return (record?.member ?? []).map((m) => m['@id']).sort();
  };

  test('many accounts given one role at once, before the role record exists: every member lands', async () => {
    await Promise.all(ACCOUNTS.map((u) => manager.applyRoleDiff(u, [], ['reader'])));
    expect(await stored('reader')).toEqual(ACCOUNTS.map(personId).sort());
  });

  test('concurrent adds and removes on one role: each lands', async () => {
    await Promise.all(ACCOUNTS.map((u) => manager.applyRoleDiff(u, [], ['reader'])));
    const leaving = ACCOUNTS.slice(0, 15);
    const joining = Array.from({ length: 15 }, (_, i) => `late${i}`);
    await Promise.all([
      ...leaving.map((u) => manager.removeRole(u, 'reader', ADMIN)),
      ...joining.map((u) => manager.assignRole(u, 'reader', ADMIN))
    ]);
    const expected = [...ACCOUNTS.slice(15), ...joining].map(personId).sort();
    expect(await stored('reader')).toEqual(expected);
  });

  /** Make every save of `role`'s record fail, the way jimstest's rename did. */
  const failSavesOf = (role: string) => {
    const provider = manager.getProvider()!;
    const realUpdate = provider.update.bind(provider);
    return vi.spyOn(provider, 'update').mockImplementation(async (id, patch) => {
      if (id.includes(`/roles/${role}#`)) throw new Error(`ENOENT: no such file or directory, rename '${role}.json.tmp' -> '${role}.json'`);
      return realUpdate(id, patch);
    });
  };

  test('all or nothing: when one role cannot be saved, the ones already made are undone', async () => {
    await manager.applyRoleDiff('alice', [], ['reader', 'editor']);
    failSavesOf('reader');

    const failure = await manager.applyRoleDiff('bob', [], ['editor', 'reader']).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(RoleChangeError);
    expect((failure as RoleChangeError).failed).toEqual(['add reader']);
    expect((failure as RoleChangeError).notUndone).toEqual([]);
    expect((failure as Error).message).toContain('bob');
    expect((failure as Error).message).not.toContain('ENOENT');
    expect(await stored('editor')).toEqual([personId('alice')]);
    expect(await stored('reader')).toEqual([personId('alice')]);
  });

  test('an edit that cannot be completed leaves every role as it was', async () => {
    await manager.applyRoleDiff('alice', [], ['reader']);
    failSavesOf('editor');
    await expect(manager.applyRoleDiff('alice', ['reader'], ['editor'])).rejects.toBeInstanceOf(RoleChangeError);
    expect(await stored('reader')).toEqual([personId('alice')]);
    expect(await stored('editor')).toEqual([]);
  });

  test('a change that could not be undone is named, so nobody believes nothing changed', async () => {
    await manager.applyRoleDiff('alice', [], ['reader', 'editor']);
    const provider = manager.getProvider()!;
    const realUpdate = provider.update.bind(provider);
    let editorWrites = 0;
    vi.spyOn(provider, 'update').mockImplementation(async (id, patch) => {
      if (id.includes('/roles/reader#')) throw new Error('disk full');
      // The first editor write (the add) lands; the undo then fails.
      if (id.includes('/roles/editor#') && ++editorWrites > 1) throw new Error('disk full');
      return realUpdate(id, patch);
    });
    const failure = await manager.applyRoleDiff('bob', [], ['editor', 'reader']).catch((e: unknown) => e) as RoleChangeError;
    expect(failure.notUndone).toEqual(['add editor']);
    expect(failure.message).toMatch(/still in effect/);
  });

  test('assignRole and removeRole reject when the save fails, instead of reporting success', async () => {
    await manager.applyRoleDiff('alice', [], ['reader']);
    vi.spyOn(manager.getProvider(), 'update').mockRejectedValue(new Error('disk full'));
    await expect(manager.assignRole('bob', 'reader', ADMIN)).rejects.toBeInstanceOf(RoleChangeError);
    await expect(manager.removeRole('alice', 'reader', ADMIN)).rejects.toBeInstanceOf(RoleChangeError);
  });

  test('removeAllMemberships: all or nothing, and its undo gives every role back', async () => {
    await manager.applyRoleDiff('alice', [], ['reader', 'editor']);
    const spy = failSavesOf('reader');
    await expect(manager.removeAllMemberships('alice')).rejects.toBeInstanceOf(RoleChangeError);
    expect(await stored('editor')).toEqual([personId('alice')]);
    expect(await stored('reader')).toEqual([personId('alice')]);

    spy.mockRestore();
    const giveBack = await manager.removeAllMemberships('alice');
    expect(await stored('editor')).toEqual([]);
    await giveBack();
    expect(await stored('editor')).toEqual([personId('alice')]);
    expect(await stored('reader')).toEqual([personId('alice')]);
  });

  test('moveMemberships: all or nothing', async () => {
    await manager.applyRoleDiff('alice', [], ['reader', 'editor']);
    failSavesOf('reader');
    await expect(manager.moveMemberships(personId('alice'), personId('carol'))).rejects.toBeInstanceOf(RoleChangeError);
    expect(await stored('editor')).toEqual([personId('alice')]);
    expect(await stored('reader')).toEqual([personId('alice')]);
  });
});
