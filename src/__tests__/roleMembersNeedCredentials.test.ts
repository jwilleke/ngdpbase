/**
 * #2040: a role member must have credentials, on a real engine. A contact
 * joined to an account takes the account's roles; a contact written into a
 * role file by hand is reported at start-up (dashboard, log, one notification
 * for administrators) and left as it is.
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
import { CONTACT_MEMBERS_TITLE } from '../managers/RoleManager';
import type NotificationManager from '../managers/NotificationManager';
import { systemContext } from '../context/bootActions';

vi.unmock('../providers/FileUserProvider');

const SAVED = ['FAST_STORAGE', 'SLOW_STORAGE', 'NGDPBASE_SYSTEM_USER'] as const;
const ADMIN = { username: 'admin', roles: ['admin'], isAuthenticated: true, ipAddress: '203.0.113.7' };

/** The role record file for `namedPosition`, wherever the provider keeps it. */
function roleFile(dir: string, namedPosition: string): string {
  for (const entry of fs.readdirSync(dir, { recursive: true }) as string[]) {
    if (entry.split(path.sep).includes('roles') && path.basename(entry) === `${namedPosition}.json`) return path.join(dir, entry);
  }
  throw new Error(`no role file for ${namedPosition}`);
}

describe('a role member must have credentials, on a real engine (#2040)', () => {
  let dataDir: string;
  const engines: WikiEngine[] = [];
  const saved: Partial<Record<(typeof SAVED)[number], string>> = {};

  const boot = async (): Promise<WikiEngine> => {
    const engine = new WikiEngine();
    engines.push(engine);
    await engine.initialize({});
    return engine;
  };
  const stop = async (): Promise<void> => {
    for (const engine of engines.splice(0)) await engine.shutdown();
  };

  beforeEach(() => {
    for (const name of SAVED) saved[name] = process.env[name];
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-2040-'));
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

  test('a contact joined to an account keeps its id and takes the account\'s roles', async () => {
    const engine = await boot();
    const users = engine.getManager<UserManager>('UserManager')!;
    const persons = engine.getManager<IdentityManager>('IdentityManager')!;
    const roles = engine.getManager<RoleManager>('RoleManager')!;
    const sys = systemContext(engine, 'test: #2040 join');

    const contact = await persons.create(sys, { name: 'Dana Contact' });
    await users.createUser({ username: 'dana', email: 'dana@example.test', password: randomUUID(), displayName: 'Dana', roles: ['editor'] }, ADMIN);
    await persons.linkAccount(sys, contact['@id'], 'dana');

    expect(await roles.resolveUserRoles(sys, 'dana')).toContain('editor');
    const editor = JSON.parse(fs.readFileSync(roleFile(dataDir, 'editor'), 'utf8')) as { member: { '@id': string }[] };
    expect(editor.member.map((m) => m['@id'])).toContain(contact['@id']);
  }, 120_000);

  test('a contact found in a role file at start-up is reported, once, and left in place', async () => {
    let engine = await boot();
    const sys = systemContext(engine, 'test: #2040 start-up');
    const contact = await engine.getManager<IdentityManager>('IdentityManager')!.create(sys, { name: 'Carol Contact' });
    await engine.getManager<UserManager>('UserManager')!.createUser({ username: 'ed', email: 'ed@example.test', password: randomUUID(), displayName: 'Ed', roles: ['editor'] }, ADMIN);
    expect(engine.getManager<RoleManager>('RoleManager')!.getManagerStatus().state).toBe('ready');
    await stop();

    // Written by hand, past RoleManager, as old data or a hand edit might be.
    const file = roleFile(dataDir, 'editor');
    const record = JSON.parse(fs.readFileSync(file, 'utf8')) as { member: { '@id': string }[] };
    record.member.push({ '@id': contact['@id'] });
    fs.writeFileSync(file, JSON.stringify(record, null, 2));

    engine = await boot();
    const status = engine.getManager<RoleManager>('RoleManager')!.getManagerStatus();
    expect(status).toMatchObject({ state: 'degraded', kind: 'attention' });
    expect(status.reason).toContain("'editor' lists 1");
    const notices = () => engine.getManager<NotificationManager>('NotificationManager')!.getAllNotifications(false).filter((n) => n.title === CONTACT_MEMBERS_TITLE);
    expect(notices()).toHaveLength(1);
    // #2041: notification recipients are stored by identity @id.
    const adminId = (await engine.getManager<IdentityManager>('IdentityManager')!.getByUserIdentifier(systemContext(engine, 'test: admin identity @id'), 'admin'))!['@id'];
    expect(notices()[0].targetUsers).toContain(adminId);
    expect(notices()[0].targetUsers).not.toHaveLength(0);
    await stop();

    // The next start reports it again on the dashboard, but adds no second notification.
    engine = await boot();
    expect(engine.getManager<RoleManager>('RoleManager')!.getManagerStatus().reason).toContain("'editor' lists 1");
    expect(notices()).toHaveLength(1);
    const after = JSON.parse(fs.readFileSync(file, 'utf8')) as { member: { '@id': string }[] };
    expect(after.member.map((m) => m['@id'])).toContain(contact['@id']);
  }, 180_000);
});
