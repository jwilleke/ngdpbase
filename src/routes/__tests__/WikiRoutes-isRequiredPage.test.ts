/**
 * WikiRoutes.isRequiredPage() — whether a page is a shipped page, which is
 * admin-only to edit, delete or rename and never private (#174).
 *
 * #1503 (operator, 2026-10-29): decided per page, never by system-category. A
 * page is shipped when its uuid is in the site's seeded-pages record, from
 * required-pages/ or an add-on's pages alike. A page made on this site is not
 * shipped, whatever its system-category.
 */

import WikiRoutes from '../WikiRoutes';

const SHIPPED_REQUIRED = 'aaaaaaaa-0000-4000-8000-000000000001';
const SHIPPED_ADDON = 'aaaaaaaa-0000-4000-8000-000000000002';
const SITE_MADE = 'aaaaaaaa-0000-4000-8000-000000000003';

describe('WikiRoutes.isRequiredPage() (#174, #1503)', () => {
  let wikiRoutes: WikiRoutes;
  let mockPageManager: { getPageMetadata: ReturnType<typeof vi.fn>; isShippedPageCopy: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockPageManager = {
      getPageMetadata: vi.fn(),
      isShippedPageCopy: vi.fn(async (uuid: string) => [SHIPPED_REQUIRED, SHIPPED_ADDON].includes(uuid))
    };
    wikiRoutes = new WikiRoutes({ getManager: vi.fn((name: string) => (name === 'PageManager' ? mockPageManager : null)) });
  });

  const isRequired = (metadata: Record<string, unknown> | null) => {
    mockPageManager.getPageMetadata.mockResolvedValue(metadata);
    return wikiRoutes.isRequiredPage('Test Page', { username: 'someone' });
  };

  test('a seeded required page is shipped', async () => {
    expect(await isRequired({ uuid: SHIPPED_REQUIRED, 'system-category': 'documentation' })).toBe(true);
    expect(mockPageManager.isShippedPageCopy).toHaveBeenCalledWith(SHIPPED_REQUIRED);
  });

  test('a seeded add-on page is shipped, like a required page', async () => {
    expect(await isRequired({ uuid: SHIPPED_ADDON, 'system-category': 'addon', addon: 'demo' })).toBe(true);
  });

  test('a page made on the site in a shipped system-category is not shipped', async () => {
    expect(await isRequired({ uuid: SITE_MADE, 'system-category': 'system' })).toBe(false);
    expect(await isRequired({ uuid: SITE_MADE, 'system-category': 'addon' })).toBe(false);
  });

  test('a page with no uuid, or none at all, is not shipped', async () => {
    expect(await isRequired({ title: 'Test Page', 'system-category': 'system' })).toBe(false);
    expect(await isRequired(null)).toBe(false);
  });

  test('a failure reads as not shipped', async () => {
    mockPageManager.getPageMetadata.mockRejectedValue(new Error('Database error'));
    expect(await wikiRoutes.isRequiredPage('Error Page', { username: 'someone' })).toBe(false);
  });
});
