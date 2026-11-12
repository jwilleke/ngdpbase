[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [security/tokenRouteMap](../README.md) / TOKEN\_ROUTE\_MAP

# Variable: TOKEN\_ROUTE\_MAP

> `const` __TOKEN\_ROUTE\_MAP__: readonly [`TokenRoute`](../interfaces/TokenRoute.md)[]

Defined in: src/security/tokenRouteMap.ts:71

The reachable surface, deliberately minimal.

`POST /api/page/ingest` is the one documented agent surface
(docs/Agent-Ingest-API.md); the reads around it are what makes an ingesting
agent able to see what it is editing. Everything else in the ~57-route API
— every `/api/admin/*`, `/api/tokens`, `/api/sessions/*`, comments,
footnotes, user preferences — is absent on purpose and therefore refused.

Absence here is not a judgement that a route is dangerous. It is the default,
and adding one is cheap: name it, say why, and write the test.
