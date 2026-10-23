/**
 * #2008 — PageManager.deleteTestArtifacts: the door that removes pages a test
 * made. It deletes only pages carrying the `test-artifact` system keyword,
 * records `page-delete` before each delete, and goes through `deletePage`.
 *
 * Sabotaged once each: dropping the keyword check deleted the ordinary page
 * (first test red); recording after the delete let the failing-sink test
 * delete the page (third test red).
 */
vi.unmock('../PageManager');

import PageManager from '../PageManager';

type Info = { title: string; uuid: string; metadata: Record<string, unknown> };

const ADMIN = { username: 'admin', roles: ['admin'], isAuthenticated: true };

function makeManager(pages: Info[], { auditFails = false } = {}) {
  const deleted: string[] = [];
  const events: Array<Record<string, unknown>> = [];
  const order: string[] = [];
  const provider = {
    getAllPageInfo: vi.fn(() => Promise.resolve(pages.filter((p) => !deleted.includes(p.title)))),
    getPage: vi.fn((id: string) => Promise.resolve(pages.find((p) => p.title === id) ?? null)),
    deletePage: vi.fn((id: string) => { deleted.push(id); order.push(`delete:${id}`); return Promise.resolve(true); })
  };
  const auditManager = {
    logAuditEvent: vi.fn((event: Record<string, unknown>) => {
      if (auditFails) return Promise.reject(new Error('disk full'));
      events.push(event);
      order.push(`audit:${String((event.metadata as { pageName?: string }).pageName)}`);
      return Promise.resolve('id');
    }),
    flushAuditQueue: vi.fn(() => Promise.resolve())
  };
  const manager = new PageManager({
    getManager: vi.fn((name: string) => (name === 'AuditManager' ? auditManager : null))
  }) as unknown as {
    provider: unknown;
    deleteTestArtifacts: (ctx: unknown, only?: { author?: string; systemCategory?: string }) => Promise<{
      deleted: Array<{ title: string; uuid: string }>;
      failed: Array<{ title: string; uuid: string; error: string }>;
    }>;
  };
  manager.provider = provider;
  return { manager, deleted, events, order };
}

const artifact = (title: string, extra: Record<string, unknown> = {}): Info => ({
  title, uuid: `u-${title}`, metadata: { title, 'system-keywords': ['general', 'test-artifact'], ...extra }
});
const ordinary = (title: string, extra: Record<string, unknown> = {}): Info => ({
  title, uuid: `u-${title}`, metadata: { title, 'system-keywords': ['general'], ...extra }
});

describe('PageManager.deleteTestArtifacts (#2008)', () => {
  test('deletes every test-artifact page and nothing without the keyword', async () => {
    const { manager, deleted } = makeManager([
      artifact('NGDPBASE-test-A'),
      ordinary('Welcome'),
      ordinary('Profile: Jane', { 'system-category': 'user-profile', author: 'jane' }),
      artifact('E2E Import Markdown x'),
      { title: 'No Keywords', uuid: 'u-nk', metadata: { title: 'No Keywords' } }
    ]);

    const result = await manager.deleteTestArtifacts(ADMIN);

    expect(deleted.sort()).toEqual(['E2E Import Markdown x', 'NGDPBASE-test-A']);
    expect(result.deleted.map((d) => d.title).sort()).toEqual(['E2E Import Markdown x', 'NGDPBASE-test-A']);
    expect(result.failed).toEqual([]);
  });

  test('records page-delete for each page, by the acting subject, before it deletes', async () => {
    const { manager, events, order } = makeManager([artifact('NGDPBASE-test-A')]);

    await manager.deleteTestArtifacts(ADMIN);

    expect(order).toEqual(['audit:NGDPBASE-test-A', 'delete:NGDPBASE-test-A']);
    expect(events[0]).toMatchObject({
      eventType: 'page-delete',
      user: 'admin',
      resource: 'u-NGDPBASE-test-A',
      metadata: expect.objectContaining({ pageName: 'NGDPBASE-test-A', reason: 'test-artifact' })
    });
  });

  test('a record that cannot be written refuses that delete', async () => {
    const { manager, deleted } = makeManager([artifact('NGDPBASE-test-A')], { auditFails: true });

    const result = await manager.deleteTestArtifacts(ADMIN);

    expect(deleted).toEqual([]);
    expect(result.deleted).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].title).toBe('NGDPBASE-test-A');
  });

  test('narrowed to one author and category: only that account\'s test-artifact profile', async () => {
    const { manager, deleted } = makeManager([
      artifact('Profile: e2e-ann', { author: 'e2e-ann', 'system-category': 'user-profile' }),
      artifact('Profile: e2e-bob', { author: 'e2e-bob', 'system-category': 'user-profile' }),
      artifact('NGDPBASE-test-by-ann', { author: 'e2e-ann', 'system-category': 'general' }),
      ordinary('Profile: e2e-ann (old)', { author: 'e2e-ann', 'system-category': 'user-profile' })
    ]);

    await manager.deleteTestArtifacts(ADMIN, { author: 'e2e-ann', systemCategory: 'user-profile' });

    expect(deleted).toEqual(['Profile: e2e-ann']);
  });

  test('the keyword matches whatever its case', async () => {
    const { manager, deleted } = makeManager([
      { title: 'Upper', uuid: 'u-up', metadata: { title: 'Upper', 'system-keywords': ['Test-Artifact'] } }
    ]);
    await manager.deleteTestArtifacts(ADMIN);
    expect(deleted).toEqual(['Upper']);
  });

  test('a context is mandatory', async () => {
    const { manager } = makeManager([artifact('NGDPBASE-test-A')]);
    await expect(manager.deleteTestArtifacts(undefined)).rejects.toThrow(/ActorContext/);
  });
});
