/**
 * #1743 — OidcAuthProvider against a fake issuer: discovery, keys and the code
 * exchange go through guardedFetch (mocked here); the ID token is checked for
 * signature, issuer, audience, expiry and nonce; the flow is bound to its
 * browser and to its purpose; only a connected identity signs in; email is
 * kept only when verified; no roles are taken from the claims.
 */
vi.mock('../../http/guardedFetch.js', () => ({ guardedFetch: vi.fn() }));

import * as crypto from 'node:crypto';
import { guardedFetch } from '../../http/guardedFetch.js';
import { OidcAuthProvider, type IdentityStore } from '../OidcAuthProvider';
import { fakeIssuer, flowFrom, type FakeIssuer } from './__fixtures__/fakeOidcIssuer';

const BROWSER = 'browser-a';
/** The authorization code the fake issuer is handed back; any value redeems. */
const AUTH_CODE = 'code-1';

describe('OidcAuthProvider (#1743)', () => {
  let idp: FakeIssuer;
  let rows: Map<string, { id: string; username: string }>;
  let used: Array<{ id: string; email: string }>;
  let provider: OidcAuthProvider;

  const store = (): IdentityStore => ({
    find: (subject) => rows.get(subject) ?? null,
    used: (id, _at, email) => { used.push({ id, email }); return Promise.resolve(); }
  });

  const make = (): OidcAuthProvider => new OidcAuthProvider({
    name: 'idp',
    displayName: 'Example IdP',
    issuer: idp.issuer,
    clientId: idp.clientId,
    clientSecret: idp.clientSecret,
    redirectUri: 'https://wiki.example.com/auth/oauth/idp/callback',
    policy: { deniedRanges: [], allowedRanges: [] }
  }, store());

  /** Start a flow and have the issuer's next token answer it with `claims` (nonce filled in). */
  const begin = async (claims: Record<string, unknown> = {}, opts: { connectFor?: string; foreignKey?: boolean; nonce?: string } = {}) => {
    const flow = flowFrom(await provider.startFlow({ redirect: '/after', deviceState: BROWSER, ...(opts.connectFor ? { connectFor: opts.connectFor } : {}) }));
    idp.idToken = await idp.sign({ sub: 'ann-123', nonce: opts.nonce ?? flow.nonce, ...claims }, { foreignKey: opts.foreignKey });
    return flow;
  };

  beforeEach(async () => {
    idp = await fakeIssuer();
    vi.mocked(guardedFetch).mockReset();
    vi.mocked(guardedFetch).mockImplementation((url, options) => idp.respond(url, options));
    rows = new Map([[`${idp.issuer}#ann-123`, { id: 'row-1', username: 'ann' }]]);
    used = [];
    provider = make();
  });

  test('is a primary sign-in method at AAL1, named oidc:<name>', () => {
    expect(provider.id).toBe('oidc:idp');
    expect(provider.displayName).toBe('Example IdP');
    expect(provider.factor).toEqual({ amr: [], aal: 1, primary: true });
  });

  test('starts at the discovered endpoint with PKCE S256, state and nonce; the verifier matches the challenge', async () => {
    const flow = await begin();
    const url = new URL(await provider.startFlow({ deviceState: BROWSER }));
    expect(`${url.origin}${url.pathname}`).toBe(`${idp.issuer}/authorize`);
    expect(flow.params.get('response_type')).toBe('code');
    expect(flow.params.get('client_id')).toBe(idp.clientId);
    expect(flow.params.get('redirect_uri')).toBe('https://wiki.example.com/auth/oauth/idp/callback');
    expect(flow.params.get('code_challenge_method')).toBe('S256');
    expect(flow.params.get('scope')).toBe('openid email');
    expect(flow.state).not.toBe('');
    expect(flow.nonce).not.toBe('');

    await provider.verify({ token: 'code-1', state: flow.state, deviceState: BROWSER });
    const sent = idp.tokenRequests[0].form;
    expect(sent.get('grant_type')).toBe('authorization_code');
    expect(sent.get('code')).toBe('code-1');
    expect(crypto.createHash('sha256').update(sent.get('code_verifier') ?? '').digest('base64url')).toBe(flow.challenge);
    // Every outbound request went through the guard; the exchange as a POST.
    expect(vi.mocked(guardedFetch)).toHaveBeenCalledWith(`${idp.issuer}/token`, expect.objectContaining({ method: 'POST' }));
  });

  test('a connected identity signs in as its account, and nothing else comes back (no roles)', async () => {
    const flow = await begin({ email: 'Ann@Example.com', email_verified: true, groups: ['admins'], roles: ['admin'] });
    const result = await provider.verify({ token: 'code-1', state: flow.state, deviceState: BROWSER });
    expect(result).toEqual({ username: 'ann' });
    expect(used).toEqual([{ id: 'row-1', email: 'ann@example.com' }]);
  });

  test('an identity connected to no account is refused', async () => {
    const flow = await begin({ sub: 'stranger-9' });
    expect(await provider.verify({ token: 'code-1', state: flow.state, deviceState: BROWSER })).toBeNull();
  });

  test('email never finds an account: a matching address with an unknown subject is refused', async () => {
    const flow = await begin({ sub: 'other-sub', email: 'ann@example.com', email_verified: true });
    expect(await provider.verify({ token: 'code-1', state: flow.state, deviceState: BROWSER })).toBeNull();
  });

  test.each([
    ['another issuer', { iss: 'https://evil.example.test' }, {}],
    ['another audience', { aud: 'someone-else' }, {}],
    ['an expired token', { exp: Math.floor(Date.now() / 1000) - 3600 }, {}],
    ['a nonce from another sign-in', {}, { nonce: 'not-this-one' }],
    ['a signature by another key', {}, { foreignKey: true }]
  ])('refuses %s', async (_what, claims, opts) => {
    const flow = await begin(claims, opts);
    expect(await provider.verify({ token: 'code-1', state: flow.state, deviceState: BROWSER })).toBeNull();
    expect(used).toEqual([]);
  });

  test('a token issued to several parties must name this client as azp', async () => {
    const flow = await begin({ aud: [idp.clientId, 'another'], azp: 'another' });
    expect(await provider.verify({ token: 'code-1', state: flow.state, deviceState: BROWSER })).toBeNull();
  });

  test('the callback must come from the browser that started it; a mismatch spends the state', async () => {
    const flow = await begin();
    expect(await provider.verify({ token: 'code-1', state: flow.state, deviceState: 'browser-b' })).toBeNull();
    expect(await provider.verify({ token: 'code-1', state: flow.state, deviceState: BROWSER })).toBeNull();
    const again = await begin();
    expect(await provider.verify({ token: 'code-1', state: again.state })).toBeNull();
    expect(idp.tokenRequests).toHaveLength(0);
  });

  test('an unknown state is refused before any code is exchanged', async () => {
    await begin();
    expect(await provider.verify({ token: 'code-1', state: 'made-up', deviceState: BROWSER })).toBeNull();
    expect(idp.tokenRequests).toHaveLength(0);
  });

  test('the state is single-use and carries where the person was headed', async () => {
    const flow = await begin();
    expect(provider.getFlowRedirect(flow.state)).toBe('/after');
    expect(provider.consumeToken(flow.state)).toBe(true);
    expect(provider.consumeToken(flow.state)).toBe(false);
    expect(provider.getFlowRedirect(flow.state)).toBe('/');
  });

  test('a flow started to connect never signs in, and a sign-in flow never connects', async () => {
    const connecting = await begin({}, { connectFor: 'ann' });
    expect(provider.getFlowConnectFor(connecting.state)).toBe('ann');
    expect(await provider.verify({ token: 'code-1', state: connecting.state, deviceState: BROWSER })).toBeNull();

    const signingIn = await begin();
    expect(provider.getFlowConnectFor(signingIn.state)).toBeNull();
    expect(await provider.verifyIdentity({ token: 'code-1', state: signingIn.state, deviceState: BROWSER }, 'ann')).toBeNull();
  });

  test('a connection is for the account that started it only', async () => {
    const flow = await begin({}, { connectFor: 'ann' });
    expect(await provider.verifyIdentity({ token: 'code-1', state: flow.state, deviceState: BROWSER }, 'mallory')).toBeNull();
  });

  test('connecting returns the issuer + subject, and the email only when verified', async () => {
    const verified = await begin({ email: 'Ann@Example.com', email_verified: true }, { connectFor: 'ann' });
    expect(await provider.verifyIdentity({ token: 'c', state: verified.state, deviceState: BROWSER }, 'ann'))
      .toEqual({ subject: `${idp.issuer}#ann-123`, email: 'ann@example.com' });

    const unverified = await begin({ email: 'ann@example.com', email_verified: false }, { connectFor: 'ann' });
    expect(await provider.verifyIdentity({ token: 'c', state: unverified.state, deviceState: BROWSER }, 'ann'))
      .toEqual({ subject: `${idp.issuer}#ann-123`, email: '' });

    const stringly = await begin({ email: 'ann@example.com', email_verified: 'true' }, { connectFor: 'ann' });
    expect((await provider.verifyIdentity({ token: 'c', state: stringly.state, deviceState: BROWSER }, 'ann'))?.email).toBe('');
  });

  test('a discovery document naming another issuer is refused', async () => {
    idp.discovery = { ...idp.discovery, issuer: 'https://evil.example.test' };
    await expect(provider.startFlow({ deviceState: BROWSER })).rejects.toThrow(/names issuer/);
  });

  test('the client authenticates with Basic unless the issuer takes only client_secret_post', async () => {
    const basic = await begin();
    await provider.verify({ token: 'c', state: basic.state, deviceState: BROWSER });
    expect(idp.tokenRequests[0].headers.Authorization).toMatch(/^Basic /);
    expect(idp.tokenRequests[0].form.get('client_secret')).toBeNull();

    idp.discovery = { ...idp.discovery, token_endpoint_auth_methods_supported: ['client_secret_post'] };
    provider = make();
    const post = await begin();
    await provider.verify({ token: 'c', state: post.state, deviceState: BROWSER });
    expect(idp.tokenRequests[1].headers.Authorization).toBeUndefined();
    expect(idp.tokenRequests[1].form.get('client_id')).toBe(idp.clientId);
    expect(idp.tokenRequests[1].form.get('client_secret')).toBe(idp.clientSecret);
  });

  describe('issuers with their own shape', () => {
    /** A provider at an issuer of this shape, the issuer's next token answering a fresh flow with `claims`. */
    const at = async (issuer: string, claims: Record<string, unknown>) => {
      idp = await fakeIssuer(issuer);
      vi.mocked(guardedFetch).mockImplementation((url, options) => idp.respond(url, options));
      rows = new Map();
      provider = make();
      const flow = await begin(claims, { connectFor: 'ann' });
      return provider.verifyIdentity({ token: AUTH_CODE, state: flow.state, deviceState: BROWSER }, 'ann');
    };

    test('Microsoft personal accounts send an email but no email_verified: the email is not kept', async () => {
      const issuer = 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0';
      const identity = await at(issuer, { email: 'ann@outlook.example', tid: '9188040d-6c67-4c5b-b112-36a304b66dad', ver: '2.0', preferred_username: 'ann@outlook.example' });
      expect(identity).toEqual({ subject: `${issuer}#ann-123`, email: '' });
    });

    test('authentik\'s issuer ends in a slash: discovery is read beneath it, and the issuer is matched exactly', async () => {
      const issuer = 'https://auth.example.test/application/o/ngdpbase/';
      const identity = await at(issuer, { email: 'ann@example.com', email_verified: true });
      expect(identity).toEqual({ subject: `${issuer}#ann-123`, email: 'ann@example.com' });
      expect(vi.mocked(guardedFetch)).toHaveBeenCalledWith('https://auth.example.test/application/o/ngdpbase/.well-known/openid-configuration', expect.anything());
    });

    test('an authentik issuer configured without its slash is refused at discovery', async () => {
      idp = await fakeIssuer('https://auth.example.test/application/o/ngdpbase/');
      vi.mocked(guardedFetch).mockImplementation((url, options) => idp.respond(url, options));
      provider = new OidcAuthProvider({
        name: 'idp', displayName: 'authentik', issuer: 'https://auth.example.test/application/o/ngdpbase',
        clientId: idp.clientId, clientSecret: idp.clientSecret,
        redirectUri: 'https://wiki.example.com/auth/oauth/idp/callback', policy: { deniedRanges: [], allowedRanges: [] }
      }, store());
      await expect(provider.startFlow({ deviceState: BROWSER })).rejects.toThrow(/names issuer/);
    });
  });

  test('discovery and keys are fetched once and cached', async () => {
    for (let i = 0; i < 2; i++) {
      const flow = await begin();
      await provider.verify({ token: 'c', state: flow.state, deviceState: BROWSER });
    }
    const urls = vi.mocked(guardedFetch).mock.calls.map(([u]) => u);
    expect(urls.filter(u => u.endsWith('/.well-known/openid-configuration'))).toHaveLength(1);
    expect(urls.filter(u => u.endsWith('/jwks'))).toHaveLength(1);
  });
});
