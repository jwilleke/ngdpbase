/** The passkeys-on-an-unusable-address to-do (#2340): worked out from the setting and the site address on each look. */
import ejs from 'ejs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import UpgradeCheckManager from '../../managers/UpgradeCheckManager';
import AuthManager from '../../managers/AuthManager';
import { shippedLiveChecks } from '../index';
import { admin, cleanup, makeFixture, type Fixture } from '../../test-support/upgradeChecks';

const KEY = 'ngdpbase.auth.passkey.enabled';
const MESSAGE = "Passkeys can't work on this site's address. They need an https address.";
const VIEWS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../views');

describe('passkeys on, address cannot support them (#2340)', () => {
  let f: Fixture;
  let manager: UpgradeCheckManager;
  let address: { url: string; explicit: boolean };

  beforeEach(() => {
    f = makeFixture();
    address = { url: 'http://wiki.home.lan', explicit: true };
    f.props[KEY] = true;
    f.props['ngdpbase.application-name'] = 'Wiki';
    // The real AuthManager decides, so this is the same rule Admin → Configuration uses.
    const config = (f.engine.getManager('ConfigurationManager') as unknown) as Record<string, unknown>;
    config.isBaseUrlExplicit = () => address.explicit;
    config.getBaseURL = () => address.url;
    const auth = new AuthManager(f.engine);
    const getManager = f.engine.getManager.bind(f.engine) as (n: string) => unknown;
    (f.engine as { getManager: (n: string) => unknown }).getManager = (n: string) => (n === 'AuthManager' ? auth : getManager(n));
    manager = new UpgradeCheckManager(f.engine);
    shippedLiveChecks(f.engine).forEach((c) => manager.registerLive(c));
  });
  afterEach(() => cleanup(f));

  const passkeyItems = async () => (await manager.openItems(admin)).filter((i) => i.text === MESSAGE);

  test('http on a non-localhost host, passkeys on: the item shows, with the turn-off action', async () => {
    const [item] = await passkeyItems();
    expect(item).toBeDefined();
    expect(item.action).toMatchObject({ label: 'Turn passkeys off', property: KEY, value: 'false' });
    expect(item.text).not.toMatch(/#\d|docs\/|ngdpbase\.|\blog\b/i);
  });

  test('the action posts false to the ordinary configuration save, and the page then shows no item', async () => {
    const [item] = await passkeyItems();
    const html = await ejs.renderFile(path.join(VIEWS, 'admin-upgrade.ejs'), {
      title: 't', heading: 'h', intro: 'i', empty: 'e', success: null, error: null, items: [item], csrfToken: 'tok',
      can: () => true, locals: {}, lockedUnless: () => '', readOnly: 'r'
    }, { includer: (o: string) => (o === 'header' || o === 'footer' ? { template: '' } : undefined) });
    const bodies: string[] = [];
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      beforeParse: (w) => {
        const win = w as unknown as Record<string, unknown>;
        win.csrfFetch = (_u: string, o: { body: string }) => { bodies.push(o.body); return Promise.resolve({ json: () => Promise.resolve({ success: false, error: 'x' }) }); };
        win.followReauth = () => false;
      }
    });
    const doc = dom.window.document;
    const form = doc.querySelector('form[action="/admin/configuration"]') as HTMLFormElement;
    expect(form).not.toBeNull();
    expect(form.method).toBe('post');
    expect((form.querySelector('[name=property]') as HTMLInputElement).value).toBe(KEY);
    expect((form.querySelector('[name=value]') as HTMLInputElement).value).toBe('false');
    expect((form.querySelector('[name=_csrf]') as HTMLInputElement).value).toBe('tok');
    expect(form.querySelector('button')!.textContent!.trim()).toBe('Turn passkeys off');
    form.dispatchEvent(new dom.window.Event('submit', { cancelable: true, bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(new URLSearchParams(bodies[0]).get('property')).toBe(KEY);
    expect(new URLSearchParams(bodies[0]).get('value')).toBe('false');
    // Once it is saved, the item is worked out again and is gone.
    f.props[KEY] = false;
    expect(await passkeyItems()).toEqual([]);
  });

  test('without config-manage the button is disabled', async () => {
    const [item] = await passkeyItems();
    const html = await ejs.renderFile(path.join(VIEWS, 'admin-upgrade.ejs'), {
      title: 't', heading: 'h', intro: 'i', empty: 'e', success: null, error: null, items: [item], csrfToken: 'tok',
      can: () => false, locals: {}, lockedUnless: () => ' disabled aria-disabled="true"', readOnly: 'r'
    }, { includer: (o: string) => (o === 'header' || o === 'footer' ? { template: '' } : undefined) });
    expect(new JSDOM(html).window.document.querySelector('form[action="/admin/configuration"] button')!.hasAttribute('disabled')).toBe(true);
  });

  test('passkeys off: no item', async () => {
    f.props[KEY] = false;
    expect(await passkeyItems()).toEqual([]);
  });

  test('https address: no item', async () => {
    address.url = 'https://wiki.example.com';
    expect(await passkeyItems()).toEqual([]);
  });

  test('localhost: no item', async () => {
    address.url = 'http://localhost:3000';
    expect(await passkeyItems()).toEqual([]);
  });

  test('worked out each look: it returns when the address or setting changes back', async () => {
    address.url = 'https://wiki.example.com';
    expect(await passkeyItems()).toEqual([]);
    address.url = 'http://wiki.home.lan';
    expect(await passkeyItems()).toHaveLength(1);
  });
});
