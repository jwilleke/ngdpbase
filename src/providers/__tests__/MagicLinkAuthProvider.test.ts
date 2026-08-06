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
      getUserByEmail: vi.fn()
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

    /** Config stub honouring defaults, overridden per test. */
    const withConfig = (overrides) => {
      mockConfigManager.getProperty = vi.fn((key, fallback) =>
        key in overrides ? overrides[key] : fallback
      );
    };

    beforeEach(() => {
      mockUserManager.getUser = vi.fn().mockResolvedValue(undefined);
      mockUserManager.createUser = vi.fn().mockResolvedValue(undefined);
      mockUserManager.getRole = vi.fn().mockReturnValue({ name: 'contributor' });
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

    test('an unknown configured role falls back to reader', async () => {
      withConfig({
        'ngdpbase.auth.magic-link.auto-provision': true,
        'ngdpbase.auth.magic-link.registration.default-role': 'wizard'
      });
      mockUserManager.getRole.mockReturnValue(null);
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
});
