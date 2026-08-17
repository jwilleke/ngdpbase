[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/parsers/MarkupParser](../README.md) / ExtractedElement

# Interface: ExtractedElement

Defined in: [src/parsers/MarkupParser.ts:167](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L167)

Extracted JSPWiki element

## Properties

### id

> __id__: `number`

Defined in: [src/parsers/MarkupParser.ts:173](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L173)

Unique ID

***

### inner?

> `optional` __inner__: `string`

Defined in: [src/parsers/MarkupParser.ts:179](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L179)

Plugin/tag inner content (for plugins)

***

### literal?

> `optional` __literal__: `string`

Defined in: [src/parsers/MarkupParser.ts:183](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L183)

Escaped literal content (for escaped)

***

### position?

> `optional` __position__: `number`

Defined in: [src/parsers/MarkupParser.ts:175](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L175)

Position in content

***

### syntax

> __syntax__: `string`

Defined in: [src/parsers/MarkupParser.ts:171](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L171)

Original syntax

***

### target?

> `optional` __target__: `string`

Defined in: [src/parsers/MarkupParser.ts:181](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L181)

Link target (for links)

***

### type

> __type__: `"link"` \| `"plugin"` \| `"variable"` \| `"escaped"`

Defined in: [src/parsers/MarkupParser.ts:169](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L169)

Element type

***

### varName?

> `optional` __varName__: `string`

Defined in: [src/parsers/MarkupParser.ts:177](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L177)

Variable name (for variables)
