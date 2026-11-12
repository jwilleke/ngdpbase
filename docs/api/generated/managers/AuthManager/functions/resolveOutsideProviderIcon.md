[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / resolveOutsideProviderIcon

# Function: resolveOutsideProviderIcon()

> __resolveOutsideProviderIcon__(`name`, `icon`, `preset`, `warn`): [`OutsideProviderIcon`](../../../providers/OidcAuthProvider/type-aliases/OutsideProviderIcon.md)

Defined in: src/managers/AuthManager.ts:546

Resolve an entry's `icon` (#1781). Accepted: an `https://` address, a site
path (starts with one `/`, no `\`), or a Font Awesome name, normalised to
its full class (`fa-users` → `fas fa-users`). Anything else — `http:`,
`javascript:`, `data:`, a relative path — is refused with a warning naming
the entry, and the default shown. Unset: the preset's icon, else generic.

## Parameters

### name

`string`

### icon

`unknown`

### preset

`string` \| `undefined`

### warn

(`message`) => `void`

## Returns

[`OutsideProviderIcon`](../../../providers/OidcAuthProvider/type-aliases/OutsideProviderIcon.md)
