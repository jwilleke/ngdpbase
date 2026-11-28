/**
 * Restarting an installed site must not fail on a role file that is already
 * there — #2432.
 *
 * `vault-owner` is created the first time a site starts. A second start on the
 * same data folder used to throw "Cannot create role 'vault-owner': a file
 * already exists" when the start-up lookup did not match the file already on
 * disk, as when the site's organization has a different `@id` than the one the
 * file was written under. The file is the record that the role was given: a
 * restart leaves it exactly as it is.
 */

import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import RoleManager from '../RoleManager';
import { resetBootActions } from '../../context/bootActions';
import { jobContextFromSystem } from '../../context/JobContext';
import { RoleChangeError } from '../../utils/roleChangeError';
import logger from '../../utils/logger';

const personId = (u: string) => `urn:person:${u}`;

describe('RoleManager start-up with vault-owner already on disk (#2432)', () => {
  let tmpDir: string;
  const rolesDir = () => path.join(tmpDir, 'roles');
  const roleFile = () => path.join(rolesDir(), 'vault-owner.json');

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'role-restart-'));
    resetBootActions();
    notifyAdmins.mockClear();
  });

  afterEach(async () => {
    // Only this test's temp directory — never a live data tree.
    await fs.remove(tmpDir);
  });

  /** A fresh RoleManager over the same roles folder, as a restart makes one. */
  const notifyAdmins = vi.fn(() => Promise.resolve('n'));

  async function boot(org: { '@id': string; url: string }): Promise<RoleManager> {
    const managers: Record<string, unknown> = {
      ConfigurationManager: { getProperty: (_k: string, d: unknown) => d, getResolvedDataPath: () => rolesDir() },
      IdentityManager: {
        getById: (_ctx: unknown, id: string) => Promise.resolve({ '@id': id, identifier: id.split(':').pop() }),
        getByUserIdentifier: (_ctx: unknown, u: string) => Promise.resolve({ '@id': personId(u) }),
        getByIdentifier: (_ctx: unknown, u: string) => Promise.resolve({ '@id': personId(u) })
      },
      OrganizationManager: { getInstallOrg: () => Promise.resolve(org) },
      NotificationManager: { notifyAdmins }
    };
    const manager = new RoleManager({ getManager: (n: string) => managers[n] ?? null });
    await manager.initialize();
    return manager;
  }

  const grant = (m: RoleManager, usernames: string[]) =>
    m.grantToEveryAccountOnce('vault-owner', usernames, jobContextFromSystem('svc', 'give vault-owner to existing accounts'));

  test('a second start with the same organization leaves the file as it was', async () => {
    const org = { '@id': 'urn:uuid:org-one', url: 'https://example.com/' };
    await grant(await boot(org), ['alice']);
    const before = await fs.readFile(roleFile(), 'utf8');

    await expect(grant(await boot(org), ['alice'])).resolves.toBe(0);
    expect(await fs.readFile(roleFile(), 'utf8')).toBe(before);
  });

  test('a second start whose organization @id differs from the file’s does not throw, and the file stays as it was', async () => {
    await grant(await boot({ '@id': 'urn:uuid:org-one', url: 'https://example.com/' }), ['alice']);
    const before = await fs.readFile(roleFile(), 'utf8');

    await expect(grant(await boot({ '@id': 'urn:uuid:org-two', url: 'https://example.com/' }), ['alice', 'bob'])).resolves.toBe(0);
    expect(await fs.readFile(roleFile(), 'utf8')).toBe(before);
  });
  test('after the organization @id changes, a later role change still works and the file keeps its organization', async () => {
    await grant(await boot({ '@id': 'urn:uuid:org-one', url: 'https://example.com/' }), ['alice']);
    const second = await boot({ '@id': 'urn:uuid:org-two', url: 'https://example.com/' });
    await grant(second, ['alice']);

    // an existing account edited, and a new account created, after the change
    await expect(second.applyRoleDiff('bob', [], ['vault-owner'])).resolves.toBeUndefined();
    await expect(second.applyRoleDiff('carol', [], ['vault-owner'])).resolves.toBeUndefined();

    const file = await fs.readJson(roleFile());
    expect(file.organization['@id']).toBe('urn:uuid:org-one');
    expect(file.member.map((m: { '@id': string }) => m['@id']).sort()).toEqual([personId('alice'), personId('bob'), personId('carol')]);

    // and a removal reaches the same record
    await expect(second.applyRoleDiff('bob', ['vault-owner'], [])).resolves.toBeUndefined();
    const after = await fs.readJson(roleFile());
    expect(after.member.map((m: { '@id': string }) => m['@id']).sort()).toEqual([personId('alice'), personId('carol')]);
  });
  test('a deleted account and a role change for another account at the same time, after the @id changed, both stand', async () => {
    await grant(await boot({ '@id': 'urn:uuid:org-one', url: 'https://example.com/' }), ['alice']);
    const second = await boot({ '@id': 'urn:uuid:org-two', url: 'https://example.com/' });

    // removeAllMemberships names the file's own organization; applyRoleDiff names the anchor. One file, one queue.
    await Promise.all([second.removeAllMemberships('alice'), second.applyRoleDiff('bob', [], ['vault-owner'])]);

    const members = (await fs.readJson(roleFile())).member.map((m: { '@id': string }) => m['@id']);
    expect(members).not.toContain(personId('alice'));
    expect(members).toContain(personId('bob'));
  });
  test('the first use under another organization logs one warning naming the role and both organizations', async () => {
    await grant(await boot({ '@id': 'urn:uuid:org-one', url: 'https://example.com/' }), ['alice']);
    const second = await boot({ '@id': 'urn:uuid:org-two', url: 'https://example.com/' });
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    try {
      await second.applyRoleDiff('bob', [], ['vault-owner']);
      await second.applyRoleDiff('carol', [], ['vault-owner']);

      const calls = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('#2432'));
      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain("'vault-owner'");
      expect(calls[0]).toContain('urn:uuid:org-one');
      expect(calls[0]).toContain('urn:uuid:org-two');
    } finally {
      warn.mockRestore();
    }
  });

  describe('two files for one role name, none under the site’s organization', () => {
    beforeEach(async () => {
      await grant(await boot({ '@id': 'urn:uuid:org-one', url: 'https://example.com/' }), ['alice']);
      // hand-placed: the same role name under organizations B and C, none under the site's organization
      const original = await fs.readJson(roleFile());
      await fs.remove(roleFile());
      for (const [file, org] of [['vault-owner-b.json', 'urn:uuid:org-b'], ['vault-owner-c.json', 'urn:uuid:org-c']] as const) {
        await fs.writeJson(path.join(rolesDir(), file), { ...original, '@id': `https://example.com/roles/${file}#role`, organization: { '@id': org } });
      }
    });

    test('a role change is refused with a RoleChangeError naming the files, and no file is written', async () => {
      const second = await boot({ '@id': 'urn:uuid:org-two', url: 'https://example.com/' });
      const before = await Promise.all(['vault-owner-b.json', 'vault-owner-c.json'].map((f) => fs.readFile(path.join(rolesDir(), f), 'utf8')));

      const failure = await second.applyRoleDiff('bob', [], ['vault-owner']).catch((e: unknown) => e);
      expect(failure).toBeInstanceOf(RoleChangeError);
      expect((failure as RoleChangeError).message).toContain('vault-owner-b.json');
      expect((failure as RoleChangeError).message).toContain('vault-owner-c.json');

      const after = await Promise.all(['vault-owner-b.json', 'vault-owner-c.json'].map((f) => fs.readFile(path.join(rolesDir(), f), 'utf8')));
      expect(after).toEqual(before);
    });

    test('the start-up grant does not throw: it tells the admins and goes on', async () => {
      const second = await boot({ '@id': 'urn:uuid:org-two', url: 'https://example.com/' });
      await expect(grant(second, ['alice', 'bob'])).resolves.toBe(0);
      expect(notifyAdmins).toHaveBeenCalledTimes(1);
    });
  });
});
