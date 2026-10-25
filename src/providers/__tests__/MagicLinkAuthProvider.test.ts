'use strict';

import { MagicLinkAuthProvider } from '../MagicLinkAuthProvider';

describe('MagicLinkAuthProvider', () => {
  let provider;
  let mockEngine;
  let mockUserManager;
  let mockMailProvider;
  let mockConfigManager;

  beforeEach(() => {
    mockMailProvider = { send: vi.fn().mockResolvedValue(undefined) };

    mockUserManager = {
      getUserByEmail: vi.fn(),
      // #2073: the provider asks for every account on the address; one test account, or none, unless a test says otherwise.
      getUsersByEmail: vi.fn(async (email) => { const u = await mockUserManager.getUserByEmail(email); return u ? [u] : []; })
    };

    // #642 Iteration 3: provider derives baseUrl from getBaseURL() at runtime.
    mockConfigManager = {
      getBaseURL: vi.fn().mockReturnValue('https://wiki.example.com')
    };

    mockEngine = {
      getManager: vi.fn((name) => {
        if (name === 'UserManager') return mockUserManager;
        if (name === 'ConfigurationManager') return mockConfigManager;
        return null;
      })
    };

    provider = new MagicLinkAuthProvider(mockEngine, {
      ttlMs: 15 * 60 * 1000,
      mailProvider: mockMailProvider
    });
  });

  describe('initiate()', () => {
    test('sends email and stores token when user found', async () => {
      mockUserManager.getUserByEmail.mockResolvedValue({ username: 'alice', email: 'alice@example.com' });

      await provider.initiate({ email: 'alice@example.com', redirect: '/dashboard' });

      expect(mockMailProvider.send).toHaveBeenCalledTimes(1);
      const msg = mockMailProvider.send.mock.calls[0][0];
      expect(msg.to).toBe('alice@example.com');
      // #642 Iteration 3: verify URL host comes from getBaseURL(), not a config field.
      expect(msg.text).toContain('https://wiki.example.com/auth/magic-link/verify?token=');
      expect(provider.getTokenCount()).toBe(1);
    });

    test('verify URL host comes from ConfigurationManager.getBaseURL() at runtime (#642)', async () => {
      mockUserManager.getUserByEmail.mockResolvedValue({ username: 'alice', email: 'alice@example.com' });
      // Change the mocked baseURL between calls — runtime derivation should pick it up.
      mockConfigManager.getBaseURL.mockReturnValue('https://first.example.com');
      await provider.initiate({ email: 'alice@example.com' });
      mockConfigManager.getBaseURL.mockReturnValue('https://second.example.com');
      await provider.initiate({ email: 'bob@example.com' });

      const firstUrl = mockMailProvider.send.mock.calls[0][0].text;
      const secondUrl = mockMailProvider.send.mock.calls[1][0].text;
      expect(firstUrl).toContain('https://first.example.com/auth/magic-link/verify?token=');
      expect(secondUrl).toContain('https://second.example.com/auth/magic-link/verify?token=');
    });

    test('strips trailing slash from baseURL', async () => {
      mockUserManager.getUserByEmail.mockResolvedValue({ username: 'alice', email: 'alice@example.com' });
      mockConfigManager.getBaseURL.mockReturnValue('https://wiki.example.com/');

      await provider.initiate({ email: 'alice@example.com' });

      const msg = mockMailProvider.send.mock.calls[0][0];
      // No double slash before /auth/...
      expect(msg.text).toContain('https://wiki.example.com/auth/magic-link/verify?token=');
      expect(msg.text).not.toContain('https://wiki.example.com//auth/');
    });

    test('silent no-op when email not registered', async () => {
      mockUserManager.getUserByEmail.mockResolvedValue(undefined);

      await provider.initiate({ email: 'nobody@example.com' });

      expect(mockMailProvider.send).not.toHaveBeenCalled();
      expect(provider.getTokenCount()).toBe(0);
    });

    test('rate-limits second request within 60 seconds', async () => {
      mockUserManager.getUserByEmail.mockResolvedValue({ username: 'alice', email: 'alice@example.com' });

      await provider.initiate({ email: 'alice@example.com' });
      await provider.initiate({ email: 'alice@example.com' });

      expect(mockMailProvider.send).toHaveBeenCalledTimes(1);
    });

    test('allows request for different email during rate-limit window', async () => {
      mockUserManager.getUserByEmail.mockResolvedValue({ username: 'alice', email: 'alice@example.com' });

      await provider.initiate({ email: 'alice@example.com' });
      await provider.initiate({ email: 'bob@example.com' });

      expect(mockMailProvider.send).toHaveBeenCalledTimes(2);
    });
  });

  describe('verify()', () => {
    let validToken;

    beforeEach(async () => {
      mockUserManager.getUserByEmail.mockResolvedValue({ username: 'alice', email: 'alice@example.com' });
      await provider.initiate({ email: 'alice@example.com', redirect: '/' });
      // Extract the token from the email link
      const emailText = mockMailProvider.send.mock.calls[0][0].text;
      const match = emailText.match(/token=([a-f0-9]{64})/);
      validToken = match[1];
    });

    test('returns AuthResult for valid token', async () => {
      const result = await provider.verify({ token: validToken });
      expect(result).toEqual({ username: 'alice' });
    });

    test('returns null for unknown token', async () => {
      const result = await provider.verify({ token: 'deadbeef'.repeat(8) });
      expect(result).toBeNull();
    });

    test('returns null when token is missing', async () => {
      const result = await provider.verify({});
      expect(result).toBeNull();
    });

    test('returns null for expired token', async () => {
      // Create provider with 0ms TTL so token is instantly expired
      const shortProvider = new MagicLinkAuthProvider(mockEngine, {
        ttlMs: 0,
        mailProvider: mockMailProvider
      });
      await shortProvider.initiate({ email: 'alice@example.com' });
      const text = mockMailProvider.send.mock.calls[1][0].text;
      const match = text.match(/token=([a-f0-9]{64})/);
      const expiredToken = match[1];

      // Wait a tick to ensure expiry
      await new Promise((r) => setTimeout(r, 5));
      const result = await shortProvider.verify({ token: expiredToken });
      expect(result).toBeNull();
    });
  });

  describe('consumeToken()', () => {
    test('subsequent verify() returns null after consume', async () => {
      mockUserManager.getUserByEmail.mockResolvedValue({ username: 'alice', email: 'alice@example.com' });
      await provider.initiate({ email: 'alice@example.com' });
      const text = mockMailProvider.send.mock.calls[0][0].text;
      const match = text.match(/token=([a-f0-9]{64})/);
      const token = match[1];

      const before = await provider.verify({ token });
      expect(before).toEqual({ username: 'alice' });

      provider.consumeToken(token);

      const after = await provider.verify({ token });
      expect(after).toBeNull();
    });

    test('getTokenCount() decrements after consume', async () => {
      mockUserManager.getUserByEmail.mockResolvedValue({ username: 'alice', email: 'alice@example.com' });
      await provider.initiate({ email: 'alice@example.com' });
      expect(provider.getTokenCount()).toBe(1);

      const text = mockMailProvider.send.mock.calls[0][0].text;
      const match = text.match(/token=([a-f0-9]{64})/);
      provider.consumeToken(match[1]);

      expect(provider.getTokenCount()).toBe(0);
    });
  });

  // #1026 — magic-link registration. An unknown address may receive a link and
  // have its account created when that link is VERIFIED, never when requested.
  describe('auto-provision (#1026)', () => {
    const tokenFrom = () => {
      const text = mockMailProvider.send.mock.calls[0][0].text;
      return text.match(/token=([a-f0-9]{64})/)[1];
    };

    /**
     * Config stub honouring defaults, overridden per test. The role catalogue
     * is declared here, as in a running system: the provider reads it through
     * ConfigurationManager (#1431 step 11).
     */
    const withConfig = (overrides) => {
      const config = {
        'ngdpbase.roles.definitions': { reader: { name: 'reader' }, contributor: { name: 'contributor' } },
        ...overrides
      };
      mockConfigManager.getProperty = vi.fn((key, fallback) =>
        key in config ? config[key] : fallback
      );
    };

    beforeEach(() => {
      mockUserManager.getUser = vi.fn().mockResolvedValue(undefined);
      // The account as stored, as UserManager.createUser returns it (#1882).
      mockUserManager.createUser = vi.fn((input: { username: string }) => Promise.resolve({ username: input.username }));
    });

    test('stays silent for an unknown email when auto-provision is off', async () => {
      withConfig({ 'ngdpbase.auth.magic-link.auto-provision': false });
      mockUserManager.getUserByEmail.mockResolvedValue(undefined);

      await provider.initiate({ email: 'nobody@example.com' });

      expect(mockMailProvider.send).not.toHaveBeenCalled();
      expect(provider.getTokenCount()).toBe(0);
    });

    test('sends a link for an unknown email when auto-provision is on', async () => {
      withConfig({ 'ngdpbase.auth.magic-link.auto-provision': true });
      mockUserManager.getUserByEmail.mockResolvedValue(undefined);

      await provider.initiate({ email: 'newbie@example.com' });

      expect(mockMailProvider.send).toHaveBeenCalledTimes(1);
      expect(provider.getTokenCount()).toBe(1);
    });

    test('requesting a link does NOT create the account', async () => {
      withConfig({ 'ngdpbase.auth.magic-link.auto-provision': true });
      mockUserManager.getUserByEmail.mockResolvedValue(undefined);

      await provider.initiate({ email: 'newbie@example.com' });

      expect(mockUserManager.createUser).not.toHaveBeenCalled();
    });

    test('provisionIfNew() creates the account, external and in the configured role', async () => {
      withConfig({
        'ngdpbase.auth.magic-link.auto-provision': true,
        'ngdpbase.auth.magic-link.registration.default-role': 'contributor'
      });
      mockUserManager.getUserByEmail.mockResolvedValue(undefined);
      await provider.initiate({ email: 'newbie@example.com' });

      const ok = await provider.provisionIfNew(tokenFrom());

      expect(ok).toBe(true);
      expect(mockUserManager.createUser).toHaveBeenCalledTimes(1);
      const created = mockUserManager.createUser.mock.calls[0][0];
      expect(created.email).toBe('newbie@example.com');
      expect(created.username).toBe('newbie');
      expect(created.roles).toEqual(['contributor']);
      // isExternal stores an empty password hash, which no password can match —
      // this is what makes the account magic-link-only.
      expect(created.isExternal).toBe(true);
      expect(created.password).toBe('');
    });

    test('verify() resolves to the provisioned username', async () => {
      withConfig({ 'ngdpbase.auth.magic-link.auto-provision': true });
      mockUserManager.getUserByEmail.mockResolvedValue(undefined);
      await provider.initiate({ email: 'newbie@example.com' });

      const token = tokenFrom();
      await provider.provisionIfNew(token);

      expect(await provider.verify({ token })).toEqual({ username: 'newbie' });
    });

    test('verify() names the account as stored, not the name derived for it (#1882)', async () => {
      withConfig({ 'ngdpbase.auth.magic-link.auto-provision': true });
      mockUserManager.getUserByEmail.mockResolvedValue(undefined);
      mockUserManager.createUser = vi.fn().mockResolvedValue({ username: 'Newbie' });
      await provider.initiate({ email: 'newbie@example.com' });

      const token = tokenFrom();
      await provider.provisionIfNew(token);

      expect(await provider.verify({ token })).toEqual({ username: 'Newbie' });
    });

    test('an unknown configured role falls back to reader', async () => {
      withConfig({
        'ngdpbase.auth.magic-link.auto-provision': true,
        'ngdpbase.auth.magic-link.registration.default-role': 'wizard'
      });
      mockUserManager.getUserByEmail.mockResolvedValue(undefined);
      await provider.initiate({ email: 'newbie@example.com' });

      await provider.provisionIfNew(tokenFrom());

      expect(mockUserManager.createUser.mock.calls[0][0].roles).toEqual(['reader']);
    });

    test('application.registration:false overrides the provider toggle', async () => {
      withConfig({
        'ngdpbase.application.registration': false,
        'ngdpbase.auth.magic-link.auto-provision': true
      });
      mockUserManager.getUserByEmail.mockResolvedValue(undefined);

      await provider.initiate({ email: 'nobody@example.com' });

      expect(mockMailProvider.send).not.toHaveBeenCalled();
      expect(provider.getTokenCount()).toBe(0);
    });

    test('provisionIfNew() is a no-op for an existing user', async () => {
      withConfig({ 'ngdpbase.auth.magic-link.auto-provision': true });
      mockUserManager.getUserByEmail.mockResolvedValue({ username: 'alice', email: 'alice@example.com' });
      await provider.initiate({ email: 'alice@example.com' });

      const ok = await provider.provisionIfNew(tokenFrom());

      expect(ok).toBe(true);
      expect(mockUserManager.createUser).not.toHaveBeenCalled();
    });

    test('provisionIfNew() twice creates the account once', async () => {
      withConfig({ 'ngdpbase.auth.magic-link.auto-provision': true });
      mockUserManager.getUserByEmail.mockResolvedValue(undefined);
      await provider.initiate({ email: 'newbie@example.com' });
      const token = tokenFrom();

      expect(await provider.provisionIfNew(token)).toBe(true);
      expect(await provider.provisionIfNew(token)).toBe(true);

      expect(mockUserManager.createUser).toHaveBeenCalledTimes(1);
    });

    test('provisionIfNew() rejects an unknown token', async () => {
      withConfig({ 'ngdpbase.auth.magic-link.auto-provision': true });

      expect(await provider.provisionIfNew('deadbeef')).toBe(false);
      expect(mockUserManager.createUser).not.toHaveBeenCalled();
    });

    test('a known and an unknown email are indistinguishable to the caller', async () => {
      withConfig({ 'ngdpbase.auth.magic-link.auto-provision': true });

      mockUserManager.getUserByEmail.mockResolvedValue({ username: 'alice', email: 'alice@example.com' });
      const knownResult = await provider.initiate({ email: 'alice@example.com' });

      mockMailProvider.send.mockClear();
      mockUserManager.getUserByEmail.mockResolvedValue(undefined);
      const unknownResult = await provider.initiate({ email: 'nobody@example.com' });

      // Same return (undefined) and the same observable side effect: one mail
      // sent. Only the recipient can tell the two apart.
      expect(knownResult).toBe(unknownResult);
      expect(mockMailProvider.send).toHaveBeenCalledTimes(1);
    });
  });
  /**
   * #2073: an address several accounts share. The link names no account; the
   * person chooses one of the active accounts on it, and the link alone is
   * enough for any of them. Sabotaged once each (2026-10-25) and watched go red:
   * - verify() returning the first offered account when none was chosen → "names no account";
   * - the still-holds-the-address check removed → "an account that left the address";
   * - inactive accounts offered → "offers the active accounts".
   */
  describe('a shared address (#2073)', () => {
    const ann = { username: 'ann', email: 'couple@example.com' };
    const bob = { username: 'bob', email: 'couple@example.com' };
    const off = { username: 'cal', email: 'couple@example.com', isActive: false };
    const tokenFrom = () => mockMailProvider.send.mock.calls[0][0].text.match(/token=([a-f0-9]{64})/)[1];

    test('one link is sent; it names no account and offers the active accounts on the address', async () => {
      mockUserManager.getUsersByEmail.mockResolvedValue([ann, bob, off]);
      await provider.initiate({ email: 'Couple@Example.com', redirect: '/wanted' });
      expect(mockMailProvider.send).toHaveBeenCalledTimes(1);
      const token = tokenFrom();
      expect(provider.accountChoices(token)).toEqual(['ann', 'bob']);
      expect(await provider.verify({ token })).toBeNull();
      expect(await provider.verify({ token, account: 'cal' })).toBeNull();
      expect(await provider.verify({ token, account: 'mallory' })).toBeNull();
      expect(await provider.verify({ token, account: 'bob' })).toEqual({ username: 'bob' });
      expect(await provider.verify({ token, account: 'ann' })).toEqual({ username: 'ann' });
      expect(provider.consumeToken(token)).toBe(true);
      expect(provider.accountChoices(token)).toBeNull();
      expect(await provider.verify({ token, account: 'ann' })).toBeNull();
    });

    test('an account turned off since the link was sent is refused', async () => {
      mockUserManager.getUsersByEmail.mockResolvedValue([ann, bob]);
      await provider.initiate({ email: 'couple@example.com' });
      const token = tokenFrom();
      mockUserManager.getUsersByEmail.mockResolvedValue([ann, { ...bob, isActive: false }]);
      expect(await provider.verify({ token, account: 'bob' })).toBeNull();
      expect(await provider.verify({ token, account: 'ann' })).toEqual({ username: 'ann' });
    });

    test('an account that left the address since the link was sent is refused', async () => {
      mockUserManager.getUsersByEmail.mockResolvedValue([ann, bob]);
      await provider.initiate({ email: 'couple@example.com' });
      const token = tokenFrom();
      mockUserManager.getUsersByEmail.mockResolvedValue([ann]);
      expect(await provider.verify({ token, account: 'bob' })).toBeNull();
      expect(await provider.verify({ token, account: 'ann' })).toEqual({ username: 'ann' });
    });

    test('with only one active account on it, the link is that account\'s, as before', async () => {
      mockUserManager.getUsersByEmail.mockResolvedValue([ann, off]);
      await provider.initiate({ email: 'couple@example.com' });
      const token = tokenFrom();
      expect(provider.accountChoices(token)).toBeNull();
      expect(await provider.verify({ token })).toEqual({ username: 'ann' });
    });

    test('an address whose accounts are all turned off gets no link and never a new account', async () => {
      mockConfigManager.getProperty = vi.fn((key, fallback) => (key === 'ngdpbase.auth.magic-link.auto-provision' ? true : fallback));
      mockUserManager.createUser = vi.fn();
      mockUserManager.getUsersByEmail.mockResolvedValue([off, { ...off, username: 'dee' }]);
      await provider.initiate({ email: 'couple@example.com' });
      expect(mockMailProvider.send).not.toHaveBeenCalled();
      expect(mockUserManager.createUser).not.toHaveBeenCalled();
    });

    test('a new-account link refuses when several accounts took the address meanwhile, and makes none', async () => {
      mockConfigManager.getProperty = vi.fn((key, fallback) => (key === 'ngdpbase.auth.magic-link.auto-provision' ? true : fallback));
      mockUserManager.getUser = vi.fn().mockResolvedValue(undefined);
      mockUserManager.createUser = vi.fn();
      mockUserManager.getUsersByEmail.mockResolvedValue([]);
      await provider.initiate({ email: 'couple@example.com' });
      const token = tokenFrom();
      mockUserManager.getUsersByEmail.mockResolvedValue([ann, bob]);
      expect(await provider.provisionIfNew(token)).toBe(false);
      expect(mockUserManager.createUser).not.toHaveBeenCalled();
    });
  });
});
