[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonsPathResolver](../README.md) / resolveAddonSlug

# Function: resolveAddonSlug()

> __resolveAddonSlug__(`addonDir`): `string`

Defined in: src/utils/addonsPathResolver.ts:71

Canonical identity for an addon directory (#927), resolved the SAME
import-free way in every layer (discovery, `isEnabled`, the boot-time
validator):

  canonicalId = package.json `ngdpbase.slug`  ??  the folder name verbatim

Reads `package.json` statically — never imports the module. The module's
exported `name` is a display label validated against this at load time,
not a source of identity.

## Parameters

### addonDir

`string`

## Returns

`string`
