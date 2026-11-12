[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/ValidationManager](../README.md) / CategoryStored

# Type Alias: CategoryStored

> __CategoryStored__ = `"none"` \| `"public"` \| `"vault"` \| `"shared-folder"`

Defined in: src/managers/ValidationManager.ts:69

Where a system-category's pages are stored on the site (#1503,
docs/system-category.md "Where a page's master copy lives"):

- `none`: the entry has no `storageLocation`; its pages are never stored on
  the site (they live in the repository's docs/), so saving one is refused
  and none is seeded.
- `public`: a `storageLocation` without a vault; its pages can never be
  private.
- `vault`: a `storageLocation.privatestore`; its pages may be private.
- `shared-folder`: `storageLocation.sharedfolder: true` (#2255); its pages
  live in shared folders (the `shared` category).
