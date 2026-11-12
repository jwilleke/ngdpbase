[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sharedFolderAccess](../README.md) / permitsInSharedFolder

# Function: permitsInSharedFolder()

> __permitsInSharedFolder__(`pdp`, `ctx`, `action`, `folder`): `Promise`\<`boolean`\>

Defined in: src/utils/sharedFolderAccess.ts:69

May `ctx` do `action` in shared folder `folder`? The PDP decides
`shared-folder-read` or `shared-folder-file` ([sharedFolderPermissionFor](sharedFolderPermissionFor.md))
with the folder as the resource. A share link is refused without asking. A
permit opens the folder's key to this context ([openedFor](openedFor.md)).

## Parameters

### pdp

[`VaultDecider`](../../privateStoreAccess/interfaces/VaultDecider.md) \| `null` \| `undefined`

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

### action

`string`

### folder

`string`

## Returns

`Promise`\<`boolean`\>
