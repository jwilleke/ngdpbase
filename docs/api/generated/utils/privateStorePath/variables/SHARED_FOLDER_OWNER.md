[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStorePath](../README.md) / SHARED\_FOLDER\_OWNER

# Variable: SHARED\_FOLDER\_OWNER

> `const` __SHARED\_FOLDER\_OWNER__: `"shared-folders"` = `'shared-folders'`

Defined in: src/utils/privateStorePath.ts:292

The organization's shared folders (#1775, #2125) are kept as one more
container under the vaults' parent folder, owned by this reserved name
rather than a user: `pages/vaults/shared-folders/{folder}/`, laid out as a
vault is. So the page and file doors, the per-folder page, file and search
indexes, history, trash, backup and every scanner that keeps vault content
out of the shared indexes treat a folder exactly as they treat a vault.
What differs is who may act (a permission, `shared-folder-read` /
`shared-folder-file` on `shared/{folder}`, never the owner rule:
`utils/sharedFolderAccess.ts`), where the key comes from (the server, by
SharedFolderManager), and the name: `shared/{folder}/{title}`, which is
also its URL. No account can be called this (`RESERVED_USERNAMES`).
