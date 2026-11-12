[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/FileSystemProvider](../README.md) / BackupData

# Interface: BackupData

Defined in: src/providers/FileSystemProvider.ts:75

Backup data structure

## Properties

### encoding

> __encoding__: `string`

Defined in: src/providers/FileSystemProvider.ts:79

***

### pages

> __pages__: `object`[]

Defined in: src/providers/FileSystemProvider.ts:80

#### content

> __content__: `string`

#### relativePath

> __relativePath__: `string`

#### size

> __size__: `number`

***

### privateFiles?

> `optional` __privateFiles?__: `object`[]

Defined in: src/providers/FileSystemProvider.ts:104

Private stores, as bytes (#1387).

A private store is NEVER walked with the pages above: its files are
ciphertext when the store is sealed, and `pages` holds decoded text, which
would replace every byte that is not valid UTF-8 with U+FFFD and leave a
file that still looks like a file and never decrypts again. These are
base64 so they survive the JSON document exactly as they sit on disk —
ciphertext stays ciphertext, and restoring needs no key, so a backup runs
as a job and an administrator never becomes a keyholder.

`relativePath` is relative to the pages directory and therefore begins
with the private root, e.g. `private/molly/vault/uuid-1.md`.

#### base64

> __base64__: `string`

The file's bytes, base64.

#### mtime

> __mtime__: `string`

#### relativePath

> __relativePath__: `string`

#### size

> __size__: `number`

***

### privateOmitted?

> `optional` __privateOmitted?__: `object`

Defined in: src/providers/FileSystemProvider.ts:116

Set when the private tree was too large to carry and was left out. A
backup that silently omitted it is the failure this whole field exists to
end, so its absence is always stated rather than implied.

#### bytes

> __bytes__: `number`

#### files

> __files__: `number`

#### reason

> __reason__: `string`

***

### providerName

> __providerName__: `string`

Defined in: src/providers/FileSystemProvider.ts:76

***

### requiredPages

> __requiredPages__: `object`[]

Defined in: src/providers/FileSystemProvider.ts:85

#### content

> __content__: `string`

#### relativePath

> __relativePath__: `string`

#### size

> __size__: `number`

***

### statistics

> __statistics__: `object`

Defined in: src/providers/FileSystemProvider.ts:121

#### totalPages

> __totalPages__: `number`

#### totalSize

> __totalSize__: `number`

#### vanished?

> `optional` __vanished?__: `number`

Files and folders deleted while the backup read them (#1563): skipped, not missing.

***

### timestamp

> __timestamp__: `string`

Defined in: src/providers/FileSystemProvider.ts:78

***

### version

> __version__: `string`

Defined in: src/providers/FileSystemProvider.ts:77
