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
});
