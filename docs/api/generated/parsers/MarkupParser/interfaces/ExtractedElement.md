[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [parsers/MarkupParser](../README.md) / ExtractedElement

# Interface: ExtractedElement

Defined in: src/parsers/MarkupParser.ts:151

Extracted JSPWiki element

## Properties

### accumulatedClasses?

> `optional` __accumulatedClasses?__: `string`[]

Defined in: src/parsers/MarkupParser.ts:173

Accumulated CSS classes from parent style blocks (for nested styles)

***

### className?

> `optional` __className?__: `string`

Defined in: src/parsers/MarkupParser.ts:169

CSS class name (for style blocks)

***

### classNames?

> `optional` __classNames?__: `string`

Defined in: src/parsers/MarkupParser.ts:187

# 938: space-separated class list for inline-style variant 'class'

***

### codeContent?

> `optional` __codeContent?__: `string`

Defined in: src/parsers/MarkupParser.ts:179

Raw text content for inline code spans (`...`) and fenced code blocks (```...```)

***

### codeLanguage?

> `optional` __codeLanguage?__: `string`

Defined in: src/parsers/MarkupParser.ts:181

Language tag from fenced code blocks (e.g. 'javascript' from ```javascript)

***

### cssRaw?

> `optional` __cssRaw?__: `string`

Defined in: src/parsers/MarkupParser.ts:185

# 907: raw CSS declarations for inline-style variant 'css' (parenthesis body)

***

### footnoteId?

> `optional` __footnoteId?__: `string`

Defined in: src/parsers/MarkupParser.ts:175

Footnote identifier — the id portion of [^id] or [^id]: text

***

### footnoteText?

> `optional` __footnoteText?__: `string`

Defined in: src/parsers/MarkupParser.ts:177

Footnote definition text — the content after [^id]:

***

### id

> __id__: `number`

Defined in: src/parsers/MarkupParser.ts:157

Unique ID

***

### inlineVariant?

> `optional` __inlineVariant?__: `"strike"` \| `"sub"` \| `"sup"` \| `"class"` \| `"css"`

Defined in: src/parsers/MarkupParser.ts:183

# 907: inline-style variant — css | sup | sub | strike | class (#938)

***

### inner?

> `optional` __inner?__: `string`

Defined in: src/parsers/MarkupParser.ts:163

Plugin/tag inner content (for plugins)

***

### literal?

> `optional` __literal?__: `string`

Defined in: src/parsers/MarkupParser.ts:167

Escaped literal content (for escaped)

***

### position?

> `optional` __position?__: `number`

Defined in: src/parsers/MarkupParser.ts:159

Position in content

***

### styleContent?

> `optional` __styleContent?__: `string`

Defined in: src/parsers/MarkupParser.ts:171

Style block content (for style blocks)

***

### syntax

> __syntax__: `string`

Defined in: src/parsers/MarkupParser.ts:155

Original syntax

***

### target?

> `optional` __target?__: `string`

Defined in: src/parsers/MarkupParser.ts:165

Link target (for links)

***

### type

> __type__: `"link"` \| `"code"` \| `"style"` \| `"plugin"` \| `"variable"` \| `"escaped"` \| `"inline-style"` \| `"footnote-ref"` \| `"footnote-def"` \| `"fenced-code"`

Defined in: src/parsers/MarkupParser.ts:153

Element type

***

### varName?

> `optional` __varName?__: `string`

Defined in: src/parsers/MarkupParser.ts:161

Variable name (for variables)
