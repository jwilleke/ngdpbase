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
async function configurationScreen(s: Awaited<ReturnType<typeof site>>, custom: Record<string, unknown> = {}, locked = false, envControlled: Record<string, unknown> = {}, opts: { scripts?: (w: Record<string, unknown>) => void } = {}): Promise<Document> {
  const r = res();
  await s.routes.adminConfiguration(req(), r);
  const data = r.render.mock.calls[0][1] as Record<string, unknown>;
  const html = await ejs.renderFile(path.join(VIEWS, 'admin-configuration.ejs'), {
    ...data, customProperties: custom, csrfToken: 'tok', lockedUnless: () => (locked ? ' disabled aria-disabled="true" title="Requires the permission"' : ''), locals: {}, cspNonce: 'n',
    securityPosture: null, secretKeys: [], secretIsSet: {}, canRevealSecrets: false, envControlled
  }, { includer });
  if (opts.scripts) {
    const dom = new JSDOM(html, { runScripts: 'dangerously', beforeParse: w => opts.scripts(w) });
    await new Promise(resolve => setTimeout(resolve, 0));
    return dom.window.document;
  }
  return new JSDOM(html).window.document;
}

describe('Admin → Configuration, passkeys on but the address cannot support them (#2317)', () => {
  test('http on a non-localhost host, enabled: the message and button show on that row', async () => {
    const doc = await configurationScreen(await site({ baseUrl: 'http://wiki.home.lan' }));
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
    const doc = await configurationScreen(await site({ baseUrl: 'http://wiki.home.lan' }), { [KEY]: true });
    expect(doc.querySelectorAll('#nav-custom .passkeys-cannot-work')).toHaveLength(1);
  });

  test('the note is for home users: no key name, issue number, path or log', async () => {
    const doc = await configurationScreen(await site({ baseUrl: 'http://wiki.home.lan' }));
    const text = doc.querySelector('.passkeys-cannot-work')!.textContent!;
    expect(text).not.toMatch(/#\d|docs\/|ngdpbase\.|\blog\b/i);
  });

  test.each([
    ['an https address', { baseUrl: 'https://wiki.example.com' }],
    ['http on localhost', { baseUrl: 'http://localhost:3000' }],
    ['passkeys already off', { baseUrl: 'http://wiki.home.lan', enabled: false }]
  ])('%s: no message', async (_n, config) => {
    const doc = await configurationScreen(await site(config));
    expect(doc.querySelector('.passkeys-cannot-work')).toBeNull();
    expect(doc.body.textContent).not.toContain(MESSAGE);
  });

  test('says what to do, links to the site-address row, and that the button saves at once (#2317 review)', async () => {
    const doc = await configurationScreen(await site({ baseUrl: 'http://wiki.home.lan' }));
    const note = doc.querySelector('#nav-current .passkeys-cannot-work')!;
    expect(note.textContent!.replace(/\s+/g, ' ')).toContain(`${MESSAGE} Set the site address to https, or turn passkeys off.`);
    expect(note.textContent).toContain('This saves right away. You can turn passkeys back on once the site uses https.');
    expect(note.querySelector('a')!.getAttribute('href')).toBe('#nav-add'); // not set anywhere: Add New, address filled in
    expect(note.querySelector('a')!.getAttribute('data-prefill')).toBe('ngdpbase.application.base-url');
    expect(doc.querySelector('#nav-current td:nth-child(2) .d-lg-block .passkeys-cannot-work')).not.toBeNull();
    expect(note.querySelector('button')!.disabled).toBe(false);
  });

  test('base-url set by the environment: says plainly it is changed outside this page, no link, no variable name (#2317 review)', async () => {
    const baseKey = 'ngdpbase.application.base-url';
    const doc = await configurationScreen(await site({ baseUrl: 'http://wiki.home.lan' }), {}, false, { [baseKey]: { envVar: 'X', source: 'env', effective: 'http://wiki.home.lan' } });
    const note = doc.querySelector('#nav-current .passkeys-cannot-work')!;
    const text = note.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain("The site address is set outside this page, in the server's settings. To use https, change it there and restart the server, or turn passkeys off.");
    expect(note.querySelector('a')).toBeNull();
    expect(text).not.toMatch(/NGDPBASE_|\.env|ngdpbase\./);
  });

  test('base-url in Custom Overrides: the link goes to that editable row (#2317 review)', async () => {
    const baseKey = 'ngdpbase.application.base-url';
    const doc = await configurationScreen(await site({ baseUrl: 'http://wiki.home.lan' }), { [baseKey]: 'http://wiki.home.lan' });
    const a = doc.querySelector('#nav-current .passkeys-cannot-work a')!;
    expect(a.getAttribute('data-config-jump')).toBe('nav-custom-tab');
    const row = doc.getElementById(a.getAttribute('data-row'))!;
    expect(row.closest('#nav-custom')).not.toBeNull();
    expect(row.querySelector('input.form-control')).not.toBeNull();
  });

  describe('after a save in the page (browser script)', () => {
    const saveRow = async (property: string, value: string) => {
      const fetched: string[] = [];
      const doc = await configurationScreen(await site({ baseUrl: 'http://wiki.home.lan' }), { [KEY]: true, 'ngdpbase.other': 'x' }, false, {}, {
        scripts: w => {
          w.csrfFetch = (_u: string, o: { body: string }) => { fetched.push(o.body); return Promise.resolve({ json: () => Promise.resolve({ success: true, message: 'ok' }) }); };
          w.followReauth = () => false;
        }
      });
      const form = [...doc.querySelectorAll('form[action="/admin/configuration"]')].find(f =>
        (f.querySelector('[name=property]'))?.value === property && (property !== KEY || (f.querySelector('[name=value]') as HTMLInputElement).value === value))
        ?? doc.querySelector('#nav-add form')!;
      if ((form.querySelector('[name=property]') as HTMLInputElement).type !== 'hidden') {
        (form.querySelector('[name=property]') as HTMLInputElement).value = property;
        (form.querySelector('[name=value]') as HTMLInputElement).value = value;
      }
      form.dispatchEvent(new doc.defaultView!.Event('submit', { cancelable: true, bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 20));
      return { doc, fetched };
    };

    test('turning passkeys off removes the note and the row reads false', async () => {
      const { doc, fetched } = await saveRow(KEY, 'false');
      expect(fetched).toHaveLength(1);
      expect(doc.querySelector('.passkeys-cannot-work')).toBeNull();
      const row = [...doc.querySelectorAll('#nav-current tbody tr')].find(tr => tr.querySelector('code')?.textContent === KEY)!;
      expect(row.querySelector('td:nth-child(2) > code')?.textContent).toBe('false');
    });

    test('saving another property leaves the note in place and the passkey value unchanged', async () => {
      const { doc, fetched } = await saveRow('ngdpbase.other', 'y');
      expect(fetched).toHaveLength(1);
      expect(doc.querySelectorAll('.passkeys-cannot-work').length).toBeGreaterThan(0);
      const row = [...doc.querySelectorAll('#nav-current tbody tr')].find(tr => tr.querySelector('code')?.textContent === KEY)!;
      expect(row.querySelector('td:nth-child(2) > code')?.textContent).toBe('true');
      const field = doc.querySelector('#nav-custom input[name=value][value="true"], #nav-custom input.form-control');
      expect(field?.value).not.toBe('false');
    });
  });

  test('without config-manage the button is disabled and says why', async () => {
    const doc = await configurationScreen(await site({ baseUrl: 'http://wiki.home.lan' }, ['admin-read']), {}, true);
    const note = doc.querySelector('.passkeys-cannot-work')!;
    expect(note.querySelector('button')!.disabled).toBe(true);
    expect(note.querySelector('form')!.getAttribute('title')).toBe('Needs permission to change settings');
  });

  test('a base-url that was never set: the message shows', async () => {
    const doc = await configurationScreen(await site({ baseUrl: 'http://localhost:3000', explicit: false }));
    expect(doc.querySelector('.passkeys-cannot-work')).not.toBeNull();
  });

  test('the button saves false through the normal save, as the signed-in admin', async () => {
    const { routes, configManager } = await site({ baseUrl: 'http://wiki.home.lan' });
    vi.spyOn(routes as unknown as { freshEnough: () => Promise<boolean> }, 'freshEnough').mockResolvedValue(true);
    const r = res();
    await routes.adminUpdateConfiguration(req({ property: KEY, value: 'false' }), r);
    expect(configManager.setProperty).toHaveBeenCalledWith(KEY, false, admin);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('the save asks for config-manage: without it nothing is written', async () => {
    const { routes, configManager } = await site({ baseUrl: 'http://wiki.home.lan' }, ['admin-read']);
    const r = res();
    await routes.adminUpdateConfiguration(req({ property: KEY, value: 'false' }), r);
    expect(r.status).toHaveBeenCalledWith(403);
    expect(configManager.setProperty).not.toHaveBeenCalled();
  });

  test('the save asks for step-up first: a stale sign-in writes nothing', async () => {
    const { routes, configManager } = await site({ baseUrl: 'http://wiki.home.lan' });
    const fresh = vi.spyOn(routes as unknown as { freshEnough: () => Promise<boolean> }, 'freshEnough').mockResolvedValue(false);
    const r = res();
    await routes.adminUpdateConfiguration(req({ property: KEY, value: 'false' }), r);
    expect(fresh).toHaveBeenCalled();
    expect(fresh.mock.calls[0][1]).toBe('config-manage');
    expect(configManager.setProperty).not.toHaveBeenCalled();
  });

  test('showing the screen never writes the setting', async () => {
    const s = await site({ baseUrl: 'http://wiki.home.lan' });
    await configurationScreen(s);
    await s.authManager.initialize();
    expect(s.configManager.setProperty).not.toHaveBeenCalled();
  });
});

describe('sign-in screens while passkeys cannot work (#2317)', () => {
  test('/login offers no passkey', async () => {
    const { routes } = await site({ baseUrl: 'http://wiki.home.lan' });
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
    const { routes } = await site({ baseUrl: 'http://wiki.home.lan' });
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
