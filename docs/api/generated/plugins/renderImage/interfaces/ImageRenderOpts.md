[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [plugins/renderImage](../README.md) / ImageRenderOpts

# Interface: ImageRenderOpts

Defined in: src/plugins/renderImage.ts:8

Shared image HTML rendering utility for wiki plugins.

Used by ImagePlugin and AttachPlugin to produce consistent image markup.
Callers are responsible for escaping any user-provided values before passing them in.

## Properties

### align?

> `optional` __align?__: `string` \| `null`

Defined in: src/plugins/renderImage.ts:20

Alignment: left | right | center

***

### alt

> __alt__: `string`

Defined in: src/plugins/renderImage.ts:12

Alt text (pre-escaped if needed)

***

### border?

> `optional` __border?__: `string` \| `number`

Defined in: src/plugins/renderImage.ts:24

Border width in pixels

***

### caption?

> `optional` __caption?__: `string`

Defined in: src/plugins/renderImage.ts:14

Caption text (pre-escaped if needed)

***

### cssClass?

> `optional` __cssClass?__: `string`

Defined in: src/plugins/renderImage.ts:28

CSS class (defaults to 'wiki-image')

***

### display?

> `optional` __display?__: `string`

Defined in: src/plugins/renderImage.ts:22

Display mode: block (default) | float | inline | full

***

### height?

> `optional` __height?__: `string` \| `number`

Defined in: src/plugins/renderImage.ts:18

Height attribute

***

### link?

> `optional` __link?__: `string`

Defined in: src/plugins/renderImage.ts:32

If set, wraps the image in an anchor with this href

***

### linkClass?

> `optional` __linkClass?__: `string`

Defined in: src/plugins/renderImage.ts:36

CSS class for the link anchor

***

### linkTarget?

> `optional` __linkTarget?__: `string`

Defined in: src/plugins/renderImage.ts:34

Target attribute for the link anchor (no default)

***

### style?

> `optional` __style?__: `string`

Defined in: src/plugins/renderImage.ts:26

Custom inline CSS styles

***

### title?

> `optional` __title?__: `string`

Defined in: src/plugins/renderImage.ts:30

Title attribute

***

### url

> __url__: `string`

Defined in: src/plugins/renderImage.ts:10

Resolved image URL (pre-escaped if needed)

***

### width?

> `optional` __width?__: `string` \| `number`

Defined in: src/plugins/renderImage.ts:16

Width attribute
