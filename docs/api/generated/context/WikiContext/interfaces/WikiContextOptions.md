[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [context/WikiContext](../README.md) / WikiContextOptions

# Interface: WikiContextOptions

Defined in: src/context/WikiContext.ts:143

Options for WikiContext constructor

## Properties

### activeTheme?

> `optional` __activeTheme?__: `string`

Defined in: src/context/WikiContext.ts:157

Active theme folder name (e.g. 'default', 'flatly')

***

### content?

> `optional` __content?__: `string`

Defined in: src/context/WikiContext.ts:149

Page content (markdown)

***

### context?

> `optional` __context?__: `string`

Defined in: src/context/WikiContext.ts:145

Context type (VIEW, EDIT, PREVIEW, etc.)

***

### pageMetadata?

> `optional` __pageMetadata?__: [`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md)

Defined in: src/context/WikiContext.ts:161

Page front matter metadata — must be set before ACL checks

***

### pageName?

> `optional` __pageName?__: `string`

Defined in: src/context/WikiContext.ts:147

Name of the page

***

### request?

> `optional` __request?__: `Request`\<`ParamsDictionary`, `any`, `any`, `ParsedQs`, `Record`\<`string`, `any`\>\>

Defined in: src/context/WikiContext.ts:153

Express request object

***

### response?

> `optional` __response?__: `Response`\<`any`, `Record`\<`string`, `any`\>\>

Defined in: src/context/WikiContext.ts:155

Express response object

***

### themeInfo?

> `optional` __themeInfo?__: [`ThemeInfo`](../../../managers/ThemeManager/interfaces/ThemeInfo.md) \| `null`

Defined in: src/context/WikiContext.ts:159

Metadata from theme.json

***

### userContext

> __userContext__: [`UserContext`](UserContext.md)

Defined in: src/context/WikiContext.ts:151

The caller's subject. Required (#1399) — see the constructor.
