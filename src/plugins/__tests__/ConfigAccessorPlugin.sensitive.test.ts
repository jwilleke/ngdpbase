/**
 * #1750: ConfigAccessorPlugin printed every configuration value it was asked
 * for, secrets included, to anyone who could read the page — the shipped
 * Plugin page showed anonymous visitors the session secret. Every path now
 * goes through the sensitive-values rule.
 */
import ConfigAccessorPlugin from '../ConfigAccessorPlugin';

const CONFIG: Record<string, unknown> = {
  'ngdpbase.config.sensitive-values': { 'ngdpbase.session.secret': 'secret', 'ngdpbase.backup.directory': 'sensitive' },
  'ngdpbase.session.secret': 'SESSION-SECRET-VALUE',
  'ngdpbase.backup.directory': '/srv/private/backups',
  'ngdpbase.application-name': 'Club Site',
  'ngdpbase.auth.password.enabled': true,
  'ngdpbase.dawarich.apiKey': 'DAWARICH-KEY-VALUE'
};

function context(granted: string[]) {
  const managers: Record<string, unknown> = {
    ConfigurationManager: { getProperty: (k: string, d?: unknown) => (k in CONFIG ? CONFIG[k] : d), getAllProperties: () => CONFIG },
    PolicyDecisionPoint: { permits: (_s: unknown, action: string) => Promise.resolve(granted.includes(action)) }
  };
  return { engine: { getManager: (n: string) => managers[n] ?? null }, userContext: { username: 'someone', roles: [] }, pageName: 'Plugin' } as never;
}

const render = (params: Record<string, unknown>, granted: string[] = []) => ConfigAccessorPlugin.execute(context(granted), params);

describe('ConfigAccessorPlugin never prints a value its viewer may not see (#1750)', () => {
  test.each([
    ['the wildcard table', { key: 'ngdpbase.*' }],
    ['the wildcard values', { key: 'ngdpbase.*', valueonly: 'true' }],
    ['a single key', { key: 'ngdpbase.session.secret' }],
    ['a single key, value only', { key: 'ngdpbase.session.secret', valueonly: 'true' }],
    ['a single key as a table', { key: 'ngdpbase.session.secret', table: 'true' }]
  ])('%s: no secret and no sensitive value for an anonymous viewer', async (_name, params) => {
    const html = await render(params);
    expect(html).not.toContain('SESSION-SECRET-VALUE');
    expect(html).not.toContain('/srv/private/backups');
    expect(html).not.toContain('DAWARICH-KEY-VALUE');
  });

  test('ordinary values, and a boolean under a password-looking name, are still shown', async () => {
    const html = await render({ key: 'ngdpbase.*' });
    expect(html).toContain('Club Site');
    expect(html).toMatch(/ngdpbase\.auth\.password\.enabled<\/code><\/td>\s*<td><code>true/);
  });

  test('admin-read sees sensitive values, not secrets', async () => {
    const html = await render({ key: 'ngdpbase.*' }, ['admin-read']);
    expect(html).toContain('/srv/private/backups');
    expect(html).not.toContain('SESSION-SECRET-VALUE');
    expect(html).not.toContain('DAWARICH-KEY-VALUE');
  });

  test('secret-reveal sees secrets', async () => {
    const html = await render({ key: 'ngdpbase.*' }, ['admin-read', 'secret-reveal']);
    expect(html).toContain('SESSION-SECRET-VALUE');
  });
});
