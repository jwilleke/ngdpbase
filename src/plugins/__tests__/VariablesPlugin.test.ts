/**
 * VariablesPlugin tests
 *
 * Covers:
 * - Metadata
 * - No VariableManager → error message
 * - type=system, type=contextual, type=plugins, type=all (default)
 * - PluginManager with/without entries
 * - ConfigAccessorPlugin delegation in type=all
 * - Summary stats
 * - Error thrown → error message
 *
 * @jest-environment node
 */

import VariablesPluginModule from '../VariablesPlugin';
import { asExecuted } from '../../test-support/plugins';

const VariablesPlugin = asExecuted(VariablesPluginModule);

const makeVariableManager = (
  systemVars = ['version', 'date'],
  contextualVars = ['username', 'pagename']
) => ({
  getDebugInfo: vi.fn().mockReturnValue({
    systemVariables: systemVars,
    contextualVariables: contextualVars,
    totalVariables: systemVars.length + contextualVars.length
  }),
  getVariable: vi.fn((name: string) => {
    const vals: Record<string, string> = { version: '3.0.0', date: '2026-04-24', username: 'alice', pagename: 'Home' };
    return vals[name] ?? 'unknown';
  })
});

const makeEngine = (managers: Record<string, unknown> = {}) => ({
  getManager: vi.fn((name: string) => managers[name] ?? null)
});

describe('VariablesPlugin', () => {
  describe('metadata', () => {
    test('has correct name and version', () => {
      expect(VariablesPlugin.name).toBe('VariablesPlugin');
      expect(VariablesPlugin.version).toBe('1.0.0');
      expect(typeof VariablesPlugin.execute).toBe('function');
    });

    test('initialize does not throw', () => {
      expect(() => VariablesPlugin.initialize?.({})).not.toThrow();
    });
  });

  describe('no VariableManager', () => {
    test('returns error message when VariableManager is unavailable', async () => {
      const context = { engine: makeEngine() };
      const result = await VariablesPlugin.execute(context, {});
      expect(result).toContain('VariableManager not available');
    });

    test('returns error when engine is null', async () => {
      const context = { engine: null };
      const result = await VariablesPlugin.execute(context, {});
      expect(result).toContain('VariableManager not available');
    });
  });

  describe("type='system'", () => {
    test('shows system variables table', async () => {
      const vm = makeVariableManager();
      const context = { engine: makeEngine({ VariableManager: vm }) };
      const result = await VariablesPlugin.execute(context, { type: 'system' });
      expect(result).toContain('System Variables');
      expect(result).toContain('[{$version}]');
      expect(result).toContain('3.0.0');
    });

    test('does not show contextual or plugins sections', async () => {
      const vm = makeVariableManager();
      const context = { engine: makeEngine({ VariableManager: vm }) };
      const result = await VariablesPlugin.execute(context, { type: 'system' });
      expect(result).not.toContain('id="var-contextual"');
      expect(result).not.toContain('id="var-plugins"');
    });
  });

  describe("type='contextual'", () => {
    test('shows contextual variables table', async () => {
      const vm = makeVariableManager();
      const context = { engine: makeEngine({ VariableManager: vm }) };
      const result = await VariablesPlugin.execute(context, { type: 'contextual' });
      expect(result).toContain('Contextual Variables');
      expect(result).toContain('[{$username}]');
    });

    test('does not show system section', async () => {
      const vm = makeVariableManager();
      const context = { engine: makeEngine({ VariableManager: vm }) };
      const result = await VariablesPlugin.execute(context, { type: 'contextual' });
      expect(result).not.toContain('id="var-system"');
    });
  });

  describe("type='plugins'", () => {
    test('shows plugins table when PluginManager has entries', async () => {
      const vm = makeVariableManager();
      const mockPluginManager = {
        plugins: new Map([
          ['TestPlugin', { description: 'A test plugin', version: '1.0', author: 'Tester' }],
          ['AnotherPlugin', { description: 'Another one', version: '2.0', author: 'Dev' }]
        ])
      };
      const context = { engine: makeEngine({ VariableManager: vm, PluginManager: mockPluginManager }) };
      const result = await VariablesPlugin.execute(context, { type: 'plugins' });
      expect(result).toContain('Available Plugins');
      expect(result).toContain('TestPlugin');
      expect(result).toContain('AnotherPlugin');
    });

    test('sorts plugins alphabetically', async () => {
      const vm = makeVariableManager();
      const mockPluginManager = {
        plugins: new Map([
          ['ZPlugin', { description: 'Last' }],
          ['APlugin', { description: 'First' }]
        ])
      };
      const context = { engine: makeEngine({ VariableManager: vm, PluginManager: mockPluginManager }) };
      const result = await VariablesPlugin.execute(context, { type: 'plugins' });
      const aIdx = result.indexOf('APlugin');
      const zIdx = result.indexOf('ZPlugin');
      expect(aIdx).toBeLessThan(zIdx);
    });

    test('shows "No plugins" when PluginManager unavailable', async () => {
      const vm = makeVariableManager();
      const context = { engine: makeEngine({ VariableManager: vm }) };
      const result = await VariablesPlugin.execute(context, { type: 'plugins' });
      expect(result).toContain('No plugins currently registered');
    });

    test('shows "No plugins" when plugins map is empty', async () => {
      const vm = makeVariableManager();
      const mockPluginManager = { plugins: new Map() };
      const context = { engine: makeEngine({ VariableManager: vm, PluginManager: mockPluginManager }) };
      const result = await VariablesPlugin.execute(context, { type: 'plugins' });
      expect(result).toContain('No plugins currently registered');
    });
  });

  describe("type='all' (default)", () => {
    test('shows navigation tabs for all sections', async () => {
      const vm = makeVariableManager();
      const context = { engine: makeEngine({ VariableManager: vm }) };
      const result = await VariablesPlugin.execute(context, {});
      expect(result).toContain('id="var-system"');
      expect(result).toContain('id="var-contextual"');
      expect(result).toContain('id="var-plugins"');
      expect(result).toContain('id="var-config"');
    });

    test('shows summary stats', async () => {
      const vm = makeVariableManager(['version', 'date'], ['username']);
      const context = { engine: makeEngine({ VariableManager: vm }) };
      const result = await VariablesPlugin.execute(context, { type: 'all' });
      expect(result).toContain('Total Variables:');
      expect(result).toContain('System: 2');
      expect(result).toContain('Contextual: 1');
    });

    test('shows "ConfigAccessorPlugin not available" when absent', async () => {
      const vm = makeVariableManager();
      const context = { engine: makeEngine({ VariableManager: vm }) };
      const result = await VariablesPlugin.execute(context, { type: 'all' });
      expect(result).toContain('ConfigAccessorPlugin not available');
    });

    test('delegates to ConfigAccessorPlugin execute when present', async () => {
      const vm = makeVariableManager();
      const mockConfigAccessorPlugin = {
        execute: vi.fn().mockResolvedValue('<div>config output</div>'),
        description: 'Config accessor'
      };
      const mockPluginManager = {
        plugins: new Map([['ConfigAccessorPlugin', mockConfigAccessorPlugin]])
      };
      const context = { engine: makeEngine({ VariableManager: vm, PluginManager: mockPluginManager }) };
      const result = await VariablesPlugin.execute(context, { type: 'all' });
      expect(mockConfigAccessorPlugin.execute).toHaveBeenCalled();
      expect(result).toContain('config output');
    });

    test('shows error when ConfigAccessorPlugin.execute throws', async () => {
      const vm = makeVariableManager();
      const mockConfigAccessorPlugin = {
        execute: vi.fn().mockRejectedValue(new Error('config error')),
        description: 'Config accessor'
      };
      const mockPluginManager = {
        plugins: new Map([['ConfigAccessorPlugin', mockConfigAccessorPlugin]])
      };
      const context = { engine: makeEngine({ VariableManager: vm, PluginManager: mockPluginManager }) };
      const result = await VariablesPlugin.execute(context, { type: 'all' });
      expect(result).toContain('Error loading configuration variables');
    });
  });

  describe('error handling', () => {
    test('returns error message on thrown exception', async () => {
      const brokenVm = {
        getDebugInfo: () => { throw new Error('getDebugInfo exploded'); }
      };
      const context = { engine: makeEngine({ VariableManager: brokenVm }) };
      const result = await VariablesPlugin.execute(context, {});
      expect(result).toContain('Error displaying variables');
      expect(result).toContain('getDebugInfo exploded');
    });
  });

  describe('HTML escaping', () => {
    test('escapes HTML in variable values', async () => {
      const vm = {
        getDebugInfo: vi.fn().mockReturnValue({
          systemVariables: ['version'],
          contextualVariables: [],
          totalVariables: 1
        }),
        getVariable: vi.fn().mockReturnValue('<script>alert(1)</script>')
      };
      const context = { engine: makeEngine({ VariableManager: vm }) };
      const result = await VariablesPlugin.execute(context, { type: 'system' });
      expect(result).not.toContain('<script>alert(1)</script>');
      expect(result).toContain('&lt;script&gt;');
    });
  });
});
