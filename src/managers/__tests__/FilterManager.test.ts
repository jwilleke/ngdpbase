/**
 * FilterManager (#1117) — the one owner of the content-filter capability.
 *
 * Two things are worth pinning, and they are the whole point of the issue:
 *
 * 1. The built-ins are registered through the same public registerFilter()
 *    an addon calls — the contributed path IS the tested path, per the
 *    architecture note ("if built-ins take a privileged shortcut, the path
 *    adopters depend on is the path nobody tests").
 * 2. Both consumers (MarkupParser render path, ValidationManager save path)
 *    read the manager's one chain — there is no second chain to disagree
 *    with the first.
 */
vi.unmock('../FilterManager');

import FilterManager from '../FilterManager';
import BaseFilter from '../../parsers/filters/BaseFilter';

function makeEngine(config: Record<string, unknown> = {}) {
  const managers = new Map<string, unknown>([
    ['ConfigurationManager', {
      getProperty: (key: string, fallback: unknown) => (key in config ? config[key] : fallback)
    }]
  ]);
  return {
    managers,
    getManager: (name: string) => managers.get(name) ?? null
  } as unknown as ConstructorParameters<typeof FilterManager>[0];
}

async function makeManager(config: Record<string, unknown> = {}) {
  const manager = new FilterManager(makeEngine(config));
  await manager.initialize();
  return manager;
}

const filterIds = (m: FilterManager) =>
  (m.getFilterChain()?.getFilters(false) ?? []).map((f) => f.constructor.name).sort();

describe('FilterManager built-in registration follows configuration', () => {
  test('defaults: ValidationFilter on, SecurityFilter present for block-on-save, Spam off', async () => {
    // SecurityFilter registers by default because block-on-save defaults true
    // (#1037: an unregistered filter contributes no save-time rules).
    const m = await makeManager();
    expect(filterIds(m)).toEqual(['SecurityFilter', 'ValidationFilter']);
    await m.shutdown();
  });

  test('block-on-save false and security disabled: no SecurityFilter', async () => {
    const m = await makeManager({
      'ngdpbase.filters.security.enabled': false,
      'ngdpbase.filters.security.block-on-save': false
    });
    expect(filterIds(m)).toEqual(['ValidationFilter']);
    await m.shutdown();
  });

  test('everything on', async () => {
    const m = await makeManager({
      'ngdpbase.filters.security.enabled': true,
      'ngdpbase.filters.spam.enabled': true,
      'ngdpbase.filters.validation.enabled': true
    });
    expect(filterIds(m)).toEqual(['SecurityFilter', 'SpamFilter', 'ValidationFilter']);
    await m.shutdown();
  });

  test('pipeline disabled: no chain at all', async () => {
    const m = await makeManager({ 'ngdpbase.filters.enabled': false });
    expect(m.getFilterChain()).toBeNull();
    expect(await m.collectErrors('content', {})).toEqual([]);
    expect(m.getStats()).toBeNull();
    await m.shutdown();
  });
});

describe('the contributed path (#1117)', () => {
  class HouseStyleFilter extends BaseFilter {
    constructor() {
      super(42, { description: 'test contributed filter', phase: 'markup' });
    }
    async process(content: string): Promise<string> {
      return content.replace(/\bcolour\b/g, 'color');
    }
  }

  test('an addon-shaped filter registers through the same door as the built-ins', async () => {
    const m = await makeManager();
    const ok = await m.registerFilter(new HouseStyleFilter());
    expect(ok).toBe(true);
    expect(filterIds(m)).toContain('HouseStyleFilter');
    await m.shutdown();
  });

  test('a contributed filter actually runs in the chain', async () => {
    const m = await makeManager({
      // Only the contributed filter, so the assertion isolates it.
      'ngdpbase.filters.security.enabled': false,
      'ngdpbase.filters.security.block-on-save': false,
      'ngdpbase.filters.validation.enabled': false
    });
    await m.registerFilter(new HouseStyleFilter());
    const out = await m.getFilterChain()!.process(
      'the colour of magic',
      { pageName: 'T' },
      'markup'
    );
    expect(out).toBe('the color of magic');
    await m.shutdown();
  });

  test('registration against a disabled pipeline reports false, never throws', async () => {
    const m = await makeManager({ 'ngdpbase.filters.enabled': false });
    expect(await m.registerFilter(new HouseStyleFilter())).toBe(false);
    await m.shutdown();
  });
});
