/**
 * The "Move into vault" routes — #1842.
 *
 * POST /vault-repair and POST /vault-repair/all are form posts: the app-wide
 * CSRF middleware refuses one without the session's token before the handler
 * runs. Who may repair is the door's (`PageManager.repairVaultPage`, tested in
 * PageManager.vaultRepair.test.ts); the route forwards the request's subject
 * as it came, never rebuilt, and answers the door's refusal in plain words.
 */
import request from 'supertest';
import type { Express, Request } from 'express';
import WikiRoutes from '../WikiRoutes';
import { buildTestApp } from './__fixtures__/buildTestApp';
import { csrfTestBodyField } from '../../middleware/__tests__/__fixtures__/csrfTestHelpers';

describe('POST /vault-repair (#1842)', () => {
  let app: Express;
  let user: { username: string; isAuthenticated: boolean; roles: string[] } | null;
  let repairVaultPage: ReturnType<typeof vi.fn>;
  let repairAllVaultPages: ReturnType<typeof vi.fn>;

  const counts = { filesMoved: 1, filesCopied: 0, footnotes: 1, comments: 0 };

  beforeEach(() => {
    user = { username: 'admin', isAuthenticated: true, roles: ['admin'] };
    repairVaultPage = vi.fn(async () => ({ ok: true, as: 'admin', ...counts }));
    repairAllVaultPages = vi.fn(async () => ({ repaired: 1, refused: 0, failed: 0, ...counts }));
    const managers: Record<string, unknown> = { PageManager: { repairVaultPage, repairAllVaultPages } };
    const routes = new WikiRoutes({ getManager: (name: string) => managers[name] ?? null });
    vi.spyOn(routes, 'createWikiContext').mockImplementation((req: Request) => ({ userContext: req.userContext }) as unknown as ReturnType<WikiRoutes['createWikiContext']>);
    vi.spyOn(routes, 'renderError').mockImplementation(async (_req, res, status: number) => { res.status(status).send('refused'); });
    app = buildTestApp({ withCsrf: true, userContext: () => user });
    app.post('/vault-repair', (req, res) => void routes.vaultRepair(req, res, false));
    app.post('/vault-repair/all', (req, res) => void routes.vaultRepair(req, res, true));
  });

  const form = { owner: 'molly', vault: 'notes', page: 'abababab-abab-4bab-8bab-abababababab' };

  test('without the CSRF token it is refused before anything is repaired', async () => {
    await request(app).post('/vault-repair').type('form').send(form).expect(403);
    await request(app).post('/vault-repair/all').type('form').send({}).expect(403);
    expect(repairVaultPage).not.toHaveBeenCalled();
    expect(repairAllVaultPages).not.toHaveBeenCalled();
  });

  test('with it, the request\'s own subject is handed to the door and the counts come back', async () => {
    const res = await request(app).post('/vault-repair').type('form').send({ ...csrfTestBodyField(), ...form }).expect(303);
    expect(repairVaultPage).toHaveBeenCalledWith(form, expect.objectContaining({ username: 'admin' }));
    expect(decodeURIComponent(res.headers.location)).toMatch(/^\/admin\?success=1 file\(s\) moved/);
  });

  test('the door\'s refusal is answered in its words, and nothing is claimed done', async () => {
    repairVaultPage.mockResolvedValue({ ok: false, refusal: 'owner-only', message: "molly's vault 'phr' is sealed: only molly can move these into it" });
    const res = await request(app).post('/vault-repair').type('form').send({ ...csrfTestBodyField(), ...form, vault: 'phr' }).expect(303);
    expect(decodeURIComponent(res.headers.location)).toMatch(/^\/admin\?error=molly's vault 'phr' is sealed/);
  });

  test('a request with no subject is sent to sign in (the page form of 401) and the door is never asked', async () => {
    user = null;
    await request(app).post('/vault-repair').type('form').send({ ...csrfTestBodyField(), ...form }).expect(302).expect('Location', /^\/login/);
    expect(repairVaultPage).not.toHaveBeenCalled();
  });

  test('when the door denies, an anonymous subject is sent to sign in and a signed-in one gets 403', async () => {
    repairVaultPage.mockResolvedValue({ ok: false, refusal: 'denied', message: 'no' });
    user = { username: 'Anonymous', isAuthenticated: false, roles: ['anonymous'] };
    await request(app).post('/vault-repair').type('form').send({ ...csrfTestBodyField(), ...form }).expect(302).expect('Location', /^\/login/);
    user = { username: 'bob', isAuthenticated: true, roles: ['editor'] };
    await request(app).post('/vault-repair').type('form').send({ ...csrfTestBodyField(), ...form }).expect(403);
    expect(repairVaultPage).toHaveBeenLastCalledWith(form, expect.objectContaining({ username: 'bob' }));
  });

  test('from the profile, "Move all" repairs only the caller\'s own vaults and returns there', async () => {
    user = { username: 'molly', isAuthenticated: true, roles: ['editor'] };
    const res = await request(app).post('/vault-repair/all').type('form').send({ ...csrfTestBodyField(), return: 'profile' }).expect(303);
    expect(repairAllVaultPages).toHaveBeenCalledWith(expect.objectContaining({ username: 'molly' }), { ownOnly: true });
    expect(res.headers.location).toMatch(/^\/profile\?vaultRepair=.*#vault-repairs$/);
  });
});
