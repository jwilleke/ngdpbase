/**
 * #1503 — the categories table shows where each system-category's pages are
 * stored (`none` / `public` / `vault`, from its storageLocation) and filters
 * on it with `stored=`. The former `source` column and `source=` filter are
 * gone.
 */
import fs from 'fs';
import path from 'path';
import ConfigAccessorPluginModule from '../ConfigAccessorPlugin';
import { asExecuted } from '../../test-support/plugins';

const ConfigAccessorPlugin = asExecuted(ConfigAccessorPluginModule);

const shipped = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config', 'app-default-config.json'), 'utf8')) as Record<string, unknown>;
const categories = shipped['ngdpbase.system-category'];

function context(cats: unknown) {
  const managers: Record<string, unknown> = {
    ConfigurationManager: { getProperty: (k: string, d?: unknown) => (k === 'ngdpbase.system-category' ? cats : d), getAllProperties: () => ({}) }
  };
  return { engine: { getManager: (n: string) => managers[n] ?? null }, userContext: { username: 'someone', roles: [] }, pageName: 'System Categories' } as never;
}

const labels = (html: string) => [...html.matchAll(/<td><code>([^<]+)<\/code><\/td>/g)].map((m) => m[1]);

describe('systemCategories table: stored= (#1503)', () => {
  test('a Stored column and a By Stored count, never Source', async () => {
    const html = await ConfigAccessorPlugin.execute(context(categories), { type: 'systemCategories' });
    expect(html).toContain('>Stored</th>');
    expect(html).not.toContain('Source');
    expect(html).toMatch(/By Stored: .*public: 4/);
    expect(html).toMatch(/By Stored: .*vault: 2/);
    expect(html).toMatch(/By Stored: .*none: 1/);
  });

  test.each([
    ['none', ['developer']],
    ['public', ['addon', 'documentation', 'system', 'user-profile']],
    ['vault', ['capture', 'general']],
    ['VAULT', ['capture', 'general']]
  ])('stored=%s lists %j', async (stored, expected) => {
    const html = await ConfigAccessorPlugin.execute(context(categories), { type: 'systemCategories', stored });
    expect(labels(html)).toEqual(expected);
  });

  test('a leftover source on an entry changes nothing', async () => {
    const html = await ConfigAccessorPlugin.execute(
      context({ notes: { label: 'notes', source: 'repo', storageLocation: { defaultstore: 'pages/' } } }),
      { type: 'systemCategories', stored: 'public' }
    );
    expect(labels(html)).toEqual(['notes']);
  });
});
