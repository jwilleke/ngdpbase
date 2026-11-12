[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/buildPageJsonLd](../README.md) / stringifyJsonLdForScript

# Function: stringifyJsonLdForScript()

> __stringifyJsonLdForScript__(`payload`): `string`

Defined in: src/utils/buildPageJsonLd.ts:139

Stringify a JSON-LD object safely for embedding inside a
`<script type="application/ld+json">` element. `JSON.stringify` alone
doesn't escape `<` / `>` / `&`, so attacker-controlled metadata containing
`</script>` would close the tag prematurely. We post-process the output to
replace the three problematic sequences with their `\uXXXX` JSON-escape
forms — valid JSON, safe HTML, no behavior change for any consumer.

Reference: OWASP "JSON in HTML" guidance.

## Parameters

### payload

`unknown`

## Returns

`string`
