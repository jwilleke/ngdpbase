[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/parsers/LinkParser](../README.md) / Link

# Class: Link

Defined in: [src/parsers/LinkParser.ts:720](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L720)

Link class representing a parsed link

## Constructors

### Constructor

> __new Link__(`data`): `Link`

Defined in: [src/parsers/LinkParser.ts:746](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L746)

Create a new Link instance

#### Parameters

##### data

[`LinkData`](../interfaces/LinkData.md) = `{}`

Link data

#### Returns

`Link`

## Properties

### attributes

> __attributes__: [`LinkAttributes`](../interfaces/LinkAttributes.md)

Defined in: [src/parsers/LinkParser.ts:734](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L734)

Parsed attributes object

***

### attributesString

> __attributesString__: `string` \| `null`

Defined in: [src/parsers/LinkParser.ts:731](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L731)

Raw attributes string

***

### endIndex

> __endIndex__: `number`

Defined in: [src/parsers/LinkParser.ts:740](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L740)

End index in content

***

### originalText

> __originalText__: `string`

Defined in: [src/parsers/LinkParser.ts:722](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L722)

Original text from content

***

### startIndex

> __startIndex__: `number`

Defined in: [src/parsers/LinkParser.ts:737](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L737)

Start index in content

***

### target

> __target__: `string` \| `null`

Defined in: [src/parsers/LinkParser.ts:728](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L728)

Target page or URL

***

### text

> __text__: `string`

Defined in: [src/parsers/LinkParser.ts:725](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L725)

Display text for the link

## Methods

### getAttribute()

> __getAttribute__(`name`): `string` \| `undefined`

Defined in: [src/parsers/LinkParser.ts:785](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L785)

Get attribute value by name

#### Parameters

##### name

`string`

Attribute name

#### Returns

`string` \| `undefined`

Attribute value

***

### getEffectiveTarget()

> __getEffectiveTarget__(): `string`

Defined in: [src/parsers/LinkParser.ts:768](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L768)

Get the effective target (target or text if no target)

#### Returns

`string`

Effective target

***

### hasAttributes()

> __hasAttributes__(): `boolean`

Defined in: [src/parsers/LinkParser.ts:776](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L776)

Check if link has attributes

#### Returns

`boolean`

True if has attributes

***

### isSimple()

> __isSimple__(): `boolean`

Defined in: [src/parsers/LinkParser.ts:760](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L760)

Check if this is a simple link (no target specified)

#### Returns

`boolean`

True if simple link

***

### setAttribute()

> __setAttribute__(`name`, `value`): `void`

Defined in: [src/parsers/LinkParser.ts:794](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L794)

Set attribute value

#### Parameters

##### name

`string`

Attribute name

##### value

`string`

Attribute value

#### Returns

`void`

***

### toObject()

> __toObject__(): [`LinkInfo`](../interfaces/LinkInfo.md)

Defined in: [src/parsers/LinkParser.ts:804](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L804)

Get link information as object

#### Returns

[`LinkInfo`](../interfaces/LinkInfo.md)

Link information
