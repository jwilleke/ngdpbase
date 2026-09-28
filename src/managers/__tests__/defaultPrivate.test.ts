/**
 * #1504 part 3 — a system-category's defaultPrivate sets how a new page's
 * Private box starts: true, false, or choice (each person's preference,
 * private until they set it). The page's own box always wins after that.
 */
import ValidationManager from '../ValidationManager';

function managerWith(categories: Record<string, unknown>): ValidationManager {
  const configManager = { getProperty: (key: string, def: unknown) => (key === 'ngdpbase.system-category' ? categories : def) };
  const vm = new ValidationManager({ getManager: () => configManager });
  vm.loadSystemCategories(configManager);
  return vm;
}

const vm = managerWith({
  general: { label: 'general', default: true, defaultPrivate: false },
  vaulted: { label: 'vaulted', defaultPrivate: true },
  journal: { label: 'journal', defaultPrivate: 'choice' },
  plain: { label: 'plain' }
});

describe('ValidationManager.getDefaultPrivate (#1504)', () => {
  test('true and false are fixed, whatever the person prefers', () => {
    expect(vm.getDefaultPrivate('general', { 'general.defaultPrivate': true })).toBe(false);
    expect(vm.getDefaultPrivate('vaulted', { 'vaulted.defaultPrivate': false })).toBe(true);
  });

  test('choice follows the person\'s <system-category>.defaultPrivate preference', () => {
    expect(vm.getDefaultPrivate('journal', { 'journal.defaultPrivate': false })).toBe(false);
    expect(vm.getDefaultPrivate('journal', { 'journal.defaultPrivate': true })).toBe(true);
  });

  test('choice starts private until the person has chosen', () => {
    expect(vm.getDefaultPrivate('journal', {})).toBe(true);
    expect(vm.getDefaultPrivate('journal', undefined)).toBe(true);
  });

  test('no defaultPrivate, or an unknown system-category, starts public', () => {
    expect(vm.getDefaultPrivate('plain', {})).toBe(false);
    expect(vm.getDefaultPrivate('nope', {})).toBe(false);
  });
});

describe('ValidationManager.canBePrivate (#1504)', () => {
  const withVaults = managerWith({
    general: { label: 'general', default: true, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/default/' } },
    system: { label: 'system', storageLocation: { defaultstore: 'pages/' } }
  });

  test('only a system-category with a vault can hold private pages', () => {
    expect(withVaults.canBePrivate('general')).toBe(true);
    expect(withVaults.canBePrivate('system')).toBe(false);
    expect(withVaults.canBePrivate('nope')).toBe(false);
  });
});

describe('ValidationManager.offersDefaultPrivatePreference (#1504)', () => {
  test('only a choice system-category offers the preference', () => {
    expect(vm.offersDefaultPrivatePreference('journal')).toBe(true);
    expect(vm.offersDefaultPrivatePreference('general')).toBe(false);
    expect(vm.offersDefaultPrivatePreference('vaulted')).toBe(false);
    expect(vm.offersDefaultPrivatePreference('nope')).toBe(false);
  });
});
