/**
 * #1965: [{ConfigAccessor type='addons'}] and [{ConfigAccessor type='my-addons'}].
 * The data is AddonsManager's (a stand-in here, holding listedAddons() and
 * enabledAddonsFor()); the plugin only renders it, escaped, and decides who
 * sees the admin-only fields through the PDP's admin-read.
 */
import ConfigAccessorPluginModule from '../ConfigAccessorPlugin';
import { asExecuted } from '../../test-support/plugins';
import type { AddonListing } from '../../managers/AddonsManager';

const ConfigAccessorPlugin = asExecuted(ConfigAccessorPluginModule);

const entry = (slug: string, more: Partial<AddonListing> = {}): AddonListing => ({
  slug, description: `${slug} does things`, family: null, aboutPage: null, perPerson: false,
  version: '1.2.3', loaded: true, error: null, ...more
});

const LISTING: AddonListing[] = [
  entry('accounting', { family: 'Accounting', aboutPage: 'accounting-about' }),
  entry('accounting-dues', { family: 'Accounting' }),
  entry('calendar', { aboutPage: '0b0e3c0e-1111-4222-8333-444455556666' }),
  entry('broken', { loaded: false, error: 'needs ngdpbase 9.0.0 or later' }),
  entry('phr', { perPerson: true, family: 'Health', description: 'Your <health> record' }),
  entry('diary', { perPerson: true })
];

const ALICE = { username: 'alice', roles: ['reader'], isAuthenticated: true };
const ANONYMOUS = { username: 'Anonymous', roles: ['anonymous'], isAuthenticated: false };

function render(type: string, opts: { granted?: string[]; viewer?: unknown; listing?: AddonListing[]; on?: string[]; noAddons?: boolean } = {}) {
  const enabledAddonsFor = vi.fn(async () => opts.on ?? []);
  const managers: Record<string, unknown> = {
    ConfigurationManager: { getProperty: (_k: string, d?: unknown) => d, getAllProperties: () => ({}) },
    PolicyDecisionPoint: { permits: (_s: unknown, action: string) => Promise.resolve((opts.granted ?? []).includes(action)) },
    ...(opts.noAddons ? {} : { AddonsManager: { listedAddons: () => opts.listing ?? LISTING, enabledAddonsFor } })
  };
  const context = { engine: { getManager: (n: string) => managers[n] ?? null }, userContext: opts.viewer ?? ALICE, pageName: 'Add-ons' } as never;
  return { html: ConfigAccessorPlugin.execute(context, { type }), enabledAddonsFor };
}

describe("ConfigAccessor type='addons' (#1965)", () => {
  test('lists each add-on with its description and a /view/ link to its About page', async () => {
    const html = await render('addons').html;
    expect(html).toContain('data-addon="calendar"');
    expect(html).toContain('calendar does things');
    expect(html).toContain('href="/view/accounting-about">More about it</a>');
    expect(html).toContain('href="/view/0b0e3c0e-1111-4222-8333-444455556666">More about it</a>');
    // No About page, no link
    const start = html.indexOf('data-addon="accounting-dues"');
    expect(html.slice(start, html.indexOf('</li>', start))).not.toContain('More about it');
  });

  test('groups by family, families in name order, then the rest under Other', async () => {
    const html = await render('addons').html;
    const headings = [...html.matchAll(/<h6 class="addon-family[^"]*">([^<]+)<\/h6>/g)].map((m) => m[1]);
    expect(headings).toEqual(['Accounting', 'Health', 'Other']);
    const accounting = html.slice(html.indexOf('>Accounting<'), html.indexOf('>Health<'));
    expect(accounting).toContain('data-addon="accounting"');
    expect(accounting).toContain('data-addon="accounting-dues"');
    expect(accounting).not.toContain('data-addon="calendar"');
  });

  test('with no families, no headings', async () => {
    const html = await render('addons', { listing: [entry('calendar'), entry('forms')] }).html;
    expect(html).not.toContain('addon-family');
  });

  test('version and status are for admin-read only; others see only add-ons that loaded', async () => {
    const reader = await render('addons').html;
    expect(reader).not.toContain('1.2.3');
    expect(reader).not.toContain('Loaded');
    expect(reader).not.toContain('data-addon="broken"');
    expect(reader).not.toContain('needs ngdpbase');

    const anonymous = await render('addons', { viewer: ANONYMOUS }).html;
    expect(anonymous).not.toContain('1.2.3');
    expect(anonymous).not.toContain('data-addon="broken"');

    const admin = await render('addons', { granted: ['admin-read'] }).html;
    expect(admin).toContain('v1.2.3');
    expect(admin).toContain('Loaded');
    expect(admin).toContain('data-addon="broken"');
    expect(admin).toContain('Not loaded');
    expect(admin).toContain('needs ngdpbase 9.0.0 or later');
  });

  test('escapes what the add-on supplies', async () => {
    const html = await render('addons', {
      granted: ['admin-read'],
      listing: [entry('x"><script>', { description: '<img onerror=1>', family: '<b>F</b>', aboutPage: '"><script>', version: '<v>', loaded: false, error: '<err>' })]
    }).html;
    expect(html).not.toMatch(/<script>|<img|<b>|<v>|<err>/);
    expect(html).toContain('&lt;img onerror=1&gt;');
    expect(html).toContain('href="/view/%22%3E%3Cscript%3E"');
  });

  test('no add-ons, or no AddonsManager, is said plainly', async () => {
    expect(await render('addons', { listing: [] }).html).toContain('This site has no add-ons turned on.');
    expect(await render('addons', { noAddons: true }).html).toContain('Add-ons are not available');
  });
});

describe("ConfigAccessor type='my-addons' (#1965)", () => {
  test('lists the viewer\'s turned-on per-person add-ons, and "Turn it on" for the rest', async () => {
    const { html, enabledAddonsFor } = render('my-addons', { on: ['phr'] });
    const out = await html;
    expect(enabledAddonsFor).toHaveBeenCalledWith(ALICE);
    const mine = out.slice(out.indexOf('addon-mine'), out.indexOf('addon-available'));
    expect(mine).toContain('data-addon="phr"');
    expect(mine).not.toContain('data-addon="diary"');
    const available = out.slice(out.indexOf('addon-available'));
    expect(available).toContain('data-addon="diary"');
    expect(available).toContain('<a class="addon-turn-on" href="/profile">Turn it on</a>');
    // Not per-person: never listed here
    expect(out).not.toContain('data-addon="calendar"');
    expect(out).toContain('Your &lt;health&gt; record');
  });

  test('nothing turned on yet', async () => {
    const out = await render('my-addons').html;
    expect(out).toContain('You have not turned on any add-ons yet.');
    expect(out).toContain('data-addon="phr"');
    expect(out).toContain('Turn it on');
  });

  test('an anonymous viewer is asked to sign in, and nobody\'s add-ons are read', async () => {
    const { html, enabledAddonsFor } = render('my-addons', { viewer: ANONYMOUS });
    const out = await html;
    expect(out).toContain('<a href="/login">Sign in</a> to see the add-ons you have turned on.');
    expect(enabledAddonsFor).not.toHaveBeenCalled();
  });

  test('a site with no per-person add-ons says so', async () => {
    const out = await render('my-addons', { listing: [entry('calendar')] }).html;
    expect(out).toContain('This site has no add-ons that you turn on for yourself.');
  });

  test('no admin-only field appears, even for an admin', async () => {
    const out = await render('my-addons', { granted: ['admin-read'], on: ['phr'] }).html;
    expect(out).not.toContain('1.2.3');
    expect(out).not.toContain('Loaded');
  });
});
