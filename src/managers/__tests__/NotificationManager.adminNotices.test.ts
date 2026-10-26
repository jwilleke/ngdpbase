import { promises as fs } from 'fs';
import path from 'path';
import NotificationManager from '../NotificationManager';

vi.mock('../../utils/logger', () => ({
  default: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) }
}));

/** #2040: the one way to tell administrators. A notice with no targetUsers reaches every user. */
describe('NotificationManager.notifyAdmins', () => {
  let tempDir: string;

  const managerWith = async (holders: string[] | null) => {
    tempDir = path.join(__dirname, 'temp', `admins-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
    await fs.mkdir(tempDir, { recursive: true });
    const config = {
      getProperty: vi.fn((_key: string, d: unknown) => d),
      getResolvedDataPath: vi.fn((key: string, d: unknown) => (key === 'ngdpbase.notifications.dir' ? tempDir : d))
    };
    const engine = {
      getManager: vi.fn((name: string) => {
        if (name === 'ConfigurationManager') return config;
        if (name === 'PolicyDecisionPoint') return { usersHolding: vi.fn(async (a: string) => (a === 'admin-system' ? holders : [])) };
        return undefined;
      })
    };
    const mgr = new NotificationManager(engine);
    await mgr.initialize({});
    return mgr;
  };

  afterEach(async () => {
    // Only this test's own temp directory.
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('targets the users holding admin-system, as a system notification, and only them', async () => {
    const mgr = await managerWith(['alice', 'bob']);
    const id = await mgr.notifyAdmins({ level: 'error', title: 'T', message: 'M' });
    const n = mgr.getAllNotifications(false).find((x) => x.id === id);
    expect(n).toMatchObject({ type: 'system', level: 'error', targetUsers: ['alice', 'bob'] });
    expect(mgr.getUserNotifications('alice')).toHaveLength(1);
    expect(mgr.getUserNotifications('carol')).toHaveLength(0);
    await mgr.shutdown();
  });

  test('nobody holds admin-system (or no answer): nothing is created, since no targets would tell every user', async () => {
    for (const holders of [[], null]) {
      const mgr = await managerWith(holders);
      expect(await mgr.notifyAdmins({ level: 'error', title: 'T', message: 'M' })).toBeNull();
      expect(mgr.getAllNotifications(false)).toHaveLength(0);
      await mgr.shutdown();
    }
  });
});
