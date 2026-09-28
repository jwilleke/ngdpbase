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
