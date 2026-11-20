/**
 * #2269 — which stored `access:` values still limited who could read or change
 * a page before #2255 stopped reading them, and which are only the stamp
 * install wrote on pages it ships.
 */
import { isInstallAccessStamp, legacyAccessLimits, limitsLeftByUpgrade, normalizeSystemCategory } from '../legacyPageAccess';

describe('isInstallAccessStamp', () => {
  test('is exactly { edit: [admin] }', () => {
    expect(isInstallAccessStamp({ edit: ['admin'] })).toBe(true);
    expect(isInstallAccessStamp({ edit: ['admin', 'editor'] })).toBe(false);
    expect(isInstallAccessStamp({ edit: ['admin'], view: ['admin'] })).toBe(false);
    expect(isInstallAccessStamp({ view: ['admin'] })).toBe(false);
    expect(isInstallAccessStamp(undefined)).toBe(false);
    expect(isInstallAccessStamp(['admin'])).toBe(false);
  });
});

describe('legacyAccessLimits', () => {
  test('names each action a non-empty list limited, in plain words', () => {
    expect(legacyAccessLimits({ view: ['editor'] })).toEqual(['read']);
    expect(legacyAccessLimits({ read: ['editor'] })).toEqual(['read']);
    expect(legacyAccessLimits({ edit: ['alice'] })).toEqual(['change']);
    expect(legacyAccessLimits({ delete: ['admin'], view: ['x'] })).toEqual(['read', 'delete']);
    expect(legacyAccessLimits({ rename: ['a'], create: ['a'], upload: ['a'], export: ['a'] })).toEqual(['create', 'rename', 'upload', 'export']);
    expect(legacyAccessLimits({ publish: ['a'] })).toEqual(['use']);
  });

  test('an empty list, an empty object and a non-object state no rule', () => {
    expect(legacyAccessLimits({ edit: [], view: [] })).toEqual([]);
    expect(legacyAccessLimits({})).toEqual([]);
    expect(legacyAccessLimits('admin')).toEqual([]);
    expect(legacyAccessLimits(null)).toEqual([]);
  });
});

describe('normalizeSystemCategory', () => {
  test('trims and lowercases, and falls back to the default', () => {
    expect(normalizeSystemCategory(' General ', 'x')).toBe('general');
    expect(normalizeSystemCategory(undefined, 'Documentation')).toBe('documentation');
    expect(normalizeSystemCategory('   ', 'general')).toBe('general');
    expect(normalizeSystemCategory(5, undefined)).toBe('general');
  });
});

describe('limitsLeftByUpgrade', () => {
  test('the stamp is exempt on a shipped page outside general', () => {
    expect(limitsLeftByUpgrade({ 'system-category': 'documentation', access: { edit: ['admin'] } }, true)).toBeNull();
    expect(limitsLeftByUpgrade({ 'system-category': ' Documentation ', access: { edit: ['admin'] } }, true)).toBeNull();
  });

  test('the stamp is not exempt on a general page, shipped or not, however the category is written', () => {
    expect(limitsLeftByUpgrade({ 'system-category': 'general', access: { edit: ['admin'] } }, true)).toEqual(['change']);
    expect(limitsLeftByUpgrade({ 'system-category': 'General', access: { edit: ['admin'] } }, false)).toEqual(['change']);
    expect(limitsLeftByUpgrade({ 'system-category': 'general ', access: { edit: ['admin'] } }, true)).toEqual(['change']);
  });

  test('a page with no category is judged by the default category', () => {
    expect(limitsLeftByUpgrade({ access: { edit: ['admin'] } }, true)).toEqual(['change']);
    expect(limitsLeftByUpgrade({ access: { edit: ['admin'] } }, true, 'documentation')).toBeNull();
  });

  test('the stamp is not exempt on a page install did not ship', () => {
    expect(limitsLeftByUpgrade({ 'system-category': 'journal', access: { edit: ['admin'] } }, false)).toEqual(['change']);
  });

  test('any other limit is reported, shipped or not', () => {
    expect(limitsLeftByUpgrade({ 'system-category': 'system', access: { edit: ['admin'], view: ['admin'] } }, true)).toEqual(['read', 'change']);
    expect(limitsLeftByUpgrade({ access: { view: ['editor'] } }, false)).toEqual(['read']);
  });

  test('a page with no access, or no limit in it, reports nothing', () => {
    expect(limitsLeftByUpgrade({ 'system-category': 'general' }, false)).toBeNull();
    expect(limitsLeftByUpgrade({ access: { edit: [] } }, false)).toBeNull();
    expect(limitsLeftByUpgrade(null, false)).toBeNull();
  });
});
