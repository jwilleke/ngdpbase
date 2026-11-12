[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [http/ssrf](../README.md) / validateUrl

# Function: validateUrl()

> __validateUrl__(`raw`, `policy`): \{ `ok`: `true`; `url`: `URL`; \} \| \{ `ok`: `false`; `reason`: `string`; \}

Defined in: src/http/ssrf.ts:259

The early, friendly check. NOT the boundary — see the file header.

A host that is not a literal address passes here and is judged at connect
time instead, which is the only place a name's resolution can be seen.

## Parameters

### raw

`string`

### policy

[`EgressPolicy`](../interfaces/EgressPolicy.md)

## Returns

\{ `ok`: `true`; `url`: `URL`; \} \| \{ `ok`: `false`; `reason`: `string`; \}
