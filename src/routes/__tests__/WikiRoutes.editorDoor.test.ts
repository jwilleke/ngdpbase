/**
 * #2255 — the editor's door: what `/edit/<page>` asks of policy.
 *
 * A page that exists is opened for `page-edit` about the page. A page not
 * made yet is a create: in a vault, `page-create` about the page (#1539);
 * otherwise the capability, since the title may not be a valid page name
 * yet. A `/` in it never matches a `page: *` resource (micromatch), so asked
 * about the page the editor was refused to everyone, admin included (e2e
 * editor-submit: "a title with / stays in the editor"). The save's door
 * still decides the create about the page.
 */

import WikiRoutes from '../WikiRoutes';
import { createMockWikiContext } from './__fixtures__/createMockWikiContext';
import { formatPrivatePageName } from '../../utils/privateStorePath';

const USER = { username: 'carol', roles: ['editor'], isAuthenticated: true };

function editorFor(pageName: string, pageData: unknown) {
  const pageManager = { getPage: vi.fn().mockResolvedValue(pageData) };
  const engine = { getManager: vi.fn((name: string) => (name === 'PageManager' ? pageManager : null)) };
  const routes = new WikiRoutes(engine);
  const spied = routes as unknown as Record<'createWikiContext' | 'isRequiredPage' | 'permitted', (...args: unknown[]) => unknown>;
  vi.spyOn(spied, 'createWikiContext').mockReturnValue(createMockWikiContext({ userContext: USER }));
  vi.spyOn(spied, 'isRequiredPage').mockResolvedValue(false);
  // Stop at the door: what it was asked is the point.
  const permitted = vi.spyOn(spied, 'permitted').mockResolvedValue(false);
  const req = { params: { page: pageName }, session: {}, path: `/edit/${pageName}`, originalUrl: `/edit/${pageName}`, userContext: USER, headers: { accept: 'text/html' }, query: {} };
  const res = { status: vi.fn().mockReturnThis(), render: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), redirect: vi.fn().mockReturnThis() };
  return { open: () => routes.editPage(req, res), permitted };
}

describe('WikiRoutes.editPage — the door it asks (#2255)', () => {
  afterEach(() => vi.restoreAllMocks());

  test('a page that exists: page-edit about the page', async () => {
    const { open, permitted } = editorFor('Existing', { content: 'x', metadata: { title: 'Existing' } });
    await open();
    expect(permitted).toHaveBeenCalledWith(expect.anything(), 'page-edit', expect.anything(), expect.anything(), 'page', 'Existing');
  });

  test('a new page whose title has /: page-create, the capability', async () => {
    const { open, permitted } = editorFor('NGDPBASE-test-Slash/1', null);
    await open();
    expect(permitted).toHaveBeenCalledWith(expect.anything(), 'page-create', expect.anything(), expect.anything(), 'page', undefined);
  });

  test('a new page in a vault: page-create about the page', async () => {
    const name = formatPrivatePageName('carol', 'default', 'Notes');
    const { open, permitted } = editorFor(name, null);
    await open();
    expect(permitted).toHaveBeenCalledWith(expect.anything(), 'page-create', expect.anything(), expect.anything(), 'page', name);
  });
});
