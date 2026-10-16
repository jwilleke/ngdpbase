/**
 * #1764 — the Permissions help page is the one place every permission is
 * defined for a person: `[{ConfigAccessor type='permissionsList'}]` renders
 * the live catalog, each permission by name with its plain words (the
 * catalog's `label`), never the developer description, and no records.
 */
import fs from 'fs';
import path from 'path';
import ConfigAccessorPluginModule from '../ConfigAccessorPlugin';
import { asExecuted } from '../../test-support/plugins';

const ConfigAccessorPlugin = asExecuted(ConfigAccessorPluginModule);

const shipped = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config', 'app-default-config.json'), 'utf8')) as Record<string, unknown>;
const catalog = shipped['ngdpbase.permissions.definitions'] as Record<string, { grantable?: boolean; label?: string; description?: string }>;
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

function context(defs: unknown) {
  const managers: Record<string, unknown> = {
    ConfigurationManager: { getProperty: (k: string, d?: unknown) => (k === 'ngdpbase.permissions.definitions' ? defs : d), getAllProperties: () => ({}) }
  };
  return { engine: { getManager: (n: string) => managers[n] ?? null }, userContext: { username: 'someone', roles: [] }, pageName: 'Permissions' } as never;
}

describe('#1764 Permissions reference (permissionsList)', () => {
  test('lists every grantable permission in the shipped catalog with its plain words', async () => {
    const html = await ConfigAccessorPlugin.execute(context(catalog), { type: 'permissionsList' });
    const grantable = Object.entries(catalog).filter(([, e]) => e.grantable !== false);
    expect(grantable.length).toBeGreaterThan(0);
    for (const [name, entry] of grantable) {
      expect(html).toContain(`<code>${name}</code>`);
      expect(html).toContain(escape(String(entry.label)));
    }
    for (const [name, entry] of Object.entries(catalog).filter(([, e]) => e.grantable === false)) {
      expect(html, name).not.toContain(`<code>${name}</code>`);
      expect(entry.label).toBeUndefined();
    }
    // Developer notes stay out of the help page.
    expect(html).not.toMatch(/\(#\d+|ngdpbase\.auth/);
  });

  test('an add-on permission with no label reads by its description', async () => {
    const html = await ConfigAccessorPlugin.execute(context({ 'thing-manage': { description: 'Manage things' } }), { type: 'permissionsList' });
    expect(html).toContain('<code>thing-manage</code>');
    expect(html).toContain('Manage things');
  });
});
