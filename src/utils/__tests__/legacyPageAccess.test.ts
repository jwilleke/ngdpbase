/**
 * #2269 — which stored `access:` values still limited who could read or change
 * a page before #2255 stopped reading them, and which are only the stamp
 * install wrote on pages it ships.
 */
import { isInstallAccessStamp, legacyAccessLimits, limitsLeftByUpgrade } from '../legacyPageAccess';

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
  test('a view list limited reading, any other action limited changing', () => {
    expect(legacyAccessLimits({ view: ['editor'] })).toEqual({ read: true, change: false });
    expect(legacyAccessLimits({ edit: ['alice'] })).toEqual({ read: false, change: true });
    expect(legacyAccessLimits({ delete: ['admin'], view: ['x'] })).toEqual({ read: true, change: true });
  });

  test('an empty list, an empty object and a non-object state no rule', () => {
    expect(legacyAccessLimits({ edit: [], view: [] })).toEqual({ read: false, change: false });
    expect(legacyAccessLimits({})).toEqual({ read: false, change: false });
    expect(legacyAccessLimits('admin')).toEqual({ read: false, change: false });
    expect(legacyAccessLimits(null)).toEqual({ read: false, change: false });
  });
});

describe('limitsLeftByUpgrade', () => {
  test('the stamp is exempt on a shipped page outside general', () => {
    expect(limitsLeftByUpgrade({ 'system-category': 'documentation', access: { edit: ['admin'] } }, true)).toBeNull();
  });

  test('the stamp is not exempt on a general page, shipped or not', () => {
    expect(limitsLeftByUpgrade({ 'system-category': 'general', access: { edit: ['admin'] } }, true)).toEqual({ read: false, change: true });
    expect(limitsLeftByUpgrade({ 'system-category': 'General', access: { edit: ['admin'] } }, false)).toEqual({ read: false, change: true });
  });

  test('the stamp is not exempt on a page install did not ship', () => {
    expect(limitsLeftByUpgrade({ 'system-category': 'journal', access: { edit: ['admin'] } }, false)).toEqual({ read: false, change: true });
  });

  test('any other limit is reported, shipped or not', () => {
    expect(limitsLeftByUpgrade({ 'system-category': 'system', access: { edit: ['admin'], view: ['admin'] } }, true)).toEqual({ read: true, change: true });
    expect(limitsLeftByUpgrade({ access: { view: ['editor'] } }, false)).toEqual({ read: true, change: false });
  });

  test('a page with no access, or no limit in it, reports nothing', () => {
    expect(limitsLeftByUpgrade({ 'system-category': 'general' }, false)).toBeNull();
    expect(limitsLeftByUpgrade({ access: { edit: [] } }, false)).toBeNull();
    expect(limitsLeftByUpgrade(null, false)).toBeNull();
  });
});
