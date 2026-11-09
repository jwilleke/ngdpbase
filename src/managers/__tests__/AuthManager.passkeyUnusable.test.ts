/**
 * #2317 — `passkeysCannotWork()`: the setting says passkeys are on, but the
 * site's address cannot support them. One rule with registration: base-url set
 * explicitly, and https (or http on localhost).
 */
vi.unmock('../../providers/FileCredentialsProvider');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AuthManager from '../AuthManager';
import logger from '../../utils/logger';
import { CREDENTIALS_KEY_ENV } from '../../providers/BaseCredentialsProvider';

describe('AuthManager.passkeysCannotWork (#2317)', () => {
  let dir: string;
  const savedKey = process.env[CREDENTIALS_KEY_ENV];
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-2317-am-'));
    process.env[CREDENTIALS_KEY_ENV] = 'test-credentials-key-not-a-secret';
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env[CREDENTIALS_KEY_ENV]; else process.env[CREDENTIALS_KEY_ENV] = savedKey;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const started = async (baseUrl: string, enabled: boolean | undefined = true, explicit = true) => {
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (k: string, d: unknown) => (k === 'ngdpbase.auth.passkey.enabled' ? (enabled === undefined ? d : enabled)
          : k === 'ngdpbase.auth.factors' ? [{ authproviderid: 'passkey' }, { authproviderid: 'password' }] : d),
        getCustomProperty: () => undefined,
        getResolvedDataPath: (k: string, d: string) => (k === 'ngdpbase.auth.credentials.file' ? path.join(dir, 'credentials.json') : d),
        isBaseUrlExplicit: () => explicit,
        getBaseURL: () => baseUrl
      },
      PolicyDecisionPoint: { permits: () => Promise.resolve(true) },
      AuditManager: { logAuditEvent: () => Promise.resolve('a') }
    };
    const am = new AuthManager({ getManager: (n: string) => managers[n] ?? null });
    await am.initialize();
    return am;
  };

  test.each([
    ['http, a host that is not localhost', 'http://wiki.home.lan', true, true, true],
    ['http, an IP address', 'http://192.168.1.20', true, true, true],
    ['not set explicitly, even if it would do', 'https://wiki.example.com', true, false, true],
    ['https', 'https://wiki.example.com', true, true, false],
    ['http on localhost', 'http://localhost:3000', true, true, false],
    ['http on *.localhost', 'http://wiki.localhost:3000', true, true, false],
    ['passkeys set off, whatever the address', 'http://wiki.home.lan', false, true, false],
    ['the setting left unset (it ships true)', 'http://wiki.home.lan', undefined, true, true]
  ])('%s', async (_n, baseUrl, enabled, explicit, cannot) => {
    const am = await started(baseUrl, enabled, explicit);
    expect(am.passkeysCannotWork()).toBe(cannot);
    // Registration follows the same rule: when it cannot work, no passkey is offered.
    expect(am.isEnabled('passkey')).toBe(enabled === false ? false : !cannot);
  });

  test('log level: an unset base-url is info (a default install), a set but unusable one is warn', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation((() => logger) as never);
    const info = vi.spyOn(logger, 'info').mockImplementation((() => logger) as never);
    const said = (spy: typeof warn) => spy.mock.calls.some((c) => String(c[0]).includes('Passkeys off'));
    await started('http://localhost:3000', true, false);
    expect(said(info)).toBe(true);
    expect(said(warn)).toBe(false);
    warn.mockClear(); info.mockClear();
    await started('http://wiki.home.lan', true, true);
    expect(said(warn)).toBe(true);
    expect(said(info)).toBe(false);
    warn.mockRestore(); info.mockRestore();
  });
});
