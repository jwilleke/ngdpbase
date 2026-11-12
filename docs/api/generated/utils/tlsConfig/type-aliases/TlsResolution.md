[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/tlsConfig](../README.md) / TlsResolution

# Type Alias: TlsResolution

> __TlsResolution__ = \{ `mode`: `"http"`; \} \| \{ `cert`: `Buffer`; `expired`: `boolean`; `expiresAt`: `string` \| `null`; `key`: `Buffer`; `mode`: `"https"`; \} \| \{ `mode`: `"blocked"`; `reasons`: `string`[]; \}

Defined in: src/utils/tlsConfig.ts:37

## Union Members

### Type Literal

\{ `mode`: `"http"`; \}

No certificate configured. The ordinary case; not a problem.

***

### Type Literal

\{ `cert`: `Buffer`; `expired`: `boolean`; `expiresAt`: `string` \| `null`; `key`: `Buffer`; `mode`: `"https"`; \}

Usable. `expired` is true when the certificate's own validity has passed.

***

### Type Literal

\{ `mode`: `"blocked"`; `reasons`: `string`[]; \}

Configured and unusable. Takes the #1152 survivable-failure path.
