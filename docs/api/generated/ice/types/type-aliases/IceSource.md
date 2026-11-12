[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / IceSource

# Type Alias: IceSource

> __IceSource__ = \{ `files`: [`IceUpload`](../interfaces/IceUpload.md)[]; `type`: `"upload"`; \} \| [`IceUrlSource`](../interfaces/IceUrlSource.md)

Defined in: src/ice/types.ts:517

A source (D1): uploaded files, or a URL fetched when the run starts
(#2109). A server folder joins this union later.
