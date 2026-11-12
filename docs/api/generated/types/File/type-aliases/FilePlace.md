[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/File](../README.md) / FilePlace

# Type Alias: FilePlace

> __FilePlace__ = \{ `kind`: `"public"`; \} \| \{ `kind`: `"vault"`; `owner`: `string`; `vault`: `string`; \} \| \{ `folder`: `string`; `kind`: `"shared-folder"`; \}

Defined in: src/types/File.ts:30

Where a file lives: the public area, one user's vault, or one shared
folder. A file is unique by its place plus its name; the same name may
exist in two places.

Each place is named by the identifiers the site already uses: a vault by
its owner's username and its vault id (`pages/vaults/{owner}/{vault}/`), a
shared folder by its name (`/shared/{folder}`, SharedFolderManager). The
shared folders' internal container (`SHARED_FOLDER_OWNER`) is never a
vault owner here: a folder is always `{ kind: 'shared-folder' }` (#2148).
