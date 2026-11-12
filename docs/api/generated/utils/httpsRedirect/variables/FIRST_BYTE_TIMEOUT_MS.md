[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/httpsRedirect](../README.md) / FIRST\_BYTE\_TIMEOUT\_MS

# Variable: FIRST\_BYTE\_TIMEOUT\_MS

> `const` __FIRST\_BYTE\_TIMEOUT\_MS__: `30000` = `30_000`

Defined in: src/utils/httpsRedirect.ts:197

How long a connection may stay silent before it is dropped.

The multiplexer cannot route a socket until the client says something, so a
connection that opens and sends nothing would otherwise sit in limbo holding
a file descriptor. Slow-loris by accident rather than by malice, but the same
resource either way.
