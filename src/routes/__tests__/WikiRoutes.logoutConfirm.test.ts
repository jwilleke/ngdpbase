/**
 * #1631: GET /logout asks; only the CSRF-checked POST signs out, so another
 * site cannot sign someone out by linking or redirecting to /logout.
 */
import WikiRoutes from '../WikiRoutes';

describe('#1631 GET /logout confirms instead of signing out', () => {
  const routes = new WikiRoutes({ getManager: () => null });
  vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({ csrfToken: 't' });

  test('a signed-in session sees the confirm page and stays signed in', async () => {
    const destroy = vi.fn();
    const req = { session: { username: 'molly', destroy } };
    const res = { render: vi.fn(), redirect: vi.fn(), set: vi.fn() };
    await routes.confirmLogout(req, res);
    expect(res.render).toHaveBeenCalledWith('logout-confirm', expect.objectContaining({ csrfToken: 't' }));
    expect(destroy).not.toHaveBeenCalled();
  });

  test('a signed-out visitor is sent home', async () => {
    const res = { render: vi.fn(), redirect: vi.fn(), set: vi.fn() };
    await routes.confirmLogout({ session: {} }, res);
    expect(res.redirect).toHaveBeenCalledWith('/');
    expect(res.render).not.toHaveBeenCalled();
  });
});
