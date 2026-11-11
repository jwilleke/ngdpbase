/**
 * #2367: dashboard items that name the wrong setting, or send the administrator
 * to a row the app cannot change. Each either links to a place where the fix can
 * be made, or says the fix is made on the server, outside this page.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import BaseManager from '../BaseManager';
import AuthManager from '../AuthManager';
import ExportManager from '../ExportManager';
import NotificationManager from '../NotificationManager';
import OidcManager from '../OidcManager';

const SERVER_SIDE = "server's settings, outside this page";

describe('the two paths that were passed under the wrong key', () => {
  afterEach(() => vi.restoreAllMocks());

  const keyPassed = async (make: () => { initialize: (c?: object) => Promise<void> }) => {
    const spy = vi.spyOn(BaseManager.prototype as never, 'preflightConfiguredPath' as never)
      .mockReturnValue({ ok: false });
    await make().initialize({});
    return spy.mock.calls[0]?.[0];
  };

  test('notifications: ngdpbase.notifications.dir', async () => {
    const engine = { getManager: () => null };
    expect(await keyPassed(() => new NotificationManager(engine as never))).toBe('ngdpbase.notifications.dir');
  });

  test('exports: ngdpbase.directories.exports', async () => {
    const engine = { getManager: () => null };
    expect(await keyPassed(() => new ExportManager(engine as never))).toBe('ngdpbase.directories.exports');
  });
});

describe('site address and single sign-on settings that only the server can change', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-2367-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const oidc = async (custom: Record<string, unknown>, explicit = true) => {
    const cfg = {
      getProperty: (k: string, d: unknown) => (k in custom ? custom[k] : d),
      getCustomProperties: () => custom,
      isBaseUrlExplicit: () => explicit,
      getBaseURL: () => 'https://wiki.example.com',
      getInstanceDataFolder: () => dir
    };
    const m = new OidcManager({ getManager: (n: string) => (n === 'ConfigurationManager' ? cfg : null) });
    await m.initialize();
    return m.getManagerStatus();
  };

  test('no web address: server-side wording, no link to a row', async () => {
    const s = await oidc({ 'oidc-auth-server.enabled': true }, false);
    expect(s.reason).toContain(SERVER_SIDE);
    expect(s.configKey).toBeUndefined();
  });

  test('a setting is not valid: server-side wording, no "correct it in the settings"', async () => {
    const s = await oidc({ 'oidc-auth-server.enabled': true, 'oidc-auth-server.issuer': 'x' });
    expect(s.reason).toContain(SERVER_SIDE);
    expect(s.reason).not.toContain('Correct it in the settings');
    expect(s.configKey).toBeUndefined();
  });

  test('unsafe settings: server-side wording', async () => {
    const s = await oidc({ 'oidc-auth-server.enabled': true, 'oidc-auth-server.nonsense': 1 });
    expect(s.reason).toContain(SERVER_SIDE);
    expect(s.reason).not.toBe('Single sign-on is turned on but has not started: its settings were refused as unsafe. Review the single sign-on settings.');
  });

  const roles = async (env: Record<string, string>) => {
    const cfg = {
      getProperty: (_k: string, d: unknown) => d,
      getCustomProperty: () => undefined,
      getUnresolvedProperty: (_k: string, d: unknown) => d,
      isBaseUrlExplicit: () => true,
      getBaseURL: () => 'http://wiki.example.com',
      getEnvControlledKeys: () => env
    };
    const engine = {
      getManager: (n: string) => (n === 'ConfigurationManager' ? cfg : n === 'RoleManager' ? { roleRequiredAal: () => ({ admin: 2 }), operatorRequiredAal: () => ({}) } : null)
    };
    const m = new AuthManager(engine);
    await m.initialize();
    m.checkRequiredAal();
    return m.getManagerStatus();
  };

  test('roles need a stronger sign-in, address from the server: says so, no locked row', async () => {
    const s = await roles({ 'ngdpbase.application.base-url': 'NGDPBASE_BASE_URL' });
    expect(s.reason).toContain(SERVER_SIDE);
    expect(s.configKey).toBeUndefined();
  });

  test('roles need a stronger sign-in, address editable here: still links to the row', async () => {
    const s = await roles({});
    expect(s.configKey).toBe('ngdpbase.application.base-url');
    expect(s.reason).not.toContain(SERVER_SIDE);
  });
});
