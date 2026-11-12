[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [security/signedOutWrites](../README.md) / RESERVED\_ADDON\_SLUGS

# Variable: RESERVED\_ADDON\_SLUGS

> `const` __RESERVED\_ADDON\_SLUGS__: `ReadonlySet`\<`string`\>

Defined in: src/security/signedOutWrites.ts:57

Slugs an add-on may not use to list a route, because core already answers
under `/api/<slug>/` or `/addons/<slug>/`: an add-on in a directory named
`admin` must not open `/api/admin/...`. Kept in step with core's route
files; `signedOutWriteGate.test.ts` checks it against the route inventory.
