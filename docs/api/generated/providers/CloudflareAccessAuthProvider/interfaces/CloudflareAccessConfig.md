[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/CloudflareAccessAuthProvider](../README.md) / CloudflareAccessConfig

# Interface: CloudflareAccessConfig

Defined in: src/providers/CloudflareAccessAuthProvider.ts:53

## Properties

### applicationAud

> __applicationAud__: `string`

Defined in: src/providers/CloudflareAccessAuthProvider.ts:57

Application AUD tag (one per CF Access Application).

***

### defaultRole

> __defaultRole__: `string`

Defined in: src/providers/CloudflareAccessAuthProvider.ts:59

Role assigned to JIT-provisioned users when no CF group maps.

***

### groupMap

> __groupMap__: `Record`\<`string`, `string`\>

Defined in: src/providers/CloudflareAccessAuthProvider.ts:64

Map of CF group name → ngdpbase role name. CF groups absent from this
map are silently ignored at provisioning time (user still gets defaultRole).

***

### teamDomain

> __teamDomain__: `string`

Defined in: src/providers/CloudflareAccessAuthProvider.ts:55

Cloudflare team domain, e.g. `mjwilleke.cloudflareaccess.com`.
