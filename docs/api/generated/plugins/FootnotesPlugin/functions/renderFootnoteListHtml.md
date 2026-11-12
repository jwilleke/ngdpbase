[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [plugins/FootnotesPlugin](../README.md) / renderFootnoteListHtml

# Function: renderFootnoteListHtml()

> __renderFootnoteListHtml__(`f`, `footnoteManager`, `page`, `userContext`, `engine?`): `Promise`\<`string`\>

Defined in: src/plugins/FootnotesPlugin.ts:161

Render the inner footnote-list HTML for a page given its name and UUID and
the caller's identity. Shared between the plugin output and the
`GET /api/footnotes/:uuid/html` endpoint added in #590. The name says where
the footnotes are: a vault page's are in its vault (#1839). Whether the
caller may read the page is decided before this is called.

Returns either an `<ol class="footnote-list">…</ol>` or a "no footnotes"
paragraph — never wraps in the outer `<section>` or container.

## Parameters

### f

[`PluginFormatters`](../../../managers/PluginManager/type-aliases/PluginFormatters.md)

### footnoteManager

[`default`](../../../managers/FootnoteManager/classes/default.md)

### page

[`PageRef`](../../../utils/pageNotes/interfaces/PageRef.md)

### userContext

\{ `isAuthenticated?`: `boolean`; `roles?`: `string`[]; `username?`: `string`; \} \| `undefined`

### engine?

\{ `getManager`: (`name`) => `unknown`; \} \| `null`

## Returns

`Promise`\<`string`\>
