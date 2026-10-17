/**
 * /profile journal count (#1868).
 *
 * The journal add-on's `countByAuthor(author, ctx)` is async and reads as the
 * requester. Called without the context and without `await`, it rejected
 * outside the surrounding try/catch and the unhandled rejection killed the
 * process; `counts.journal` held a Promise.
 */

import WikiRoutes from '../WikiRoutes';
import logger from '../../utils/logger';

const ctx = { username: 'alice', isAuthenticated: true, roles: ['reader'] };

function countsWith(countByAuthor: ReturnType<typeof vi.fn>) {
  const managers: Record<string, unknown> = {
    PageManager: { listOwnDeletedPrivatePages: vi.fn().mockResolvedValue([]) },
    JournalDataManager: { countByAuthor }
  };
  const routes = new WikiRoutes({ getManager: vi.fn((name: string) => managers[name] ?? null) });
  const getCounts = (routes as unknown as {
    getMyContributionsCounts(u: string, user: unknown, c: unknown): Promise<{ journal: unknown }>;
  }).getMyContributionsCounts.bind(routes);
  return getCounts('alice', { roles: ['reader'] }, ctx);
}

afterEach(() => vi.restoreAllMocks());

describe('getMyContributionsCounts journal count (#1868)', () => {
  test('passes the request context and stores the resolved number', async () => {
    const countByAuthor = vi.fn().mockResolvedValue(5);
    const counts = await countsWith(countByAuthor);
    expect(countByAuthor).toHaveBeenCalledWith('alice', ctx);
    expect(counts.journal).toBe(5);
  });

  test('a rejecting countByAuthor is logged, not propagated', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const countByAuthor = vi.fn().mockRejectedValue(new TypeError('boom'));
    const counts = await countsWith(countByAuthor);
    expect(counts.journal).toBeUndefined();
    expect(warn).toHaveBeenCalledWith('[/profile] getMyContributionsCounts: journal count failed', { error: 'boom' });
  });
});
