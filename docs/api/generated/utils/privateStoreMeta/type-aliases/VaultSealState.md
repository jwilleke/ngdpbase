[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreMeta](../README.md) / VaultSealState

# Type Alias: VaultSealState

> __VaultSealState__ = `"plain"` \| `"sealed"` \| `"unopened"` \| `"mismatch"`

Defined in: src/utils/privateStoreMeta.ts:61

How a vault stands against its kind (#1834). The vault's `store.json` says
whether this copy is sealed; the kind (the system-category's `encrypt`,
carried in the layout as `sealedVaults`) says whether it must be.

- `plain`: the kind is not sealed and the copy is not either.
- `sealed`: the copy is sealed (`store.json` `encrypt: true`).
- `unopened`: the kind is sealed and there is no `store.json` — the owner
  has not walked through the vault door, so there is no key to seal with.
- `mismatch`: the kind is sealed and `store.json` says the copy is not
  (or cannot be read as sealed).

Only `plain` and `sealed` may be read or written.
