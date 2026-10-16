/**
 * PluginManager owns the plugin formatter helpers and hands them to every
 * plugin it runs as `context.formatters` (#1820).
 */
import PluginManager from '../PluginManager';
import * as pluginFormatters from '../../utils/pluginFormatters';

describe('PluginManager.formatters (#1820)', () => {
  const makeManager = () =>
    new PluginManager({
      getManager: vi.fn(),
      logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }
    });

  test('is frozen', () => {
    const pm = makeManager();
    expect(Object.isFrozen(pm.formatters)).toBe(true);
  });

  test('holds the same function and constant objects pluginFormatters exports', () => {
    const pm = makeManager();
    const exported = Object.keys(pluginFormatters);
    expect(Object.keys(pm.formatters).sort()).toEqual([...exported].sort());
    for (const name of exported) {
      expect(pm.formatters[name as keyof typeof pm.formatters]).toBe(pluginFormatters[name as keyof typeof pluginFormatters]);
    }
  });

  test('every executed plugin receives the formatters in its context', async () => {
    const pm = makeManager();
    let seen: unknown;
    await pm.registerPlugin('SeePlugin', {
      execute: (context) => {
        seen = context.formatters;
        return '';
      }
    });
    await pm.execute('SeePlugin', 'TestPage', {}, {});
    expect(seen).toBe(pm.formatters);
    expect(Object.isFrozen(seen)).toBe(true);
  });

  test('a plugin can call context.formatters.escapeHtml', async () => {
    const pm = makeManager();
    await pm.registerPlugin('EscapePlugin', {
      execute: (context, params) => context.formatters.escapeHtml(String(params.text))
    });
    const out = await pm.execute('EscapePlugin', 'TestPage', { text: '<b>"x" & y</b>' });
    expect(out).toBe(pluginFormatters.escapeHtml('<b>"x" & y</b>'));
    expect(out).not.toContain('<b>');
  });

  test('a caller-supplied formatters value cannot replace the owned one', async () => {
    const pm = makeManager();
    let seen: unknown;
    await pm.registerPlugin('SeePlugin', {
      execute: (context) => {
        seen = context.formatters;
        return '';
      }
    });
    await pm.execute('SeePlugin', 'TestPage', {}, { formatters: { escapeHtml: () => 'spoofed' } });
    expect(seen).toBe(pm.formatters);
  });
});
