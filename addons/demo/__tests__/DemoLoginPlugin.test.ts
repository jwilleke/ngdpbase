/**
 * [{DemoLogin}] — the demo's published credentials, read from config (#1029).
 *
 * The page must never disagree with the account that exists. Literal text in
 * the markdown is a copy, and a copy goes stale the moment the operator
 * changes the password — so the plugin reads the same key the addon seeds
 * from.
 *
 * It renders the password UNMASKED on purpose, which is only defensible
 * because it is single-purpose: one hard-coded key, no parameters, shipped in
 * an addon that is off by default. These tests pin that narrowness as much as
 * the rendering.
 */

import DemoLoginPlugin from '../plugins/DemoLoginPlugin';

function makeContext(properties: Record<string, unknown>, opts: { throws?: boolean } = {}) {
  const configManager = {
    getProperty: vi.fn((key: string, dflt?: unknown) => {
      if (opts.throws) throw new Error('references unset env var NGDPBASE_DEMO_ADMIN_PASSWORD');
      return key in properties ? properties[key] : dflt;
    })
  };
  return { engine: { getManager: vi.fn(() => configManager) } } as never;
}

const CONFIGURED = {
  'ngdpbase.addons.demo.admin-account.username': 'admindemo',
  'ngdpbase.addons.demo.admin-account.password': 'published-demo-pw'
};

describe('[{DemoLogin}] (#1029)', () => {
  test('renders the configured username and password', () => {
    const html = DemoLoginPlugin.execute(makeContext(CONFIGURED), {});

    expect(html).toContain('admindemo');
    expect(html).toContain('published-demo-pw');
  });

  test('reflects a rotated password without the page being edited', () => {
    // The entire reason this is a plugin and not literal markdown.
    const html = DemoLoginPlugin.execute(
      makeContext({ ...CONFIGURED, 'ngdpbase.addons.demo.admin-account.password': 'rotated' }),
      {}
    );

    expect(html).toContain('rotated');
    expect(html).not.toContain('published-demo-pw');
  });

  test('says no login is configured rather than printing a ${VAR} placeholder', () => {
    // The key ships in brace form, which is silent on a missing variable and
    // leaves the placeholder intact. Rendering it would read as a credential.
    const html = DemoLoginPlugin.execute(
      makeContext({
        ...CONFIGURED,
        'ngdpbase.addons.demo.admin-account.password': '${NGDPBASE_DEMO_ADMIN_PASSWORD}'
      }),
      {}
    );

    expect(html).not.toContain('${');
    expect(html).toMatch(/no demo login is configured/i);
  });

  test('survives a config read that throws on an unset env-ref', () => {
    const html = DemoLoginPlugin.execute(makeContext({}, { throws: true }), {});

    expect(html).toMatch(/no demo login is configured/i);
  });

  test('escapes the rendered values', () => {
    const html = DemoLoginPlugin.execute(
      makeContext({
        ...CONFIGURED,
        'ngdpbase.addons.demo.admin-account.password': '<script>alert(1)</script>'
      }),
      {}
    );

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('takes no parameters — it cannot be pointed at another config key', () => {
    // The narrowness IS the security argument for rendering unmasked. If this
    // ever accepted a key parameter it would become an arbitrary config
    // disclosure primitive on a public page.
    const context = makeContext(CONFIGURED);
    DemoLoginPlugin.execute(context, { key: 'ngdpbase.session.secret' });

    const configManager = (context as unknown as { engine: { getManager: () => { getProperty: { mock: { calls: unknown[][] } } } } })
      .engine.getManager();
    const keysRead = configManager.getProperty.mock.calls.map((c) => c[0]);
    expect(keysRead).not.toContain('ngdpbase.session.secret');
  });

  test('renders nothing without a ConfigurationManager', () => {
    const context = { engine: { getManager: vi.fn(() => null) } } as never;
    expect(DemoLoginPlugin.execute(context, {})).toBe('');
  });
});
