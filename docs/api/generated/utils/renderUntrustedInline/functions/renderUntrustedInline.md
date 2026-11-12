[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/renderUntrustedInline](../README.md) / renderUntrustedInline

# Function: renderUntrustedInline()

> __renderUntrustedInline__(`formatters`, `markdown`, `engine`): `Promise`\<`string`\>

Defined in: src/utils/renderUntrustedInline.ts:75

Render untrusted-author markdown (a comment) to safe HTML.

## Parameters

### formatters

[`PluginFormatters`](../../../managers/PluginManager/type-aliases/PluginFormatters.md)

PluginManager's formatters (#1820); the fallback escapes with their escapeHtml

### markdown

`string`

The author's raw text

### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Engine, for SecurityFilter configuration context

## Returns

`Promise`\<`string`\>

HTML safe to embed; on any failure, escaped text with <br>s
