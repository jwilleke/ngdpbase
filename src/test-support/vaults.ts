/**
 * `ngdpbase.system-category` for a test that needs a particular vault layout
 * (#1504): the default system-category's `privatestore` is what names the
 * vaults' parent folder and a person's ordinary vault.
 */
export function vaultCategories(defaultVault = 'default', root = 'vaults'): Record<string, unknown> {
  return {
    general: {
      label: 'general',
      default: true,
      storageLocation: { defaultstore: 'pages/', privatestore: `pages/${root}/{user}/${defaultVault}/` }
    }
  };
}

/**
 * `ngdpbase.system-category` entries declaring the given vault kinds (#1505):
 * each id becomes a system-category with `privatestore` `pages/vaults/{user}/{id}/`
 * and the given `owner` and `encrypt`. The kind `default` (or the first) is the
 * default system-category.
 */
export function vaultKindCategories(kinds: Record<string, { owner?: string; encrypt?: unknown }>): Record<string, unknown> {
  const ids = Object.keys(kinds);
  const defaultId = ids.includes('default') ? 'default' : ids[0];
  return Object.fromEntries(ids.map((id) => [id === 'default' ? 'general' : id, {
    label: id === 'default' ? 'general' : id,
    ...(id === defaultId ? { default: true } : {}),
    storageLocation: { defaultstore: 'pages/', privatestore: `pages/vaults/{user}/${id}/` },
    ...kinds[id]
  }]));
}
