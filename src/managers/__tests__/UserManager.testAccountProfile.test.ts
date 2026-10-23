/**
 * #2008 — a test account's profile page is a test artifact.
 *
 * - An account created with `isTest` gets a profile stamped `test-artifact`.
 * - Deleting a test account deletes that profile, through PageManager's
 *   test-artifact door, as the subject who deleted the account.
 * - An ordinary account is unchanged: no stamp, and its profile is kept when
 *   the account is deleted (operator, 2026-10-23).
 *
 * Sabotaged once each: without the stamp the first test went red; with the
 * delete made unconditional the ordinary-account test went red.
 */
import UserManager from '../UserManager';
import type { ActorContext } from '../../context/ActorContext';

const ADMIN = { username: 'admin', isAuthenticated: true, roles: ['admin'] } as ActorContext;

function makeManager(accounts: Array<Record<string, unknown>>) {
  const store = new Map<string, Record<string, unknown>>(accounts.map((a) => [a.username as string, a]));
  const provider = {
    getUser: vi.fn((n: string) => Promise.resolve(store.get(n) ? { ...store.get(n) } : undefined)),
    getAllUsers: vi.fn(() => Promise.resolve(store)),
    updateUser: vi.fn((n: string, u: Record<string, unknown>) => { store.set(n, u); return Promise.resolve(); }),
    deleteUser: vi.fn((n: string) => { store.delete(n); return Promise.resolve(); }),
    userExists: vi.fn((n: string) => Promise.resolve(store.has(n)))
  };
  const pageManager = {
    pageExists: vi.fn(() => false),
    savePage: vi.fn(() => Promise.resolve(undefined)),
    deleteTestArtifacts: vi.fn(() => Promise.resolve({ deleted: [{ title: 'Profile: x', uuid: 'u' }], failed: [] }))
  };
  const managers: Record<string, unknown> = {
    ConfigurationManager: { getProperty: vi.fn((_k: string, d: unknown) => d) },
    RoleManager: { resolveUserRoles: vi.fn(() => Promise.resolve([])), removeAllMemberships: vi.fn(() => Promise.resolve()) },
    PolicyInformationPoint: {
      isSystemPrincipal: () => false,
      subjectFor: vi.fn((u: string) => Promise.resolve({ username: u, roles: ['reader'], isAuthenticated: true }))
    },
    AuthManager: { closeAccess: vi.fn(() => Promise.resolve()) },
    PageManager: pageManager,
    TemplateManager: { applyTemplate: vi.fn(() => '# Profile') },
    ValidationManager: { generateValidMetadata: vi.fn((title: string, meta: Record<string, unknown>) => ({ title, 'system-keywords': ['general'], ...meta })) }
  };
  const manager = new UserManager({ getManager: (n: string) => managers[n] ?? null });
  (manager as unknown as { provider: unknown }).provider = provider;
  return { manager, pageManager };
}

const account = (username: string, isTest: boolean) => ({
  username, displayName: username, email: `${username}@example.test`, createdAt: '2026-10-23T00:00:00.000Z', isActive: true, isTest
});

describe('A test account\'s profile page (#2008)', () => {
  test('is stamped test-artifact when the account is a test account', async () => {
    const { manager, pageManager } = makeManager([]);
    await manager.createUserPage(account('e2e-ann', true), ADMIN);
    const metadata = pageManager.savePage.mock.calls[0][2] as Record<string, unknown>;
    expect(metadata['system-keywords']).toEqual(['general', 'test-artifact']);
  });

  test('an ordinary account\'s profile is not stamped', async () => {
    const { manager, pageManager } = makeManager([]);
    await manager.createUserPage(account('ann', false), ADMIN);
    const metadata = pageManager.savePage.mock.calls[0][2] as Record<string, unknown>;
    expect(metadata['system-keywords']).toEqual(['general']);
  });

  test('is deleted with the test account, as the subject who deleted it', async () => {
    const { manager, pageManager } = makeManager([account('e2e-ann', true)]);
    await manager.deleteUser('e2e-ann', ADMIN);
    expect(pageManager.deleteTestArtifacts).toHaveBeenCalledWith(ADMIN, { author: 'e2e-ann', systemCategory: 'user-profile' });
  });

  test('an ordinary account\'s profile is kept when the account is deleted', async () => {
    const { manager, pageManager } = makeManager([account('ann', false)]);
    await manager.deleteUser('ann', ADMIN);
    expect(pageManager.deleteTestArtifacts).not.toHaveBeenCalled();
  });

  test('a profile that cannot be deleted does not undo the account delete', async () => {
    const { manager, pageManager } = makeManager([account('e2e-ann', true)]);
    pageManager.deleteTestArtifacts.mockRejectedValueOnce(new Error('boom'));
    await expect(manager.deleteUser('e2e-ann', ADMIN)).resolves.toBe(true);
    expect(await manager.getUser('e2e-ann')).toBeUndefined();
  });
});
