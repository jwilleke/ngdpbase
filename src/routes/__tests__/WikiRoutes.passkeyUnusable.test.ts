/**
 * #2317 — passkeys switched on, but the site's address cannot support them.
 *
 * Admin → Configuration says so on that setting's row and offers a button that
 * saves `false` through the ordinary save; the sign-in page and the profile
 * offer no passkey while it cannot work. These use a real AuthManager (the one
 * rule), the real route handlers and the real templates.
 */
vi.unmock('../../providers/FileCredentialsProvider');

import ejs from 'ejs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import WikiRoutes from '../WikiRoutes';
import AuthManager from '../../managers/AuthManager';
import { CREDENTIALS_KEY_ENV } from '../../providers/BaseCredentialsProvider';

const KEY = 'ngdpbase.auth.passkey.enabled';
const VIEWS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../views');
const MESSAGE = "Passkeys can't work on this site's address. They need an https address.";
const admin = { username: 'admin', isAuthenticated: true, roles: ['admin'] };

let dir: string;
const savedKey = process.env[CREDENTIALS_KEY_ENV];
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-2317-'));
  process.env[CREDENTIALS_KEY_ENV] = 'test-credentials-key-not-a-secret';
});
afterEach(() => {
  if (savedKey === undefined) delete process.env[CREDENTIALS_KEY_ENV]; else process.env[CREDENTIALS_KEY_ENV] = savedKey;
  fs.rmSync(dir, { recursive: true, force: true }); // only this test's temp directory
});

interface Site { baseUrl: string; explicit?: boolean; enabled?: boolean }

async function site({ baseUrl, explicit = true, enabled = true }: Site, granted: string[] = ['admin-read', 'admin-system', 'config-manage', 'profile-manage']) {
  const config: Record<string, unknown> = {
    [KEY]: enabled,
    'ngdpbase.auth.factors': [{ authproviderid: 'passkey' }, { authproviderid: 'password' }],
    'ngdpbase.application-name': 'Wiki'
  };
  const configManager = {
    getProperty: vi.fn((k: string, d: unknown) => (k in config ? config[k] : d)),
    getCustomProperty: () => undefined,
    getResolvedDataPath: (k: string, d: string) => (k === 'ngdpbase.auth.credentials.file' ? path.join(dir, 'credentials.json') : d),
    isBaseUrlExplicit: () => explicit,
    getBaseURL: () => baseUrl,
    getDefaultProperties: () => ({ [KEY]: true }),
    getCustomProperties: () => ({}),
    getAllProperties: () => ({ ...config }),
    getEnvControlledKeys: () => ({}),
    setProperty: vi.fn().mockResolvedValue(undefined)
  };
  const managers: Record<string, unknown> = {
    ConfigurationManager: configManager,
    PolicyDecisionPoint: {
      permits: vi.fn((_u: unknown, p: string) => Promise.resolve(granted.includes(p))),
      getUserGrants: vi.fn().mockResolvedValue([])
    },
    UserManager: { getUser: vi.fn().mockResolvedValue({ username: 'admin', password: 'x' }) },
    RoleManager: { resolveUserRoles: vi.fn().mockResolvedValue(['admin']) },
    AuditManager: { logAuditEvent: () => Promise.resolve('a') }
  };
  const engine = { getManager: vi.fn((n: string) => managers[n] ?? null) };
  const authManager = new AuthManager(engine);
  managers.AuthManager = authManager;
  await authManager.initialize();
  const routes = new WikiRoutes(engine);
  vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({});
  return { routes, configManager, authManager };
}

const req = (body: Record<string, unknown> = {}) => ({
  params: {}, query: {}, body, session: { csrfToken: 'tok' }, ip: '1.2.3.4',
  path: '/admin/configuration', originalUrl: '/admin/configuration', protocol: 'http',
  headers: { 'x-requested-with': 'XMLHttpRequest' }, xhr: true,
  get: vi.fn().mockReturnValue('localhost:3000'), userContext: admin
});
const res = () => ({
  status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), redirect: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(), render: vi.fn().mockReturnThis(), setHeader: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis()
});

const includer = (original: string): { template: string } | undefined =>
  original === 'header' || original === 'footer' ? { template: '<!-- stub -->' } : undefined;

/** The real admin-configuration template, fed what the handler gave it. */
async function configurationScreen(s: Awaited<ReturnType<typeof site>>, custom: Record<string, unknown> = {}): Promise<Document> {
  const r = res();
  await s.routes.adminConfiguration(req(), r);
  const data = r.render.mock.calls[0][1] as Record<string, unknown>;
  const html = await ejs.renderFile(path.join(VIEWS, 'admin-configuration.ejs'), {
    ...data, customProperties: custom, csrfToken: 'tok', lockedUnless: () => '', locals: {}, cspNonce: 'n',
    securityPosture: null, secretKeys: [], secretIsSet: {}, canRevealSecrets: false, envControlled: {}
  }, { includer });
  return new JSDOM(html).window.document;
}

describe('Admin → Configuration, passkeys on but the address cannot support them (#2317)', () => {
  test('http on a non-localhost host, enabled: the message and button show on that row', async () => {
    const doc = await configurationScreen(await site({ baseUrl: 'http://wiki.home.lan:3000' }));
    const row = [...doc.querySelectorAll('#nav-current tbody tr')].find(tr => tr.querySelector('code')?.textContent === KEY);
    expect(row).toBeDefined();
    const note = row!.querySelector('.passkeys-cannot-work');
    expect(note?.textContent?.replace(/\s+/g, ' ')).toContain(MESSAGE);
    const button = note!.querySelector('button');
    expect(button?.textContent?.trim()).toBe('Turn passkeys off');
    const form = note!.querySelector('form')!;
    expect(form.getAttribute('action')).toBe('/admin/configuration');
    expect((form.querySelector('[name=property]') as HTMLInputElement).value).toBe(KEY);
    expect((form.querySelector('[name=value]') as HTMLInputElement).value).toBe('false');
    expect((form.querySelector('[name=_csrf]') as HTMLInputElement).value).toBe('tok');
  });

  test('the same note shows on the row in Custom Overrides when the setting is overridden there', async () => {
    const doc = await configurationScreen(await site({ baseUrl: 'http://wiki.home.lan:3000' }), { [KEY]: true });
    expect(doc.querySelectorAll('#nav-custom .passkeys-cannot-work')).toHaveLength(1);
  });

  test('the note is for home users: no key name, issue number, path or log', async () => {
    const doc = await configurationScreen(await site({ baseUrl: 'http://wiki.home.lan:3000' }));
    const text = doc.querySelector('.passkeys-cannot-work')!.textContent!;
    expect(text).not.toMatch(/#\d|docs\/|ngdpbase\.|\blog\b/i);
  });

  test.each([
    ['an https address', { baseUrl: 'https://wiki.example.com' }],
    ['http on localhost', { baseUrl: 'http://localhost:3000' }],
    ['passkeys already off', { baseUrl: 'http://wiki.home.lan:3000', enabled: false }]
  ])('%s: no message', async (_n, config) => {
    const doc = await configurationScreen(await site(config));
    expect(doc.querySelector('.passkeys-cannot-work')).toBeNull();
    expect(doc.body.textContent).not.toContain(MESSAGE);
  });

  test('a base-url that was never set: the message shows', async () => {
    const doc = await configurationScreen(await site({ baseUrl: 'http://localhost:3000', explicit: false }));
    expect(doc.querySelector('.passkeys-cannot-work')).not.toBeNull();
  });

  test('the button saves false through the normal save, as the signed-in admin', async () => {
    const { routes, configManager } = await site({ baseUrl: 'http://wiki.home.lan:3000' });
    vi.spyOn(routes as unknown as { freshEnough: () => Promise<boolean> }, 'freshEnough').mockResolvedValue(true);
    const r = res();
    await routes.adminUpdateConfiguration(req({ property: KEY, value: 'false' }), r);
    expect(configManager.setProperty).toHaveBeenCalledWith(KEY, false, admin);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('the save asks for config-manage: without it nothing is written', async () => {
    const { routes, configManager } = await site({ baseUrl: 'http://wiki.home.lan:3000' }, ['admin-read']);
    const r = res();
    await routes.adminUpdateConfiguration(req({ property: KEY, value: 'false' }), r);
    expect(r.status).toHaveBeenCalledWith(403);
    expect(configManager.setProperty).not.toHaveBeenCalled();
  });

  test('the save asks for step-up first: a stale sign-in writes nothing', async () => {
    const { routes, configManager } = await site({ baseUrl: 'http://wiki.home.lan:3000' });
    const fresh = vi.spyOn(routes as unknown as { freshEnough: () => Promise<boolean> }, 'freshEnough').mockResolvedValue(false);
    const r = res();
    await routes.adminUpdateConfiguration(req({ property: KEY, value: 'false' }), r);
    expect(fresh).toHaveBeenCalled();
    expect(fresh.mock.calls[0][1]).toBe('config-manage');
    expect(configManager.setProperty).not.toHaveBeenCalled();
  });

  test('showing the screen never writes the setting', async () => {
    const s = await site({ baseUrl: 'http://wiki.home.lan:3000' });
    await configurationScreen(s);
    await s.authManager.initialize();
    expect(s.configManager.setProperty).not.toHaveBeenCalled();
  });
});

describe('sign-in screens while passkeys cannot work (#2317)', () => {
  test('/login offers no passkey', async () => {
    const { routes } = await site({ baseUrl: 'http://wiki.home.lan:3000' });
    const r = res();
    await routes.loginPage({ ...req(), userContext: { username: 'anonymous', isAuthenticated: false, roles: ['anonymous'] }, query: {} }, r);
    expect(r.render.mock.calls[0][0]).toBe('login');
    expect((r.render.mock.calls[0][1] as Record<string, unknown>).passkeyEnabled).toBe(false);
  });

  test('/login offers a passkey when the address supports it (control)', async () => {
    const { routes } = await site({ baseUrl: 'https://wiki.example.com' });
    const r = res();
    await routes.loginPage({ ...req(), userContext: { username: 'anonymous', isAuthenticated: false, roles: ['anonymous'] }, query: {} }, r);
    expect((r.render.mock.calls[0][1] as Record<string, unknown>).passkeyEnabled).toBe(true);
  });

  test('the login template draws no passkey section for it', async () => {
    const html = await ejs.renderFile(path.join(VIEWS, 'login.ejs'), {
      error: undefined, success: undefined, magic: undefined, redirect: '/', csrfToken: 't',
      magicLinkEnabled: false, passkeyEnabled: false, outsideProviders: [], pendingConnection: null, passwordAuthEnabled: true
    }, { includer });
    expect(new JSDOM(html).window.document.querySelector('[data-passkey-section]')).toBeNull();
  });

  test('/profile offers no passkey enrolment', async () => {
    const { routes } = await site({ baseUrl: 'http://wiki.home.lan:3000' });
    const r = res();
    await routes.profilePage({ ...req(), path: '/profile' }, r);
    const data = r.render.mock.calls.find(c => c[0] === 'profile')?.[1] as Record<string, unknown>;
    expect(data).toBeDefined();
    expect(data.passkeyHost).toBeNull();
  });

  test('/profile names the host when the address supports passkeys (control)', async () => {
    const { routes } = await site({ baseUrl: 'https://wiki.example.com' });
    const r = res();
    await routes.profilePage({ ...req(), path: '/profile' }, r);
    const data = r.render.mock.calls.find(c => c[0] === 'profile')?.[1] as Record<string, unknown>;
    expect(data.passkeyHost).toBe('wiki.example.com');
  });
});
