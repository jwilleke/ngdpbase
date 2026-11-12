[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [WikiRoutes](../README.md) / SHARE\_ASSETS\_PATH

# Variable: SHARE\_ASSETS\_PATH

> `const` __SHARE\_ASSETS\_PATH__: `"/share/_assets"` = `'/share/_assets'`

Defined in: src/routes/WikiRoutes.ts:721

Where the files a share view loads are served (#2117): under `/share/`, so a
tunnel or proxy that exposes only `/share/…` carries them, and on a segment
no token can be (tokens are 64 hex characters).
