/**
 * A role every account must hold is given to the accounts that already exist,
 * once — #1539.
 *
 * `vault-owner` arrives on an instance that already has people. The role
 * record not existing is the record that it was never given: the first boot
 * that has the role adds every existing account to it and so creates the
 * record; every later boot finds the record and does nothing, so an admin who
 * removes the role from someone is not overruled.
 */

import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import RoleManager from '../RoleManager';
import { resetBootActions, pendingBootActions } from '../../context/bootActions';
import { jobContextFromSystem } from '../../context/JobContext';

const ORG = { '@id': 'https://example.com/', url: 'https://example.com/' };
const personId = (u: string) => `urn:person:${u}`;

describe('RoleManager.grantToEveryAccountOnce (#1539)', () => {
  let tmpDir: string;
  let manager: RoleManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'role-grant-once-'));
    resetBootActions();
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (_k: string, d: unknown) => d,
        getResolvedDataPath: () => path.join(tmpDir, 'roles')
      },
      PersonManager: { getByIdentifier: (u: string) => Promise.resolve({ '@id': personId(u) }) },
      OrganizationManager: { getInstallOrg: () => Promise.resolve(ORG) }
    };
    manager = new RoleManager({ getManager: (n: string) => managers[n] ?? null });
    await manager.initialize();
  });

  afterEach(async () => {
    // Only this test's temp directory — never a live data tree.
    await fs.remove(tmpDir);
  });

  const ctx = () => jobContextFromSystem('svc', 'give vault-owner to existing accounts');
  const members = async () => ((await manager.getByOrgAndPosition(ORG['@id'], 'vault-owner'))?.member ?? []).map((m) => m['@id']);

  test('the first time, every existing account is added, and each grant is recorded', async () => {
    expect(await manager.grantToEveryAccountOnce('vault-owner', ['alice', 'bob'], ctx())).toBe(2);
    expect(await members()).toEqual([personId('alice'), personId('bob')]);
    const recorded = pendingBootActions().map((a) => a.event);
    expect(recorded).toHaveLength(2);
    expect(recorded[0]).toMatchObject({ action: 'user-edit', resource: 'alice', metadata: { role: { assign: 'vault-owner' } } });
  });

  test('once the role exists it is never given again — a removal by an admin stands', async () => {
    await manager.grantToEveryAccountOnce('vault-owner', ['alice', 'bob'], ctx());
    await manager.applyRoleDiff('bob', ['vault-owner'], []);
    expect(await manager.grantToEveryAccountOnce('vault-owner', ['alice', 'bob', 'carol'], ctx())).toBe(0);
    expect(await members()).toEqual([personId('alice')]);
  });

  test('with no accounts yet, the role is still marked as given', async () => {
    expect(await manager.grantToEveryAccountOnce('vault-owner', [], ctx())).toBe(0);
    expect(await manager.getByOrgAndPosition(ORG['@id'], 'vault-owner')).not.toBeNull();
    expect(await manager.grantToEveryAccountOnce('vault-owner', ['alice'], ctx())).toBe(0);
  });
});
