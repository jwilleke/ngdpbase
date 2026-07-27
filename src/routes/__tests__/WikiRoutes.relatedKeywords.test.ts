/**
 * Tests for GET /api/keywords/related (#882) — co-occurring user keywords
 * ranked by shared-page count, ACL-safe via advancedSearchWithContext.
 */

import WikiRoutes from '../WikiRoutes';
import type { WikiEngine } from '../../types/WikiEngine';

const createMockReq = (query = {}) => ({
  params: {},
  query,
  body: {},
  session: {},
  path: '/api/keywords/related',
  userContext: { username: 'jim', isAuthenticated: true, roles: ['admin'] }
});

const createMockRes = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis()
});

const hit = (kwCsv: string) => ({ metadata: { userKeywords: kwCsv } });

describe('WikiRoutes relatedKeywords (#882)', () => {
  let wikiRoutes;
  let mockAdvancedSearch;

  beforeEach(() => {
    mockAdvancedSearch = vi.fn().mockResolvedValue([]);
    const mockEngine = {
      getManager: vi.fn((name) => {
        if (name === 'SearchManager') return { advancedSearchWithContext: mockAdvancedSearch };
        return null;
      })
    };
    wikiRoutes = new WikiRoutes(mockEngine);
  });

  test('400 without keyword', async () => {
    const res = createMockRes();
    await wikiRoutes.relatedKeywords(createMockReq({}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('counts co-occurring keywords, excludes the seed, ranks by count', async () => {
    mockAdvancedSearch.mockResolvedValue([
      hit('travel, 2026-trip-west, tesla'),
      hit('travel, 2026-trip-west'),
      hit('travel, oregon'),
      hit('travel')
    ]);
    const res = createMockRes();
    await wikiRoutes.relatedKeywords(createMockReq({ keyword: 'travel' }), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.pages).toBe(4);
    expect(payload.related).toEqual([
      { keyword: '2026-trip-west', count: 2 },
      { keyword: 'oregon', count: 1 },
      { keyword: 'tesla', count: 1 }
    ]);
    // seed excluded regardless of case
    expect(payload.related.some(r => r.keyword.toLowerCase() === 'travel')).toBe(false);
    // filter passed through to the ACL-safe search
    expect(mockAdvancedSearch.mock.calls[0][1]).toMatchObject({ userKeywords: ['travel'] });
  });

  test('caps at 12 related keywords', async () => {
    const many = Array.from({ length: 20 }, (_, i) => `kw${i}`).join(', ');
    mockAdvancedSearch.mockResolvedValue([hit(`seed, ${many}`)]);
    const res = createMockRes();
    await wikiRoutes.relatedKeywords(createMockReq({ keyword: 'seed' }), res);
    expect(res.json.mock.calls[0][0].related).toHaveLength(12);
  });

  test('empty result set yields empty related list', async () => {
    const res = createMockRes();
    await wikiRoutes.relatedKeywords(createMockReq({ keyword: 'lonely' }), res);
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true, related: [] });
  });

  test('503 when SearchManager unavailable', async () => {
    const engine = { getManager: vi.fn(() => null) };
    const routes = new WikiRoutes(engine);
    const res = createMockRes();
    await routes.relatedKeywords(createMockReq({ keyword: 'x' }), res);
    expect(res.status).toHaveBeenCalledWith(503);
  });
});
