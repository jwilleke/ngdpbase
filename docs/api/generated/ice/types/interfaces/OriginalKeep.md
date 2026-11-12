[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / OriginalKeep

# Interface: OriginalKeep

Defined in: src/ice/types.ts:268

What a keep at upload carries to the upload door (#2061): the engine opens
one for one receiver, one user and one call of its `keepOriginal`, and
closes it when the call returns. Pass it on unchanged as the upload's
`keep` option. The door honours only one the engine has open, and only
for a file going into this user's own vault of a system-category the
receiver's add-on declares: there it allows `types` beyond the site's
attachment allow-list, and the file is always served as a download.
Anywhere else it changes nothing.

## Properties

### addon

> `readonly` __addon__: `string`

Defined in: src/ice/types.ts:272

The add-on that registered it: only a vault its own system-category declares.

***

### receiver

> `readonly` __receiver__: `string`

Defined in: src/ice/types.ts:270

The receiver keeping, `<slug>.<name>`.

***

### types

> `readonly` __types__: readonly `string`[]

Defined in: src/ice/types.ts:276

The receiver's `originals.types`.

***

### user

> `readonly` __user__: `string`

Defined in: src/ice/types.ts:274

The user the upload is for: only their own vault.
