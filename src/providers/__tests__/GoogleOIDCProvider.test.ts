'use strict';

// Mock google-auth-library before requiring the provider
vi.mock('google-auth-library', () => {
  const mockGetToken = vi.fn();
  const mockVerifyIdToken = vi.fn();
  const mockGenerateAuthUrl = vi.fn();

  const MockOAuth2Client = vi.fn().mockImplementation(function () {
    return {
      getToken: mockGetToken,
      verifyIdToken: mockVerifyIdToken,
      generateAuthUrl: mockGenerateAuthUrl
    };
  });

  (MockOAuth2Client as MockInstance & { _mockGetToken: MockInstance; _mockVerifyIdToken: MockInstance; _mockGenerateAuthUrl: MockInstance })._mockGetToken = mockGetToken;
  (MockOAuth2Client as MockInstance & { _mockGetToken: MockInstance; _mockVerifyIdToken: MockInstance; _mockGenerateAuthUrl: MockInstance })._mockVerifyIdToken = mockVerifyIdToken;
  (MockOAuth2Client as MockInstance & { _mockGetToken: MockInstance; _mockVerifyIdToken: MockInstance; _mockGenerateAuthUrl: MockInstance })._mockGenerateAuthUrl = mockGenerateAuthUrl;

  return { OAuth2Client: MockOAuth2Client };
});

import { OAuth2Client } from 'google-auth-library';
import { GoogleOIDCProvider } from '../GoogleOIDCProvider';
import { type MockInstance } from 'vitest';

type MockedOAuth2Client = typeof OAuth2Client & { _mockGetToken: MockInstance; _mockVerifyIdToken: MockInstance; _mockGenerateAuthUrl: MockInstance };
const mockGetToken      = (OAuth2Client as unknown as MockedOAuth2Client)._mockGetToken;
const mockVerifyIdToken = (OAuth2Client as unknown as MockedOAuth2Client)._mockVerifyIdToken;
const mockGenerateAuthUrl = (OAuth2Client as unknown as MockedOAuth2Client)._mockGenerateAuthUrl;

const makeUserManager = (overrides = {}) => ({
  getUserByEmail: vi.fn().mockResolvedValue(undefined),
  getUser:        vi.fn().mockResolvedValue(undefined),
  createUser:     vi.fn().mockResolvedValue(undefined),
  updateUser:     vi.fn().mockResolvedValue(undefined),
  ...overrides
});

const makeEngine = (userManager) => ({
  getManager: vi.fn((name) => name === 'UserManager' ? userManager : null)
});

const defaultConfig = {
  clientId:      'test-client-id',
  clientSecret:  'test-client-secret',
  redirectUri:   'http://localhost:3000/auth/oauth/google/callback',
  autoProvision: true,
  defaultRoles:  ['occupant'],
  hostedDomain:  undefined
};

describe('GoogleOIDCProvider', () => {
  let provider;
  let userManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateAuthUrl.mockReturnValue('https://accounts.google.com/o/oauth2/auth?...');
    userManager = makeUserManager();
    provider = new GoogleOIDCProvider(makeEngine(userManager), defaultConfig);
  });

  // ── startFlow ─────────────────────────────────────────────────────────────

  describe('startFlow()', () => {
    test('returns a Google authorization URL', () => {
      const url = provider.startFlow({ redirect: '/dashboard' });
      expect(url).toBe('https://accounts.google.com/o/oauth2/auth?...');
      expect(mockGenerateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          access_type: 'online',
          scope: expect.arrayContaining(['openid', 'email', 'profile'])
        })
      );
    });

    test('stores a state nonce for each call', () => {
      provider.startFlow({ redirect: '/a' });
      provider.startFlow({ redirect: '/b' });
      expect(provider.getStateCount()).toBe(2);
    });

    test('includes hd param when hostedDomain is set', () => {
      const p = new GoogleOIDCProvider(
        makeEngine(userManager),
        { ...defaultConfig, hostedDomain: 'example.com' }
      );
      p.startFlow({ redirect: '/' });
      expect(mockGenerateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({ hd: 'example.com' })
      );
    });

    test('does not include hd param when hostedDomain is unset', () => {
      provider.startFlow({ redirect: '/' });
      const call = mockGenerateAuthUrl.mock.calls[0][0];
      expect(call).not.toHaveProperty('hd');
    });
  });

  // ── getFlowRedirect ─────────────────────────────────────────────────────────

  describe('getFlowRedirect()', () => {
    test('returns stored redirect for a valid nonce', () => {
      // Capture the nonce via startFlow state side-effect
      let capturedNonce;
      mockGenerateAuthUrl.mockImplementation((params) => {
        capturedNonce = params.state;
        return 'https://google.com/...';
      });

      provider.startFlow({ redirect: '/target' });
      expect(provider.getFlowRedirect(capturedNonce)).toBe('/target');
    });

    test('returns "/" for unknown nonce', () => {
      expect(provider.getFlowRedirect('nonexistent')).toBe('/');
    });
  });

  // ── consumeToken ─────────────────────────────────────────────────────────────

  describe('consumeToken()', () => {
    test('removes state entry', () => {
      let capturedNonce;
      mockGenerateAuthUrl.mockImplementation((params) => {
        capturedNonce = params.state;
        return 'https://google.com/...';
      });

      provider.startFlow({ redirect: '/' });
      expect(provider.getStateCount()).toBe(1);
      provider.consumeToken(capturedNonce);
      expect(provider.getStateCount()).toBe(0);
    });

    test('no-op for unknown nonce', () => {
      provider.startFlow({ redirect: '/' });
      provider.consumeToken('unknown');
      expect(provider.getStateCount()).toBe(1);
    });
  });

  // ── verify() — guard conditions ──────────────────────────────────────────────

  describe('verify() — guard conditions', () => {
    test('returns null when code is missing', async () => {
      const result = await provider.verify({ state: 'somestate' });
      expect(result).toBeNull();
    });

    test('returns null when state is missing', async () => {
      const result = await provider.verify({ token: 'somecode' });
      expect(result).toBeNull();
    });

    test('returns null for unknown state nonce', async () => {
      const result = await provider.verify({ token: 'code', state: 'unknown-nonce' });
      expect(result).toBeNull();
      expect(mockGetToken).not.toHaveBeenCalled();
    });

    test('returns null and removes state when nonce is expired', async () => {
      let capturedNonce;
      mockGenerateAuthUrl.mockImplementation((params) => {
        capturedNonce = params.state;
        return 'https://google.com/...';
      });

      provider.startFlow({ redirect: '/' });

      // Manually expire the state entry
      const statesMap = provider['states'];
      const entry = statesMap.get(capturedNonce);
      entry.expiresAt = Date.now() - 1;

      const result = await provider.verify({ token: 'code', state: capturedNonce });
      expect(result).toBeNull();
      expect(provider.getStateCount()).toBe(0);
    });
  });

  // ── verify() — token exchange ────────────────────────────────────────────────

  describe('verify() — token exchange', () => {
    let capturedNonce;

    beforeEach(() => {
      mockGenerateAuthUrl.mockImplementation((params) => {
        capturedNonce = params.state;
        return 'https://google.com/...';
      });
      provider.startFlow({ redirect: '/' });
    });

    test('returns null when getToken() throws', async () => {
      mockGetToken.mockRejectedValue(new Error('network error'));
      const result = await provider.verify({ token: 'code', state: capturedNonce });
      expect(result).toBeNull();
    });

    test('returns null when token response has no id_token', async () => {
      mockGetToken.mockResolvedValue({ tokens: {} });
      const result = await provider.verify({ token: 'code', state: capturedNonce });
      expect(result).toBeNull();
    });

    test('returns null when verifyIdToken() throws', async () => {
      mockGetToken.mockResolvedValue({ tokens: { id_token: 'fake.jwt.token' } });
      mockVerifyIdToken.mockRejectedValue(new Error('invalid signature'));
      const result = await provider.verify({ token: 'code', state: capturedNonce });
      expect(result).toBeNull();
    });

    test('returns null when ID token payload has no email', async () => {
      mockGetToken.mockResolvedValue({ tokens: { id_token: 'fake.jwt.token' } });
      mockVerifyIdToken.mockResolvedValue({ getPayload: () => ({ name: 'No Email' }) });
      const result = await provider.verify({ token: 'code', state: capturedNonce });
      expect(result).toBeNull();
    });
  });

  // ── verify() — user resolution ───────────────────────────────────────────────

  describe('verify() — user resolution', () => {
    let capturedNonce;

    const setupValidToken = (email = 'user@example.com', name = 'Test User') => {
      mockGetToken.mockResolvedValue({ tokens: { id_token: 'valid.jwt' } });
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ email, name })
      });
    };

    beforeEach(() => {
      mockGenerateAuthUrl.mockImplementation((params) => {
        capturedNonce = params.state;
        return 'https://google.com/...';
      });
      provider.startFlow({ redirect: '/' });
      setupValidToken();
    });

    test('returns username for existing external user', async () => {
      userManager.getUserByEmail.mockResolvedValue({
        username: 'alice',
        email: 'user@example.com',
        isExternal: true,
        loginCount: 5
      });

      const result = await provider.verify({ token: 'code', state: capturedNonce });
      expect(result).toEqual({ username: 'alice' });
      expect(userManager.updateUser).toHaveBeenCalledWith('alice', expect.objectContaining({
        loginCount: 6
      }));
    });

    test('returns null for existing non-external (password) account — hijack prevention', async () => {
      userManager.getUserByEmail.mockResolvedValue({
        username: 'alice',
        email: 'user@example.com',
        isExternal: false
      });

      const result = await provider.verify({ token: 'code', state: capturedNonce });
      expect(result).toBeNull();
      expect(userManager.createUser).not.toHaveBeenCalled();
    });

    test('returns null when autoProvision is false and user does not exist', async () => {
      const p = new GoogleOIDCProvider(
        makeEngine(userManager),
        { ...defaultConfig, autoProvision: false }
      );
      // Need its own state nonce
      let ownNonce;
      mockGenerateAuthUrl.mockImplementation((params) => {
        ownNonce = params.state;
        return 'https://google.com/...';
      });
      p.startFlow({ redirect: '/' });

      const result = await p.verify({ token: 'code', state: ownNonce });
      expect(result).toBeNull();
      expect(userManager.createUser).not.toHaveBeenCalled();
    });

    test('auto-provisions new user and returns username', async () => {
      userManager.getUserByEmail.mockResolvedValue(undefined);
      userManager.getUser.mockResolvedValue(undefined); // username not taken

      const result = await provider.verify({ token: 'code', state: capturedNonce });
      expect(result).toEqual({ username: 'user' }); // derived from user@example.com
      expect(userManager.createUser).toHaveBeenCalledWith(expect.objectContaining({
        username: 'user',
        email: 'user@example.com',
        isExternal: true,
        roles: ['occupant']
      }), { username: 'system', provider: 'google-oidc' }); // #1204: provisioned, not registered
    });

    test('derives de-duped username when base is taken', async () => {
      userManager.getUserByEmail.mockResolvedValue(undefined);
      // 'user' is taken, 'user-2' is taken, 'user-3' is free
      userManager.getUser
        .mockResolvedValueOnce({ username: 'user' })
        .mockResolvedValueOnce({ username: 'user-2' })
        .mockResolvedValue(undefined);

      const result = await provider.verify({ token: 'code', state: capturedNonce });
      expect(result).toEqual({ username: 'user-3' });
    });

    test('returns null when createUser() throws', async () => {
      userManager.getUserByEmail.mockResolvedValue(undefined);
      userManager.getUser.mockResolvedValue(undefined);
      userManager.createUser.mockRejectedValue(new Error('disk full'));

      const result = await provider.verify({ token: 'code', state: capturedNonce });
      expect(result).toBeNull();
    });

    test('rejects new OIDC user when ngdpbase.application.registration is false', async () => {
      // Engine that exposes a ConfigurationManager flipping the registration flag off.
      const configManager = {
        getProperty: vi.fn((key, defaultValue) =>
          key === 'ngdpbase.application.registration' ? false : defaultValue
        )
      };
      const engineWithConfig = {
        getManager: vi.fn((name) => {
          if (name === 'UserManager') return userManager;
          if (name === 'ConfigurationManager') return configManager;
          return null;
        })
      };
      const p = new GoogleOIDCProvider(engineWithConfig, defaultConfig);
      // own state nonce
      let ownNonce;
      mockGenerateAuthUrl.mockImplementation((params) => {
        ownNonce = params.state;
        return 'https://google.com/...';
      });
      p.startFlow({ redirect: '/' });

      userManager.getUserByEmail.mockResolvedValue(undefined);
      userManager.getUser.mockResolvedValue(undefined);

      const result = await p.verify({ token: 'code', state: ownNonce });
      expect(result).toBeNull();
      expect(userManager.createUser).not.toHaveBeenCalled();
    });

    test('normalises email to lowercase', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ email: 'User@Example.COM', name: 'Test' })
      });
      userManager.getUserByEmail.mockResolvedValue(undefined);
      userManager.getUser.mockResolvedValue(undefined);

      await provider.verify({ token: 'code', state: capturedNonce });
      expect(userManager.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'user@example.com' }),
        { username: 'system', provider: 'google-oidc' } // #1204
      );
    });
  });
});
