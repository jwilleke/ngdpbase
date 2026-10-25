/**
 * #2072: /reviews never puts a request's words in a URL. POST
 * /reviews/:id/decide redirects with a fixed outcome code and the id only; GET
 * /reviews builds the message from the code and the request as the store
 * holds it, read under the viewer's own decide check.
 *
 * Sabotaged once each (then restored), and the named test went red:
 * - the redirect back to `?success=Approved: <subject>`: "approve redirects with a code and the id only";
 * - the failure redirect back to `?error=<reason>`: "a failed handler redirects with a code and the id only";
 * - reviewOutcome showing an unknown code as text: "an unknown code shows nothing".
 */
import WikiRoutes from '../WikiRoutes';
import { ReviewHandlerFailedError, ReviewRefusedError } from '../../managers/ReviewManager';

const ID = '0b6f5d3e-1c2a-4f6b-9a7e-2d4c8e1f0a9b';
const request = (over: Record<string, unknown> = {}) => ({
  id: ID, kind: 'accommodation.new-owner', subject: 'Unit 12B', summary: 'Add Pat Lee as an owner', details: { Name: 'Pat Lee' },
  decidePermission: 'user-create', handlerId: 'accommodation.new-owner', status: 'approved', filedAt: '2026-10-25T00:00:00.000Z',
  filedBy: 'anonymous', decidedAt: null, decidedBy: 'dana', note: null, outcome: 'Account created for Pat Lee', failedAt: null, failure: null, ...over
});

function setup(reviews: Record<string, unknown>) {
  const routes = new WikiRoutes({ getManager: (n: string) => (n === 'ReviewManager' ? reviews : null) });
  const viewer = { username: 'dana', roles: ['reader'], isAuthenticated: true };
  vi.spyOn(routes as never, 'createWikiContext').mockReturnValue({ userContext: viewer, holdsPermission: () => Promise.resolve(false) });
  vi.spyOn(routes as never, 'permitted').mockResolvedValue(true);
  vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({});
  const res = { redirect: vi.fn(), render: vi.fn(), set: vi.fn() };
  return { routes, res, viewer };
}

const NAMES = ['Unit 12B', 'Pat Lee', 'Account created', 'could not be reached'];

describe('#2072 POST /reviews/:id/decide — the redirect carries no request text', () => {
  test('approve redirects with a code and the id only', async () => {
    const { routes, res } = setup({ decide: () => Promise.resolve(request()) });
    await routes.decideReview({ params: { id: ID }, body: { decision: 'approve' } }, res);
    expect(res.redirect).toHaveBeenCalledWith(`/reviews?done=approved&id=${ID}`);
  });

  test('a failed handler redirects with a code and the id only', async () => {
    const failed = request({ status: 'open', failure: 'Pat Lee could not be reached' });
    const { routes, res } = setup({ decide: () => { throw new ReviewHandlerFailedError(failed, 'Pat Lee could not be reached'); } });
    await routes.decideReview({ params: { id: ID }, body: { decision: 'approve' } }, res);
    const target = String(res.redirect.mock.calls[0][0]);
    expect(target).toBe(`/reviews?done=failed&id=${ID}`);
    for (const n of NAMES) expect(decodeURIComponent(target)).not.toContain(n);
  });

  test('an id that is not a request id is never put in the URL', async () => {
    const { routes, res } = setup({ decide: () => Promise.resolve(request({ status: 'rejected' })) });
    await routes.decideReview({ params: { id: '<script>' }, body: { decision: 'reject' } }, res);
    expect(res.redirect).toHaveBeenCalledWith('/reviews?done=rejected');
  });
});

describe('#2072 GET /reviews — the message is built from the store', () => {
  const page = (reviews: Record<string, unknown>, query: Record<string, unknown>) => {
    const { routes, res } = setup({ getUnavailableReason: () => null, listOpen: () => Promise.resolve([]), ...reviews });
    return routes.reviewsPage({ query, session: {} }, res).then(() => res.render.mock.calls[0][1] as { success: string; error: string });
  };

  test('approved: the subject and outcome come from the request, read with the viewer\'s context', async () => {
    const get = vi.fn(() => Promise.resolve(request()));
    const data = await page({ get }, { done: 'approved', id: ID });
    expect(data.success).toBe('Approved: Unit 12B. Account created for Pat Lee');
    expect(get).toHaveBeenCalledWith(expect.objectContaining({ username: 'dana' }), ID);
  });

  test('a request the viewer may not decide says nothing', async () => {
    const data = await page({ get: () => { throw new ReviewRefusedError('user-create', { permit: false, applicable: true, reason: 'no_policy' }); } }, { done: 'approved', id: ID });
    expect(data).toMatchObject({ success: '', error: '' });
  });

  test('an unknown code shows nothing, and text in the query is never shown', async () => {
    const data = await page({ get: () => Promise.resolve(request()) }, { done: 'Approved: you won a prize', id: ID, success: 'injected', error: 'injected' });
    expect(data).toMatchObject({ success: '', error: '' });
  });

  test('a code that does not match the stored status shows nothing', async () => {
    const data = await page({ get: () => Promise.resolve(request({ status: 'open' })) }, { done: 'approved', id: ID });
    expect(data).toMatchObject({ success: '', error: '' });
  });
});
