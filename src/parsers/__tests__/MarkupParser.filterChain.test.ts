/**
 * Integration tests for FilterChain wiring (#596).
 *
 * Asserts that:
 *   - filterChain.process() actually runs during MarkupParser.parse() — fixing
 *     the "configured but never called" defect.
 *   - ValidationFilter's malformed-inline-style rule annotates the rendered
 *     output (replacing the inline regex check that previously lived in
 *     MarkupParser.ts:2173-2178).
 *   - Clean inputs produce no spurious validation comments.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import MarkupParser from '../MarkupParser';
import FilterManager from '../../managers/FilterManager';

class MockEngine {
  managers: Map<string, unknown>;
  constructor() {
    this.managers = new Map([
      ['ConfigurationManager', {
        getProperty: (key: string, defaultValue: unknown) => {
          const cfg: Record<string, unknown> = {
            'ngdpbase.markup.enabled': true,
            'ngdpbase.markup.caching': false,
            'ngdpbase.markup.handlers.plugin.enabled': false,
            'ngdpbase.markup.handlers.wikitag.enabled': false,
            'ngdpbase.markup.handlers.form.enabled': false,
            'ngdpbase.markup.handlers.interwiki.enabled': false,
            'ngdpbase.markup.handlers.linkparser.enabled': false,
            // FilterChain on, ValidationFilter on, others off — matches
            // production default config.
            'ngdpbase.filters.enabled': true,
            'ngdpbase.filters.security.enabled': false,
            'ngdpbase.filters.spam.enabled': false,
            'ngdpbase.filters.validation.enabled': true,
            'ngdpbase.filters.validation.validate-markup': true,
            'ngdpbase.filters.validation.report-errors': true
          };
          return cfg[key] ?? defaultValue;
        },
        isInitialized: () => true
      }],
      ['CacheManager', {
        isInitialized: () => true,
        region: () => ({ get: async () => null, set: async () => {} })
      }],
      ['RenderingManager', {
        converter: { makeHtml: (s: string) => s }
      }]
    ]);
  }
  getManager(name: string) { return this.managers.get(name) || null; }
}

describe('MarkupParser FilterChain integration (#596)', () => {
  let parser: MarkupParser;
  let filterManager: FilterManager;

  beforeEach(async () => {
    // #1117: FilterManager owns the chain; the parser reads it from the
    // engine, mirroring WikiEngine's initialization order.
    const engine = new MockEngine();
    filterManager = new FilterManager(engine);
    await filterManager.initialize();
    engine.managers.set('FilterManager', filterManager);
    parser = new MarkupParser(engine);
    await parser.initialize();
  });

  afterEach(async () => {
    await parser.shutdown();
    await filterManager.shutdown();
  });

  test('filterChain.process is invoked twice per parse — once per phase', async () => {
    const filterChain = parser.getFilterChain();
    expect(filterChain).not.toBeNull();
    if (!filterChain) return; // narrow

    const spy = vi.spyOn(filterChain, 'process');
    await parser.parse('hello world');
    // #614: one call per pipeline phase (markup before Showdown, html after).
    expect(spy).toHaveBeenCalledTimes(2);
    const phases = spy.mock.calls.map(call => call[2]);
    expect(phases).toEqual(['markup', 'html']);
  });

  test('malformed inline style produces a VALIDATION WARNING comment', async () => {
    const result = await parser.parse('%%sup2%%');
    expect(result).toContain('<!-- VALIDATION WARNING [malformedInlineStyle]');
  });

  test('clean content does not introduce validation comments', async () => {
    const result = await parser.parse('A simple paragraph with no malformed wiki syntax.');
    expect(result).not.toContain('VALIDATION WARNING');
    expect(result).not.toContain('VALIDATION ERROR');
  });

  test('getFilterChain returns the same instance on every call', () => {
    const a = parser.getFilterChain();
    const b = parser.getFilterChain();
    expect(a).toBe(b);
    expect(a).not.toBeNull();
  });
});
