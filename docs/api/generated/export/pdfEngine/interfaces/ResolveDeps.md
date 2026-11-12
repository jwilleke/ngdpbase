[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [export/pdfEngine](../README.md) / ResolveDeps

# Interface: ResolveDeps

Defined in: src/export/pdfEngine.ts:134

Hooks for tests; a site passes nothing.

## Properties

### exists?

> `optional` __exists?__: (`p`) => `boolean`

Defined in: src/export/pdfEngine.ts:135

#### Parameters

##### p

`string`

#### Returns

`boolean`

***

### platform?

> `optional` __platform?__: `string`

Defined in: src/export/pdfEngine.ts:136

***

### playwrightChromium?

> `optional` __playwrightChromium?__: () => `Promise`\<`string` \| `null`\>

Defined in: src/export/pdfEngine.ts:139

Playwright's own Chromium, or null when it cannot say.

#### Returns

`Promise`\<`string` \| `null`\>

***

### playwrightInstalled?

> `optional` __playwrightInstalled?__: () => `boolean`

Defined in: src/export/pdfEngine.ts:137

#### Returns

`boolean`
