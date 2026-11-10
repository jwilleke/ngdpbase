import { describe, it, expect } from 'vitest';
import { legacyStoreKeys, legacyStoreKeysReason } from '../legacyStoreKeys.js';

/** #2246: the shipped shape — `general` declares the `default` vault, `capture` its own, `system` none. */
const categories = {
  general: { label: 'general', encrypt: false, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/default/' } },
  capture: { label: 'capture', encrypt: true, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/capture/' } },
  system: { label: 'system', storageLocation: { defaultstore: 'pages/' } }
};

describe('legacyStoreKeys (#2246)', () => {
  it('finds nothing when the custom config has no legacy keys', () => {
    expect(legacyStoreKeys({ 'ngdpbase.application-name': 'x', 'ngdpbase.stores.import.maxsize': 1 }, categories)).toEqual([]);
    expect(legacyStoreKeys(null, categories)).toEqual([]);
    expect(legacyStoreKeys({}, categories)).toEqual([]);
  });

  it('does not treat the two settings that remain under ngdpbase.stores as legacy', () => {
    expect(legacyStoreKeys({ 'ngdpbase.stores.recovery.confirmretries': 2, 'ngdpbase.stores.import.maxsize': 5 }, categories)).toEqual([]);
  });

  it('names an encrypt key and the system-category key that replaces it, with its current value', () => {
    const [f] = legacyStoreKeys({ 'ngdpbase.stores.default.encrypt': true }, categories);
    expect(f).toMatchObject({ key: 'ngdpbase.stores.default.encrypt', kind: 'default', setting: 'encrypt' });
    expect(f?.message).toContain("'ngdpbase.stores.default.encrypt'");
    expect(f?.message).toContain('no effect');
    expect(f?.message).toContain("'ngdpbase.system-category.general.encrypt', now false");
  });

  it('says what an owner key is replaced by', () => {
    const [f] = legacyStoreKeys({ 'ngdpbase.stores.capture.owner': 'admin' }, categories);
    expect(f).toMatchObject({ kind: 'capture', setting: 'owner' });
    expect(f?.message).toContain("'owner' of 'ngdpbase.system-category.capture'");
    expect(f?.message).toContain('no effect');
  });

  it('reports every key, one per kind and setting, in file order', () => {
    const found = legacyStoreKeys({
      'ngdpbase.stores.vault.owner': 'admin',
      'ngdpbase.stores.vault.encrypt': true,
      'ngdpbase.stores.default.owner': 'admin',
      'ngdpbase.stores.capture.encrypt': true
    }, categories);
    expect(found.map((f) => f.key)).toEqual([
      'ngdpbase.stores.vault.owner',
      'ngdpbase.stores.vault.encrypt',
      'ngdpbase.stores.default.owner',
      'ngdpbase.stores.capture.encrypt'
    ]);
  });

  it('says so when no system-category declares the kind (the v4 "vault" kind)', () => {
    const [f] = legacyStoreKeys({ 'ngdpbase.stores.vault.encrypt': true }, categories);
    expect(f?.message).toContain("no system-category declares a 'vault' vault");
    expect(f?.message).not.toContain('ngdpbase.system-category.vault');
  });

  it('builds one reason that lists every key', () => {
    const found = legacyStoreKeys({ 'ngdpbase.stores.default.owner': 'admin', 'ngdpbase.stores.default.encrypt': true }, categories);
    const reason = legacyStoreKeysReason(found);
    // #2354: plain words; the keys are named in the start-up warnings.
    expect(reason).toContain('2 old vault settings');
    expect(reason).not.toContain('ngdpbase.');
  });
});
