/**
 * #2073 — POST /profile/contact-details: a user saves their own phones and
 * emergency contact. The route always uses the signed-in user's own identity
 * record and IdentityManager's door (`updateContactPoints`, real merge and
 * checks are covered in IdentityManager.contacts.test.ts); here, what the
 * route sends and how it answers.
 *
 * Sabotaged once each (2026-10-25), and watched go red:
 * - the record looked up by a `username` field from the form → "never
 *   another user's record" went red;
 * - the ContactDetailsInvalidError branch removed → "a refused detail is
 *   named" went red (the generic failure was shown).
 * - the manager's phone message quoting the value again → "the value the
 *   user entered never reaches the redirect" went red.
 */

import WikiRoutes from '../WikiRoutes';
import IdentityManager, { ContactDetailsInvalidError } from '../../managers/IdentityManager';
import { ContactRefusedError } from '../../utils/contactAccess';

const OWN_ID = 'urn:uuid:11111111-1111-4111-8111-111111111111';

const createMockReq = (username: string, body: Record<string, unknown>) => ({
  params: {},
  query: {},
  body,
  session: { csrfToken: 'tok' },
  path: '/profile/contact-details',
  originalUrl: '/profile/contact-details',
  protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'),
  userContext: { username, isAuthenticated: true, roles: ['reader'] }
});

const createMockRes = () => ({
  status: vi.fn().mockReturnThis(),
  redirect: vi.fn().mockReturnThis(),
  render: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis()
});

function makeRoutes(fail?: Error) {
  const identityManager = {
    getByUserIdentifier: vi.fn((_ctx: unknown, username: string) => Promise.resolve({ '@id': username === 'pat' ? OWN_ID : 'urn:uuid:other', identifier: username })),
    updateContactPoints: vi.fn((..._args: unknown[]) => (fail ? Promise.reject(fail) : Promise.resolve({})))
  };
  const policyDecisionPoint = { permits: vi.fn(() => Promise.resolve(true)) };
  const managers: Record<string, unknown> = { IdentityManager: identityManager, PolicyDecisionPoint: policyDecisionPoint };
  const engine = { getManager: vi.fn((name: string) => managers[name] ?? null) };
  const routes = new WikiRoutes(engine);
  return { routes, identityManager };
}

const target = (res: ReturnType<typeof createMockRes>): string => decodeURIComponent(String(res.redirect.mock.calls[0]?.[0] ?? ''));

beforeEach(() => vi.clearAllMocks());

describe('POST /profile/contact-details (#2073)', () => {
  test('saves the user\'s own phones and emergency contact through the door, with their own context', async () => {
    const { routes, identityManager } = makeRoutes();
    const res = createMockRes();
    const req = createMockReq('pat', {
      phoneHome: '+1 555 0100', phoneMobile: '555 0199', phoneWork: '', phoneOther: '',
      emergencyName: 'Sam Sibling', emergencyPhone: '+1 555 0103', emergencyEmail: 'sam@example.org'
    });
    await routes.updateOwnContactDetails(req, res);

    expect(identityManager.updateContactPoints).toHaveBeenCalledTimes(1);
    const [ctx, id, given] = identityManager.updateContactPoints.mock.calls[0] as [{ username: string }, string, unknown[]];
    expect(ctx).toBe(req.userContext);
    expect(id).toBe(OWN_ID);
    expect(given).toEqual([
      { '@type': 'ContactPoint', contactType: 'home', telephone: '+1 555 0100' },
      { '@type': 'ContactPoint', contactType: 'mobile', telephone: '555 0199' },
      { '@type': 'ContactPoint', contactType: 'business', telephone: '' },
      { '@type': 'ContactPoint', contactType: 'other', telephone: '' },
      { '@type': 'ContactPoint', contactType: 'emergency', name: 'Sam Sibling', telephone: '+1 555 0103', email: 'sam@example.org' }
    ]);
    expect(target(res)).toBe('/profile?contactDetailsSaved=Contact details saved.#contact-details');
  });

  test('never another user\'s record: names in the form are ignored', async () => {
    const { routes, identityManager } = makeRoutes();
    const res = createMockRes();
    await routes.updateOwnContactDetails(createMockReq('pat', { username: 'sam', identifier: 'sam', personId: 'urn:uuid:other', id: 'urn:uuid:other', phoneHome: '+1 555 0100' }), res);
    expect(identityManager.getByUserIdentifier).toHaveBeenCalledWith(expect.objectContaining({ username: 'pat' }), 'pat');
    expect(identityManager.updateContactPoints.mock.calls[0][1]).toBe(OWN_ID);
  });

  test('a refused detail is named in plain words, and the user is told nothing was saved', async () => {
    const { routes } = makeRoutes(new ContactDetailsInvalidError('mobile', 'telephone', 'is not a phone number: use digits, with spaces, + ( ) - . if you like, 3 to 15 digits'));
    const res = createMockRes();
    await routes.updateOwnContactDetails(createMockReq('pat', { phoneMobile: 'call me' }), res);
    expect(target(res)).toBe('/profile?contactDetailsError=Mobile phone is not a phone number: use digits, with spaces, + ( ) - . if you like, 3 to 15 digits. Nothing was saved.#contact-details');

    const { routes: r2 } = makeRoutes(new ContactDetailsInvalidError('emergency', 'email', 'is not an email address'));
    const res2 = createMockRes();
    await r2.updateOwnContactDetails(createMockReq('pat', { emergencyEmail: 'x' }), res2);
    expect(target(res2)).toBe('/profile?contactDetailsError=Emergency contact email is not an email address. Nothing was saved.#contact-details');
  });

  test('the value the user entered never reaches the redirect (address bar, history, access logs)', async () => {
    // The real door's check, so a message that quotes the value goes red here.
    const engine = { getManager: (name: string) => managers[name] ?? null };
    const real = new IdentityManager(engine);
    const provider = { getById: vi.fn(() => Promise.resolve({ '@id': OWN_ID, identifier: 'pat', contactPoint: [] })), update: vi.fn() };
    (real as unknown as { provider: unknown }).provider = provider;
    vi.spyOn(real, 'getByUserIdentifier').mockResolvedValue({ '@context': 'https://schema.org', '@type': 'Person', '@id': OWN_ID, identifier: 'pat' });
    const managers: Record<string, unknown> = {
      IdentityManager: real,
      PolicyDecisionPoint: { permits: () => Promise.resolve(true), decide: () => Promise.resolve({ permit: true, applicable: true }) }
    };
    const routes = new WikiRoutes(engine);
    for (const [body, label] of [
      [{ phoneMobile: 'secret-call-me-0042' }, 'Mobile phone is not a phone number'],
      [{ emergencyEmail: 'secret-pat@nowhere' }, 'Emergency contact email is not an email address']
    ] as const) {
      const res = createMockRes();
      await routes.updateOwnContactDetails(createMockReq('pat', { ...body }), res);
      const url = String(res.redirect.mock.calls[0]?.[0] ?? '');
      expect(decodeURIComponent(url)).toContain(label);
      expect(decodeURIComponent(url)).not.toContain('secret');
      expect(url).not.toContain('secret');
    }
    expect(provider.update).not.toHaveBeenCalled();
  });

  test('a door refusal is answered as a refusal, never saved', async () => {
    const { routes } = makeRoutes(new ContactRefusedError('profile-manage', { permit: false, applicable: true, reason: 'test' }));
    const refuse = vi.spyOn(routes as unknown as { refuse: (...a: unknown[]) => Promise<void> }, 'refuse').mockResolvedValue(undefined);
    const res = createMockRes();
    await routes.updateOwnContactDetails(createMockReq('pat', { phoneHome: '+1 555 0100' }), res);
    expect(refuse).toHaveBeenCalledWith(expect.anything(), expect.anything(), res, 'page', 'profile-manage');
    expect(res.redirect).not.toHaveBeenCalled();
  });

  test('without profile-manage nothing is looked up or saved', async () => {
    const { routes, identityManager } = makeRoutes();
    vi.spyOn(routes as unknown as { permitted: (...a: unknown[]) => Promise<boolean> }, 'permitted').mockResolvedValue(false);
    await routes.updateOwnContactDetails(createMockReq('pat', { phoneHome: '+1 555 0100' }), createMockRes());
    expect(identityManager.getByUserIdentifier).not.toHaveBeenCalled();
    expect(identityManager.updateContactPoints).not.toHaveBeenCalled();
  });
});
