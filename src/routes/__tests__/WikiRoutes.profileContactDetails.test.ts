/**
 * #2073 — POST /profile/contact-details: a user saves their own contact
 * details. The route always uses the signed-in user's own identity record
 * (IdentityManager's `updateContactDetails`, whose rules are covered in
 * IdentityManager.contacts.test.ts) and account (UserManager's `updateUser`
 * for the name and email); here, what the route sends and how it answers.
 *
 * Sabotaged once each (2026-10-25), and watched go red:
 * - the record looked up by a `username` field from the form → "never
 *   another user's record" went red;
 * - the ContactDetailsInvalidError branch removed → "a refused detail is
 *   named" went red (the generic failure was shown);
 * - the manager's phone message quoting the value → "the value the user
 *   entered never reaches the redirect" went red;
 * - the account-security step-up skipped for a changed email → "a changed
 *   email asks account-security" went red;
 * - the shared-account lock skipped → "a shared account's name and email
 *   stay an administrator's" went red;
 * - the email sent to UserManager on every save → "an unchanged name and
 *   email are not sent" went red;
 * - the identity record written before the account again → "the account is
 *   written first" went red (the record was written though the account
 *   change failed);
 * - the checks run inside the write only → "a bad detail is refused before
 *   the account is written" went red.
 */

import WikiRoutes from '../WikiRoutes';
import IdentityManager, { ContactDetailsInvalidError } from '../../managers/IdentityManager';
import { ContactRefusedError } from '../../utils/contactAccess';

const OWN_ID = 'urn:uuid:11111111-1111-4111-8111-111111111111';
const ACCOUNT = { username: 'pat', displayName: 'Pat', email: 'pat@example.org' };
/** The form as the card posts it unchanged. */
const FORM = { displayName: 'Pat', email: 'pat@example.org' };

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

/**
 * `fail`: what the identity door's check throws (a bad detail); `identityFail`: what its write
 * rejects with; `lookupFail`: what reading the user's own record rejects with.
 */
function makeRoutes(opts: { fail?: Error; identityFail?: Error; lookupFail?: Error; accountFail?: Error; account?: Record<string, unknown>; mail?: boolean; sent?: string } = {}) {
  const order: string[] = [];
  const identityManager = {
    checkContactDetails: vi.fn((..._args: unknown[]) => { order.push('check'); if (opts.fail) throw opts.fail; }),
    getByUserIdentifier: vi.fn((_ctx: unknown, username: string) => (opts.lookupFail ? Promise.reject(opts.lookupFail) : Promise.resolve({ '@id': username === 'pat' ? OWN_ID : 'urn:uuid:other', identifier: username }))),
    updateContactDetails: vi.fn((..._args: unknown[]) => { order.push('identity'); return opts.identityFail ? Promise.reject(opts.identityFail) : Promise.resolve({}); })
  };
  const userManager = {
    getUser: vi.fn(() => Promise.resolve(opts.account ?? ACCOUNT)),
    updateUser: vi.fn((..._args: unknown[]) => { order.push('account'); return opts.accountFail ? Promise.reject(opts.accountFail) : Promise.resolve(ACCOUNT); }),
    // #2073: never asked by the form, so its answer cannot tell whose an address is.
    assertAdminEmailUnshared: vi.fn((..._args: unknown[]) => Promise.resolve())
  };
  // #2073: a user's own new email is sent a link to confirm it; it is never written here.
  const authManager = {
    emailLinksAvailable: vi.fn(() => opts.mail !== false),
    requestEmailChange: vi.fn((..._args: unknown[]) => { order.push('link'); return Promise.resolve(opts.sent ?? 'sent'); })
  };
  const policyDecisionPoint = { permits: vi.fn(() => Promise.resolve(true)) };
  const managers: Record<string, unknown> = { IdentityManager: identityManager, UserManager: userManager, PolicyDecisionPoint: policyDecisionPoint, AuthManager: authManager };
  const engine = { getManager: vi.fn((name: string) => managers[name] ?? null) };
  const routes = new WikiRoutes(engine);
  return { routes, identityManager, userManager, authManager, order };
}

const target = (res: ReturnType<typeof createMockRes>): string => decodeURIComponent(String(res.redirect.mock.calls[0]?.[0] ?? ''));

beforeEach(() => vi.clearAllMocks());

describe('POST /profile/contact-details (#2073)', () => {
  test('saves the user\'s own details through the identity door, with their own context, and the name and email through the account door', async () => {
    const { routes, identityManager, userManager } = makeRoutes();
    const res = createMockRes();
    const req = createMockReq('pat', {
      displayName: 'Pat Doe', email: 'pat@example.org', givenName: 'Pat', familyName: 'Doe',
      homePhone: '(415) 555-2671', homePhoneCountry: 'US', homePhoneExt: '',
      mobilePhone: '020 7946 0958', mobilePhoneCountry: 'GB', mobilePhoneExt: '12',
      emergencyName: 'Sam Sibling', emergencyEmail: 'sam@example.org', emergencyPhone: '+1 415 555 2672', emergencyPhoneCountry: 'US',
      addressStreet: '1 Home St', addressCity: 'Town', addressRegion: 'CA', addressPostalCode: '94000', addressCountry: 'US',
      mailingStreet: '', mailingCountry: 'US',
      languages: 'English, Spanish', image: 'https://example.org/pat.jpg', links: 'https://example.org/a\r\nhttps://example.org/b'
    });
    await routes.updateOwnContactDetails(req, res);

    const [ctx, id, details] = identityManager.updateContactDetails.mock.calls[0] as [unknown, string, Record<string, unknown>];
    expect(ctx).toBe(req.userContext);
    expect(id).toBe(OWN_ID);
    expect(details).toMatchObject({
      givenName: 'Pat', familyName: 'Doe',
      phones: [
        { contactType: 'home', number: '(415) 555-2671', country: 'US', extension: '' },
        { contactType: 'mobile', number: '020 7946 0958', country: 'GB', extension: '12' },
        { contactType: 'business', number: '' },
        { contactType: 'other', number: '' }
      ],
      emergency: { name: 'Sam Sibling', email: 'sam@example.org', phone: { number: '+1 415 555 2672', country: 'US' } },
      address: { streetAddress: '1 Home St', addressLocality: 'Town', addressRegion: 'CA', postalCode: '94000', addressCountry: 'US' },
      mailing: { streetAddress: '' },
      knowsLanguage: ['English', ' Spanish'],
      image: 'https://example.org/pat.jpg',
      sameAs: ['https://example.org/a', 'https://example.org/b']
    });
    expect(userManager.updateUser).toHaveBeenCalledWith('pat', { displayName: 'Pat Doe' }, req.userContext);
    expect(target(res)).toBe('/profile?contactDetailsSaved=Contact details saved.#contact-details');
  });

  test('an unchanged name and email are not sent to the account door', async () => {
    const { routes, userManager } = makeRoutes();
    const res = createMockRes();
    await routes.updateOwnContactDetails(createMockReq('pat', { ...FORM, homePhone: '(415) 555-2671' }), res);
    expect(userManager.updateUser).not.toHaveBeenCalled();
    expect(target(res)).toContain('contactDetailsSaved=');
  });

  test('never another user\'s record: names in the form are ignored', async () => {
    const { routes, identityManager, userManager } = makeRoutes();
    await routes.updateOwnContactDetails(createMockReq('pat', { ...FORM, displayName: 'P', username: 'sam', identifier: 'sam', personId: 'urn:uuid:other', id: 'urn:uuid:other' }), createMockRes());
    expect(identityManager.getByUserIdentifier).toHaveBeenCalledWith(expect.objectContaining({ username: 'pat' }), 'pat');
    expect(identityManager.updateContactDetails.mock.calls[0][1]).toBe(OWN_ID);
    expect(userManager.getUser).toHaveBeenCalledWith('pat');
    expect(userManager.updateUser.mock.calls[0][0]).toBe('pat');
  });

  test('a refused detail is named in plain words, and the user is told nothing was saved', async () => {
    const { routes, userManager } = makeRoutes({ fail: new ContactDetailsInvalidError('mobile', 'telephone', 'is not a phone number we can read: check it and the country beside it') });
    const res = createMockRes();
    await routes.updateOwnContactDetails(createMockReq('pat', { ...FORM, email: 'new@example.org', mobilePhone: 'call me' }), res);
    expect(target(res)).toBe('/profile?contactDetailsError=Mobile phone is not a phone number we can read: check it and the country beside it. Nothing was saved.#contact-details');
    expect(userManager.updateUser).not.toHaveBeenCalled();

    for (const [part, field, label] of [
      ['emergency', 'email', 'Emergency contact email'], ['business', 'extension', 'Work phone extension'],
      ['mailing', 'postalCode', 'Mailing address postal code'], ['address', 'addressCountry', 'Home address country'],
      ['knowsLanguage', 'language', 'Languages'], ['image', 'url', 'Photo'], ['sameAs', 'url', 'Links']
    ] as const) {
      const { routes: r } = makeRoutes({ fail: new ContactDetailsInvalidError(part, field, 'is wrong') });
      const out = createMockRes();
      await r.updateOwnContactDetails(createMockReq('pat', { ...FORM }), out);
      expect(target(out)).toBe(`/profile?contactDetailsError=${label} is wrong. Nothing was saved.#contact-details`);
    }
  });

  test('the value the user entered never reaches the redirect (address bar, history, access logs)', async () => {
    // The real door's checks, so a message that quotes the value goes red here.
    const managers: Record<string, unknown> = {};
    const engine = { getManager: (name: string) => managers[name] ?? null };
    const real = new IdentityManager(engine);
    const provider = { getById: vi.fn(() => Promise.resolve({ '@id': OWN_ID, identifier: 'pat', contactPoint: [] })), update: vi.fn() };
    (real as unknown as { provider: unknown }).provider = provider;
    vi.spyOn(real, 'getByUserIdentifier').mockResolvedValue({ '@context': 'https://schema.org', '@type': 'Person', '@id': OWN_ID, identifier: 'pat' });
    Object.assign(managers, {
      IdentityManager: real,
      UserManager: { getUser: () => Promise.resolve(ACCOUNT), updateUser: vi.fn() },
      PolicyDecisionPoint: { permits: () => Promise.resolve(true), decide: () => Promise.resolve({ permit: true, applicable: true }) }
    });
    const routes = new WikiRoutes(engine);
    for (const [body, label] of [
      [{ mobilePhone: 'secret-call-me-0042' }, 'Mobile phone is not a phone number'],
      [{ emergencyEmail: 'secret-pat@nowhere' }, 'Emergency contact email is not an email address'],
      [{ mailingStreet: 'secret 1 Box', mailingCountry: 'XX' }, 'Mailing address country is not a country on the list'],
      [{ image: 'secret:pat' }, 'Photo is not a web address'],
      [{ email: 'secret-not-an-email' }, 'Email is not an email address']
    ] as const) {
      const res = createMockRes();
      await routes.updateOwnContactDetails(createMockReq('pat', { ...FORM, ...body }), res);
      const url = String(res.redirect.mock.calls[0]?.[0] ?? '');
      expect(decodeURIComponent(url)).toContain(label);
      expect(decodeURIComponent(url)).not.toContain('secret');
      expect(url).not.toContain('secret');
    }
    expect(provider.update).not.toHaveBeenCalled();
  });

  test('a name and an email are needed, and the email must be one; nothing is saved otherwise', async () => {
    for (const [body, message] of [
      [{ ...FORM, displayName: ' ' }, 'Name is needed. Nothing was saved.'],
      [{ ...FORM, email: '' }, 'Email is needed. Nothing was saved.'],
      [{ ...FORM, email: 'nope' }, 'Email is not an email address. Nothing was saved.']
    ] as const) {
      const { routes, identityManager, userManager } = makeRoutes();
      const res = createMockRes();
      await routes.updateOwnContactDetails(createMockReq('pat', { ...body }), res);
      expect(target(res)).toBe(`/profile?contactDetailsError=${message}#contact-details`);
      expect(identityManager.updateContactDetails).not.toHaveBeenCalled();
      expect(userManager.updateUser).not.toHaveBeenCalled();
    }
  });

  test('a changed email asks account-security (#1525); refused, nothing is saved', async () => {
    const { routes, identityManager, userManager } = makeRoutes();
    const permitted = vi.spyOn(routes as unknown as { permitted: (...a: unknown[]) => Promise<boolean> }, 'permitted')
      .mockImplementation((_w: unknown, action: unknown) => Promise.resolve(action !== 'account-security'));
    await routes.updateOwnContactDetails(createMockReq('pat', { ...FORM, email: 'new@example.org' }), createMockRes());
    expect(permitted.mock.calls.map((c) => c[1])).toEqual(['profile-manage', 'account-security']);
    expect(identityManager.updateContactDetails).not.toHaveBeenCalled();
    expect(userManager.updateUser).not.toHaveBeenCalled();

    // Allowed: a link is sent to the new address; the email itself is not written (#2073).
    const ok = makeRoutes();
    const res = createMockRes();
    await ok.routes.updateOwnContactDetails(createMockReq('pat', { ...FORM, email: 'new@example.org' }), res);
    expect(ok.userManager.updateUser).not.toHaveBeenCalled();
    expect(ok.authManager.requestEmailChange).toHaveBeenCalledWith(expect.objectContaining({ username: 'pat' }), 'pat', 'new@example.org', 'profile');
    expect(target(res)).toBe('/profile?contactDetailsSaved=Contact details saved.#contact-details');
  });

  test('a shared account\'s name and email stay an administrator\'s (#1029); its other details save', async () => {
    const locked = { ...ACCOUNT, profileLocked: true };
    for (const body of [{ ...FORM, email: 'mine@example.org' }, { ...FORM, displayName: 'Owned' }]) {
      const { routes, identityManager, userManager } = makeRoutes({ account: locked });
      const res = createMockRes();
      await routes.updateOwnContactDetails(createMockReq('pat', body), res);
      expect(target(res)).toContain('can only be changed by an administrator');
      expect(identityManager.updateContactDetails).not.toHaveBeenCalled();
      expect(userManager.updateUser).not.toHaveBeenCalled();
    }
    const { routes, identityManager } = makeRoutes({ account: locked });
    const res = createMockRes();
    await routes.updateOwnContactDetails(createMockReq('pat', { ...FORM, homePhone: '(415) 555-2671' }), res);
    expect(identityManager.updateContactDetails).toHaveBeenCalled();
    expect(target(res)).toContain('contactDetailsSaved=');
  });

  test('a new email is never written here: a link goes to it, after the other details are saved, and the URL never holds it (#2073)', async () => {
    const { routes, userManager, order } = makeRoutes();
    const res = createMockRes();
    await routes.updateOwnContactDetails(createMockReq('pat', { ...FORM, displayName: 'Pat P', email: 'couple@example.org', homePhone: '(415) 555-2671' }), res);
    expect(order).toEqual(['check', 'account', 'identity', 'link']);
    expect(userManager.updateUser).toHaveBeenCalledWith('pat', { displayName: 'Pat P' }, expect.anything());
    expect(String(res.redirect.mock.calls[0][0])).not.toContain('couple');
  });

  test('a site that cannot send email refuses a user\'s own email change, saying an admin can change it; nothing is saved (#2073)', async () => {
    const { routes, identityManager, userManager, authManager } = makeRoutes({ mail: false });
    const res = createMockRes();
    await routes.updateOwnContactDetails(createMockReq('pat', { ...FORM, displayName: 'Pat P', email: 'new@example.org' }), res);
    expect(target(res)).toBe('/profile?contactDetailsError=Your email cannot be changed here, because this site cannot send email to confirm it. An administrator can change it. Nothing was saved.#contact-details');
    expect(userManager.updateUser).not.toHaveBeenCalled();
    expect(identityManager.updateContactDetails).not.toHaveBeenCalled();
    expect(authManager.requestEmailChange).not.toHaveBeenCalled();
  });

  test('the answer is the same whatever the address: the form never says whose an address is (#2073)', async () => {
    // An administrator's address is refused only when its link is clicked (AuthManager.confirmEmailChange).
    const answers: string[] = [];
    for (const address of ['root@example.org', 'anyone@example.org']) {
      const { routes, userManager, authManager } = makeRoutes();
      const res = createMockRes();
      await routes.updateOwnContactDetails(createMockReq('pat', { ...FORM, email: address }), res);
      expect(userManager.assertAdminEmailUnshared).not.toHaveBeenCalled();
      expect(authManager.requestEmailChange).toHaveBeenCalledWith(expect.anything(), 'pat', address, 'profile');
      answers.push(target(res));
    }
    expect(answers).toEqual(['/profile?contactDetailsSaved=Contact details saved.#contact-details', '/profile?contactDetailsSaved=Contact details saved.#contact-details']);
  });

  test('asking too often is answered plainly; the other details are saved and no link is sent (#2073)', async () => {
    const { routes, identityManager } = makeRoutes({ sent: 'throttled' });
    const res = createMockRes();
    await routes.updateOwnContactDetails(createMockReq('pat', { ...FORM, email: 'new@example.org', homePhone: '(415) 555-2671' }), res);
    expect(identityManager.updateContactDetails).toHaveBeenCalled();
    expect(target(res)).toBe('/profile?contactDetailsError=Your other details were saved, but your email was not changed: you asked to change it too often. Wait a while, then try again.#contact-details');
  });

  test('a link that cannot be sent leaves the other details saved and says the email was not changed (#2073)', async () => {
    const { routes, identityManager } = makeRoutes({ sent: 'failed' });
    const res = createMockRes();
    await routes.updateOwnContactDetails(createMockReq('pat', { ...FORM, email: 'new@example.org', homePhone: '(415) 555-2671' }), res);
    expect(identityManager.updateContactDetails).toHaveBeenCalled();
    expect(target(res)).toBe('/profile?contactDetailsError=Your other details were saved, but your email was not changed: this site could not send the link to confirm it. An administrator can change it.#contact-details');
  });

  test('a bad detail is refused before the account is written, so nothing is saved', async () => {
    const { routes, identityManager, userManager } = makeRoutes({ fail: new ContactDetailsInvalidError('mobile', 'telephone', 'is not a phone number we can read: check it and the country beside it') });
    const res = createMockRes();
    await routes.updateOwnContactDetails(createMockReq('pat', { ...FORM, displayName: 'New', email: 'new@example.org', mobilePhone: 'call me' }), res);
    expect(userManager.updateUser).not.toHaveBeenCalled();
    expect(identityManager.updateContactDetails).not.toHaveBeenCalled();
    expect(target(res)).toContain('Nothing was saved.');
  });

  test('the account is written first and the identity record only after it succeeds; a failure says exactly what was saved', async () => {
    const ok = makeRoutes();
    await ok.routes.updateOwnContactDetails(createMockReq('pat', { ...FORM, displayName: 'New', homePhone: '(415) 555-2671' }), createMockRes());
    expect(ok.order).toEqual(['check', 'account', 'identity']);

    // The account change fails: the identity record is not written, no link is sent, and nothing was saved.
    const accountDown = makeRoutes({ accountFail: new Error('disk full') });
    const res = createMockRes();
    await accountDown.routes.updateOwnContactDetails(createMockReq('pat', { ...FORM, displayName: 'New', email: 'new@example.org', homePhone: '(415) 555-2671' }), res);
    expect(accountDown.identityManager.updateContactDetails).not.toHaveBeenCalled();
    expect(accountDown.authManager.requestEmailChange).not.toHaveBeenCalled();
    expect(target(res)).toBe('/profile?contactDetailsError=Your contact details could not be saved. Nothing was saved.#contact-details');

    // The name is saved, then the identity record fails: the page says which part was saved, and no link is sent.
    const identityDown = makeRoutes({ identityFail: new Error('disk full') });
    const out1 = createMockRes();
    await identityDown.routes.updateOwnContactDetails(createMockReq('pat', { ...FORM, displayName: 'New', email: 'new@example.org' }), out1);
    expect(identityDown.order).toEqual(['check', 'account', 'identity']);
    expect(target(out1)).toBe('/profile?contactDetailsError=Your name was saved, but your other contact details could not be saved, and your email was not changed. Try again.#contact-details');

    // No account change: an identity failure saved nothing.
    const onlyDetails = makeRoutes({ identityFail: new Error('disk full') });
    const out = createMockRes();
    await onlyDetails.routes.updateOwnContactDetails(createMockReq('pat', { ...FORM, homePhone: '(415) 555-2671' }), out);
    expect(target(out)).toBe('/profile?contactDetailsError=Your contact details could not be saved. Nothing was saved.#contact-details');
  });

  test('a door refusal is answered as a refusal, never saved', async () => {
    const { routes, userManager } = makeRoutes({ lookupFail: new ContactRefusedError('profile-manage', { permit: false, applicable: true, reason: 'test' }) });
    const refuse = vi.spyOn(routes as unknown as { refuse: (...a: unknown[]) => Promise<void> }, 'refuse').mockResolvedValue(undefined);
    const res = createMockRes();
    await routes.updateOwnContactDetails(createMockReq('pat', { ...FORM, displayName: 'New' }), res);
    expect(refuse).toHaveBeenCalledWith(expect.anything(), expect.anything(), res, 'page', 'profile-manage');
    expect(res.redirect).not.toHaveBeenCalled();
    expect(userManager.updateUser).not.toHaveBeenCalled();
  });

  test('without profile-manage nothing is looked up or saved', async () => {
    const { routes, identityManager, userManager } = makeRoutes();
    vi.spyOn(routes as unknown as { permitted: (...a: unknown[]) => Promise<boolean> }, 'permitted').mockResolvedValue(false);
    await routes.updateOwnContactDetails(createMockReq('pat', { ...FORM }), createMockRes());
    expect(userManager.getUser).not.toHaveBeenCalled();
    expect(identityManager.getByUserIdentifier).not.toHaveBeenCalled();
    expect(identityManager.updateContactDetails).not.toHaveBeenCalled();
  });
});
