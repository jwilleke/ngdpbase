[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreAccess](../README.md) / permitsInVault

# Function: permitsInVault()

> __permitsInVault__(`pdp`, `ctx`, `action`, `where`): `Promise`\<`boolean`\>

Defined in: src/utils/privateStoreAccess.ts:107

May `ctx` do `action` inside `owner`'s vault `vault` (#1539)? The container
rule first — the owner, or a share link of theirs for this vault; never a
role — then the capability asked with the vault, so a policy on the `vault`
resource type (`vault-owner`) decides. `resource` names what is acted on (a
vault page's name, or a file in the vault); it never matches `page: *`, so a
site-wide role does not reach in. The one rule for vault pages
(`BaseContext.hasPermissionOn`) and vault files (`AttachmentManager`).

A shared folder (#2125) is asked by permission instead:
`shared-folder-read` or `shared-folder-file` on the folder
(`permitsInSharedFolder`), never the vault policy.

## Parameters

### pdp

[`VaultDecider`](../interfaces/VaultDecider.md) \| `null` \| `undefined`

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

### action

`string`

### where

#### owner

`string`

#### resource

`string`

#### vault

`string`

## Returns

`Promise`\<`boolean`\>
