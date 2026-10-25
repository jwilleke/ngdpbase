/**
 * #2037: every user has exactly one identity record. An account written
 * straight into the user store has none; since v5.28.0 every role change for
 * it was refused, so the admin user form could not save it, password included.
 * At start-up UserManager gives it its identity record, recorded; the role
 * paths make one when it is missing.
 *
 * A real engine on its own mkdtemp data folder; teardown removes only that.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import WikiEngine from '../WikiEngine';
import type UserManager from '../managers/UserManager';
import type IdentityManager from '../managers/IdentityManager';
import type RoleManager from '../managers/RoleManager';
import AuditManagerClass from '../managers/AuditManager';
import { systemContext } from '../context/bootActions';
import { RoleChangeError } from '../utils/roleChangeError';

vi.unmock('../providers/FileUserProvider');

const SAVED = ['FAST_STORAGE', 'SLOW_STORAGE', 'NGDPBASE_SYSTEM_USER'] as const;
const ADMIN = { username: 'admin', roles: ['admin'], isAuthenticated: true, ipAddress: '203.0.113.7' };

/** Find users.json under the data folder, wherever the provider keeps it. */
function usersFile(dir: string): string {
  for (const entry of fs.readdirSync(dir, { recursive: true }) as string[]) {
    if (path.basename(entry) === 'users.json') return path.join(dir, entry);
  }
  throw new Error('no users.json');
}

/** Write an account into users.json by hand, as an add-on dev site did: no createUser, so no identity record. */
function writeAccountByHand(dir: string, username: string): void {
  const file = usersFile(dir);
  const users = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, Record<string, unknown>>;
  users[username] = {
    ...users.admin,
    username,
    email: `${username}@example.test`,
    displayName: 'Hand Made',
    isSystem: false
  };
  fs.writeFileSync(file, JSON.stringify(users, null, 2));
}

describe('an account missing its identity record (#2037)', () => {
  let dataDir: string;
  const engines: WikiEngine[] = [];
  const saved: Partial<Record<(typeof SAVED)[number], string>> = {};

  const boot = async (): Promise<WikiEngine> => {
    const engine = new WikiEngine();
    engines.push(engine);
    await engine.initialize({});
    return engine;
  };

  beforeEach(() => {
    for (const name of SAVED) saved[name] = process.env[name];
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-2037-'));
    process.env.FAST_STORAGE = dataDir;
    process.env.SLOW_STORAGE = dataDir;
    process.env.NGDPBASE_SYSTEM_USER = 'system';
  });

  afterEach(async () => {
    for (const engine of engines.splice(0)) await engine.shutdown().catch(() => undefined);
    for (const name of SAVED) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
    // Only this test's own mkdtemp folder.
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  test('gets one at start-up, recorded; its roles and the admin form (password included) then save', async () => {
    await (await boot()).shutdown();
    engines.length = 0;
    writeAccountByHand(dataDir, 'handmade');

    const logged = vi.spyOn(AuditManagerClass.prototype, 'logAuditEvent');
    const engine = await boot();
    const users = engine.getManager<UserManager>('UserManager')!;
    const persons = engine.getManager<IdentityManager>('IdentityManager')!;
    const roles = engine.getManager<RoleManager>('RoleManager')!;
    const sys = systemContext(engine, 'test: #2037');

    const record = await persons.getByIdentifier(sys, 'handmade');
    expect(record).toMatchObject({ identifier: 'handmade', email: 'handmade@example.test', name: 'Hand Made' });
    const all = await persons.list(sys);
    expect(all.filter((p) => p.identifier === 'handmade')).toHaveLength(1);
    expect(all.filter((p) => p.identifier === 'admin')).toHaveLength(1);

    const created = logged.mock.calls.map(([e]) => e).filter((e) => e.eventType === 'identity-manage' && e.action === 'person-create' && e.resource === record!['@id']);
    expect(created).toHaveLength(1);
    expect(created[0].user).toBe('system');
    logged.mockRestore();

    // The role paths work for it.
    await roles.assignRole('handmade', 'editor', ADMIN);
    expect(await roles.resolveUserRoles(sys, 'handmade')).toContain('editor');
    await roles.removeRole('handmade', 'editor', ADMIN);
    expect(await roles.resolveUserRoles(sys, 'handmade')).not.toContain('editor');

    // The admin form: roles sent with the save, a new password included.
    const before = await users.storedPasswordHash('handmade');
    const current = await roles.resolveUserRoles(sys, 'handmade');
    await users.updateUser('handmade', { displayName: 'Hand Made Two', password: randomUUID(), roles: [...current, 'editor'] }, ADMIN);
    expect(await users.storedPasswordHash('handmade')).not.toBe(before);
    expect(await roles.resolveUserRoles(sys, 'handmade')).toContain('editor');
    expect((await persons.list(sys)).filter((p) => p.identifier === 'handmade')).toHaveLength(1);
  }, 120_000);

  test('a role path makes it when it went missing after start-up; a username with no account still fails', async () => {
    const engine = await boot();
    const users = engine.getManager<UserManager>('UserManager')!;
    const persons = engine.getManager<IdentityManager>('IdentityManager')!;
    const roles = engine.getManager<RoleManager>('RoleManager')!;
    const sys = systemContext(engine, 'test: #2037');

    await users.createUser({ username: 'later', email: 'later@example.test', password: randomUUID(), displayName: 'Later' }, ADMIN);
    const own = await persons.getByIdentifier(sys, 'later');
    await persons.delete(sys, own!['@id']);
    expect(await persons.getByIdentifier(sys, 'later')).toBeNull();

    await roles.assignRole('later', 'editor', ADMIN);
    expect(await roles.resolveUserRoles(sys, 'later')).toContain('editor');
    expect((await persons.list(sys)).filter((p) => p.identifier === 'later')).toHaveLength(1);

    await expect(roles.applyRoleDiff('nobody', [], ['editor'])).rejects.toBeInstanceOf(RoleChangeError);
    await expect(roles.assignRole('nobody', 'editor', ADMIN)).rejects.toThrow();
    expect(await roles.resolveUserRoles(sys, 'nobody')).toEqual([]);
    expect(await persons.getByIdentifier(sys, 'nobody')).toBeNull();
  }, 120_000);
});
