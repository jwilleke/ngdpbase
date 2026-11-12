[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/fileHandling](../README.md) / MEDIA\_TYPE\_BY\_EXTENSION

# Variable: MEDIA\_TYPE\_BY\_EXTENSION

> `const` __MEDIA\_TYPE\_BY\_EXTENSION__: `Readonly`\<`Record`\<`string`, `string`\>\>

Defined in: src/ice/fileHandling.ts:19

A file's media type by its extension (#2061): how the engine labels a file
it unpacks from a zip, and how the folder import labels a file it reads.
A typed table, not configuration: it states what each format is, which is
not a site's choice. What a site decides is which types it takes, and that
is already its attachment allow-list (and a receiver's `originals.types`).
