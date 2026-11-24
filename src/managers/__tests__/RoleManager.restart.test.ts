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

const personId = (u: string) => `urn:person:${u}`;

describe('RoleManager start-up with vault-owner already on disk (#2432)', () => {
  let tmpDir: string;
  const rolesDir = () => path.join(tmpDir, 'roles');
  const roleFile = () => path.join(rolesDir(), 'vault-owner.json');

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'role-restart-'));
    resetBootActions();
  });

  afterEach(async () => {
    // Only this test's temp directory — never a live data tree.
    await fs.remove(tmpDir);
  });

  /** A fresh RoleManager over the same roles folder, as a restart makes one. */
  async function boot(org: { '@id': string; url: string }): Promise<RoleManager> {
    const managers: Record<string, unknown> = {
      ConfigurationManager: { getProperty: (_k: string, d: unknown) => d, getResolvedDataPath: () => rolesDir() },
      IdentityManager: {
        getById: (_ctx: unknown, id: string) => Promise.resolve({ '@id': id, identifier: id.split(':').pop() }),
        getByUserIdentifier: (_ctx: unknown, u: string) => Promise.resolve({ '@id': personId(u) }),
        getByIdentifier: (_ctx: unknown, u: string) => Promise.resolve({ '@id': personId(u) })
      },
      OrganizationManager: { getInstallOrg: () => Promise.resolve(org) },
      NotificationManager: { notifyAdmins: () => Promise.resolve('n') }
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
});
