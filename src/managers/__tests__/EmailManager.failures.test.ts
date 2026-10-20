/**
 * #1916 — a failed email is never silent.
 *
 * Every sender goes through EmailManager.send(), so the failure is reported
 * there once: logged without the body or the full address, the manager shows
 * degraded until the next success, and administrators get ONE notice per
 * window with a running count. The notice is never emailed (no loop).
 */
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import EmailManager, { SEND_FAILING_REASON, SEND_FAILING_TITLE } from '../EmailManager';
import NotificationManager from '../NotificationManager';
import logger from '../../utils/logger';
import { loggedText } from './__fixtures__/loggedText';

const BODY = 'SECRET-BODY-TEXT do not log me';
const ADDRESS = 'bob.private@example.org';


const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
};

interface Setup {
  manager: EmailManager;
  notifications: { createNotification: ReturnType<typeof vi.fn>; updateNotificationMessage: ReturnType<typeof vi.fn> };
  providerSend: ReturnType<typeof vi.fn>;
}

async function setup(opts: { provider?: 'console' | 'smtp'; windowMinutes?: number; failWith?: Error | null } = {}): Promise<Setup> {
  const props: Record<string, unknown> = {
    'ngdpbase.mail.enabled': true,
    'ngdpbase.mail.provider': opts.provider ?? 'smtp',
    'ngdpbase.mail.provider.smtp.host': 'smtp.example.com',
    'ngdpbase.mail.provider.smtp.from': 'noreply@example.com',
    'ngdpbase.mail.provider.smtp.user': 'u',
    'ngdpbase.mail.provider.smtp.pass': 'p',
    ...(opts.windowMinutes !== undefined ? { 'ngdpbase.mail.failure-notice.window-minutes': opts.windowMinutes } : {})
  };
  const configManager = { getProperty: vi.fn((key: string, def: unknown) => (key in props ? props[key] : def)) };
  let n = 0;
  const notifications = {
    createNotification: vi.fn(async () => `notification_${++n}`),
    updateNotificationMessage: vi.fn(async () => true)
  };
  const managers: Record<string, unknown> = {
    ConfigurationManager: configManager,
    NotificationManager: notifications,
    UserManager: { getUsers: async () => [{ username: 'admin' }, { username: 'reader' }] },
    PolicyDecisionPoint: { userHoldsPermission: async (u: string, a: string) => u === 'admin' && a === 'admin-system' }
  };
  const manager = new EmailManager({ getManager: (name: string) => managers[name] });
  await manager.initialize();
  const providerSend = vi.fn(async () => {
    if (opts.failWith) throw opts.failWith;
  });
  if (opts.provider !== 'console') (manager as unknown as { provider: unknown }).provider = { send: providerSend };
  return { manager, notifications, providerSend };
}

const smtpError = (): Error => new Error(`Can't send mail - all recipients were rejected: 550 5.1.1 <${ADDRESS}>: Recipient address rejected`);

describe('EmailManager — failed sends are reported (#1916)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('a failure is logged with provider, recipient domain, subject and error — never the body or the full address', async () => {
    const { manager } = await setup({ failWith: smtpError() });
    await expect(manager.sendTo(ADDRESS, 'Your reservation', BODY)).rejects.toThrow();
    await flush();

    const errors = (logger.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c.map(String).join(' '));
    const line = errors.find((m) => m.includes('send failed'));
    expect(line).toBeDefined();
    expect(line).toContain('provider=smtp');
    expect(line).toContain('to-domain=example.org');
    expect(line).toContain('Your reservation');
    expect(line).toContain('Recipient address rejected');

    const everything = loggedText();
    expect(everything).not.toContain(ADDRESS);
    expect(everything).not.toContain('bob.private');
    expect(everything).not.toContain('SECRET-BODY');
  });

  test('N failures inside the window make ONE notice, to administrators only, with the running count', async () => {
    const { manager, notifications } = await setup({ failWith: smtpError() });
    for (let i = 0; i < 4; i++) manager.sendInBackground(ADDRESS, `Copy ${i}`, BODY);
    await flush();

    expect(notifications.createNotification).toHaveBeenCalledTimes(1);
    const created = notifications.createNotification.mock.calls[0][0];
    expect(created).toMatchObject({ title: SEND_FAILING_TITLE, level: 'error', targetUsers: ['admin'], escalate: false });
    expect(created.message).not.toContain(ADDRESS);
    expect(created.message).not.toContain('SECRET-BODY');

    const updates = notifications.updateNotificationMessage.mock.calls;
    expect(updates.length).toBe(3);
    expect(updates.every((c) => c[0] === 'notification_1')).toBe(true);
    expect(String(updates[updates.length - 1][1])).toMatch(/^4 emails could not be sent/);
  });

  test('a failure after the window opens a new notice', async () => {
    const now = vi.spyOn(Date, 'now');
    try {
      now.mockReturnValue(1_000_000);
      const { manager, notifications } = await setup({ failWith: smtpError(), windowMinutes: 5 });
      await manager.sendTo(ADDRESS, 'a', BODY).catch(() => undefined);
      await flush();
      now.mockReturnValue(1_000_000 + 4 * 60_000);
      await manager.sendTo(ADDRESS, 'b', BODY).catch(() => undefined);
      await flush();
      expect(notifications.createNotification).toHaveBeenCalledTimes(1);

      now.mockReturnValue(1_000_000 + 6 * 60_000);
      await manager.sendTo(ADDRESS, 'c', BODY).catch(() => undefined);
      await flush();
      expect(notifications.createNotification).toHaveBeenCalledTimes(2);
      expect(String(notifications.createNotification.mock.calls[1][0].message)).toMatch(/^1 email could not be sent/);
    } finally {
      now.mockRestore();
    }
  });

  test('degraded while sends fail, cleared by the next success', async () => {
    const setupResult = await setup({ failWith: smtpError() });
    const { manager, providerSend } = setupResult;
    expect(manager.getManagerStatus().state).toBe('ready');

    await manager.sendTo(ADDRESS, 'x', BODY).catch(() => undefined);
    expect(manager.getManagerStatus()).toMatchObject({ state: 'degraded', reason: SEND_FAILING_REASON });
    expect(manager.isDeliveryFailing()).toBe(true);

    providerSend.mockResolvedValueOnce(undefined);
    await manager.sendTo(ADDRESS, 'y', BODY);
    expect(manager.getManagerStatus().state).toBe('ready');
    expect(manager.isDeliveryFailing()).toBe(false);
  });

  test('the console provider is never a failure', async () => {
    const { manager, notifications } = await setup({ provider: 'console' });
    expect(manager.getProviderName()).toBe('console');
    await expect(manager.sendTo(ADDRESS, 'hello', BODY)).resolves.toBeUndefined();
    await flush();
    expect(manager.getManagerStatus().state).toBe('ready');
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  test('sendInBackground never rejects (no unhandled rejection) but still reports', async () => {
    const { manager, notifications } = await setup({ failWith: smtpError() });
    expect(() => manager.sendInBackground(ADDRESS, 'bg', BODY)).not.toThrow();
    await flush();
    expect(manager.isDeliveryFailing()).toBe(true);
    expect(notifications.createNotification).toHaveBeenCalledTimes(1);
  });
});

describe('EmailManager + NotificationManager — the failure notice is never emailed (#1916)', () => {
  let dataDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    dataDir = await mkdtemp(path.join(os.tmpdir(), 'email-1916-'));
  });

  afterEach(async () => {
    // Only this test's own temp directory.
    if (dataDir?.startsWith(os.tmpdir())) await rm(dataDir, { recursive: true, force: true });
  });

  test('escalation on for errors: one failed send makes one notice and no further send attempts', async () => {
    const props: Record<string, unknown> = {
      'ngdpbase.mail.enabled': true,
      'ngdpbase.mail.provider': 'smtp',
      'ngdpbase.mail.provider.smtp.host': 'smtp.example.com',
      'ngdpbase.mail.provider.smtp.from': 'noreply@example.com',
      'ngdpbase.mail.provider.smtp.user': 'u',
      'ngdpbase.mail.provider.smtp.pass': 'p',
      'ngdpbase.notifications.file': 'notifications.json',
      'ngdpbase.notifications.auto-save-interval': 60000,
      'ngdpbase.notifications.escalation.enabled': true,
      'ngdpbase.notifications.escalation.levels': ['error'],
      'ngdpbase.notifications.escalation.recipient-role': 'admin'
    };
    const configManager = {
      getProperty: vi.fn((key: string, def: unknown) => (key in props ? props[key] : def)),
      getResolvedDataPath: vi.fn(() => dataDir)
    };
    const managers: Record<string, unknown> = {
      ConfigurationManager: configManager,
      UserManager: {
        getUsers: async () => [{ username: 'admin' }],
        searchUsers: async () => [{ username: 'admin', email: 'admin@example.net' }]
      },
      PolicyDecisionPoint: { userHoldsPermission: async (u: string) => u === 'admin' }
    };
    const engine = { getManager: (name: string) => managers[name] };
    const notificationManager = new NotificationManager(engine);
    const emailManager = new EmailManager(engine);
    managers.NotificationManager = notificationManager;
    managers.EmailManager = emailManager;
    await notificationManager.initialize();
    await emailManager.initialize();

    const providerSend = vi.fn(async () => { throw smtpError(); });
    (emailManager as unknown as { provider: unknown }).provider = { send: providerSend };

    try {
      await emailManager.sendTo(ADDRESS, 'Your copy', BODY).catch(() => undefined);
      // The notice is written to disk before escalation would run; give any
      // escalation email time to be attempted.
      await vi.waitFor(() => {
        expect(notificationManager.getAllNotifications().some((n) => n.title === SEND_FAILING_TITLE)).toBe(true);
      });
      await new Promise((r) => setTimeout(r, 300));

      expect(providerSend).toHaveBeenCalledTimes(1);
      const notices = notificationManager.getAllNotifications().filter((n) => n.title === SEND_FAILING_TITLE);
      expect(notices).toHaveLength(1);
      expect(notices[0].targetUsers).toEqual(['admin']);
    } finally {
      await notificationManager.shutdown();
    }
  });
});
