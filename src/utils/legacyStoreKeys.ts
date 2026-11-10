/**
 * Leftover `ngdpbase.stores.<kind>.owner` and `.encrypt` keys (#2246).
 *
 * Until #1505 these two keys decided whether a vault kind was sealed and who
 * owned it. A vault kind is now a system-category entry that declares a
 * `privatestore`, and its `encrypt` and `owner` are the entry's. Nothing reads
 * the old keys, so a site that still carries them (an upgrade from v4) is
 * silently ignored: `stores.default.encrypt: true` looks as if default vaults
 * are sealed when they are not. This finds them so the boot can say so.
 *
 * Pure: the keys are only named. Nothing is carried over, changed or removed.
 */
import { systemCategoryVaults } from './privateStorePath.js';

const LEGACY_STORE_KEY = /^ngdpbase\.stores\.([a-z0-9]+(?:-[a-z0-9]+)*)\.(owner|encrypt)$/;

/** One leftover key and what to tell the operator about it. */
export interface LegacyStoreKey {
  key: string;
  kind: string;
  setting: 'owner' | 'encrypt';
  /** One sentence: the key, that it has no effect, and what replaces it. */
  message: string;
}

/**
 * Every legacy per-kind key in the operator's custom config, in file order.
 * `categories` is the merged `ngdpbase.system-category` map, used to name the
 * entry that declares the kind's vault (the `default` vault is `general`'s).
 */
export function legacyStoreKeys(customConfig: Record<string, unknown> | null | undefined, categories: unknown): LegacyStoreKey[] {
  if (!customConfig) return [];
  const vaults = systemCategoryVaults(categories);
  const found: LegacyStoreKey[] = [];
  for (const key of Object.keys(customConfig)) {
    const m = LEGACY_STORE_KEY.exec(key);
    if (!m) continue;
    const kind = m[1];
    const setting = m[2] as 'owner' | 'encrypt';
    const entry = vaults.find((v) => v.vaultId === kind);
    const prefix = `'${key}' in custom config is no longer read and has no effect`;
    let message: string;
    if (!entry) {
      message = `${prefix}: no system-category declares a '${kind}' vault. Remove it (docs/system-category.md)`;
    } else if (setting === 'encrypt') {
      message = `${prefix}. Whether the '${kind}' vault is sealed is 'ngdpbase.system-category.${entry.key}.encrypt', now ${entry.encrypt ? 'true' : 'false'}. Set that if you want it changed, then remove this key (docs/system-category.md)`;
    } else {
      message = `${prefix}. The '${kind}' vault's owner is the 'owner' of 'ngdpbase.system-category.${entry.key}' ('admin' when it has none). Remove this key (docs/system-category.md)`;
    }
    found.push({ key, kind, setting, message });
  }
  return found;
}

/** The needs-attention reason for a non-empty list: every key, in one sentence. */
export function legacyStoreKeysReason(found: LegacyStoreKey[]): string {
  // #2354: plain words for the dashboard; each key and its replacement are in the start-up log.
  return `Your settings still include ${found.length === 1 ? 'an old vault setting' : `${found.length} old vault settings`} that ${found.length === 1 ? 'is' : 'are'} ignored. Whether a vault is encrypted, and who owns it, is now set on the vault's page category. Remove ${found.length === 1 ? 'the old one' : 'the old ones'} from your settings.`;
}
