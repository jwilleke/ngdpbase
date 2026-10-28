/**
 * #2093 — the Executive Hub. GET /executive asks `executive-read`, never a
 * role name; its pending list is ReviewManager.listOpen and its cards are
 * AddonsManager.executiveCardsFor, both asked with the viewer's context.
 * Deciding goes through POST /reviews/:id/decide, which sends the viewer back
 * to the hub only when the form asks for it by the fixed word, never a URL.
 *
 * Sabotaged once each (then restored), and the named test went red:
 * - executivePage asking 'admin-read': "it asks executive-read";
 * - decideReview redirecting to body.return as given: "anything else in return goes back to /reviews".
 */
import WikiRoutes from '../WikiRoutes';

const ID = '0b6f5d3e-1c2a-4f6b-9a7e-2d4c8e1f0a9b';
const viewer = { username: 'dana', roles: ['reader'], isAuthenticated: true };
const request = { id: ID, kind: 'accommodation.new-owner', subject: 'Unit 12B', summary: 'Add an owner', status: 'open' };
const card = { addonName: 'accounting', title: 'Accounting', icon: 'fas fa-book', adminUrl: '/accounting', figures: [], message: '', failed: false };

function setup(allowed: boolean) {
  const reviews = {
    getUnavailableReason: () => null,
    listOpen: vi.fn(() => Promise.resolve([request])),
    decide: vi.fn(() => Promise.resolve({ ...request, status: 'rejected' }))
  };
  const addons = { executiveCardsFor: vi.fn(() => Promise.resolve([card])) };
  const routes = new WikiRoutes({ getManager: (n: string) => (n === 'ReviewManager' ? reviews : n === 'AddonsManager' ? addons : null) });
  vi.spyOn(routes as never, 'createWikiContext').mockReturnValue({ userContext: viewer, holdsPermission: () => Promise.resolve(false) });
  const permitted = vi.spyOn(routes as never, 'permitted').mockResolvedValue(allowed);
  vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({});
  const res = { redirect: vi.fn(), render: vi.fn(), set: vi.fn() };
  return { routes, res, reviews, addons, permitted };
}

describe('#2093 GET /executive', () => {
  test('it asks executive-read, and renders nothing when refused', async () => {
    const { routes, res, permitted, reviews } = setup(false);
    await routes.executivePage({ query: {}, session: {} }, res);
    expect(permitted).toHaveBeenCalledWith(expect.anything(), 'executive-read', expect.anything(), res, 'page');
    expect(res.render).not.toHaveBeenCalled();
    expect(reviews.listOpen).not.toHaveBeenCalled();
  });

  test('allowed: the pending requests and cards are read with the viewer\'s context', async () => {
    const { routes, res, reviews, addons } = setup(true);
    await routes.executivePage({ query: {}, session: { csrfToken: 't' } }, res);
    expect(reviews.listOpen).toHaveBeenCalledWith(viewer);
    expect(addons.executiveCardsFor).toHaveBeenCalledWith(viewer);
    expect(res.render).toHaveBeenCalledWith('executive', expect.objectContaining({ requests: [request], cards: [card], unavailable: false }));
  });
});

describe('#2093 POST /reviews/:id/decide from the hub', () => {
  test('return=executive goes back to the hub with a code and the id', async () => {
    const { routes, res } = setup(true);
    await routes.decideReview({ params: { id: ID }, body: { decision: 'reject', return: 'executive' } }, res);
    expect(res.redirect).toHaveBeenCalledWith(`/executive?done=rejected&id=${ID}`);
  });

  test('anything else in return goes back to /reviews', async () => {
    const { routes, res } = setup(true);
    await routes.decideReview({ params: { id: ID }, body: { decision: 'reject', return: 'https://evil.example/' } }, res);
    expect(res.redirect).toHaveBeenCalledWith(`/reviews?done=rejected&id=${ID}`);
  });
});
