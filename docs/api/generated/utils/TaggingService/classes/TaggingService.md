[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/TaggingService](../README.md) / TaggingService

# Class: TaggingService

Defined in: src/utils/TaggingService.ts:54

## Constructors

### Constructor

> __new TaggingService__(`options?`): `TaggingService`

Defined in: src/utils/TaggingService.ts:60

#### Parameters

##### options?

[`TaggingOptions`](../interfaces/TaggingOptions.md) = `{}`

#### Returns

`TaggingService`

## Accessors

### vocabularySize

#### Get Signature

> __get__ __vocabularySize__(): `number`

Defined in: src/utils/TaggingService.ts:81

Number of vocabulary terms currently loaded.

##### Returns

`number`

## Methods

### setVocabulary()

> __setVocabulary__(`terms`): `void`

Defined in: src/utils/TaggingService.ts:70

Load (or replace) the controlled vocabulary.
Call once after CatalogManager.getTerms() resolves.

#### Parameters

##### terms

[`VocabTerm`](../interfaces/VocabTerm.md)[]

#### Returns

`void`

***

### tag()

> __tag__(`content`, `title?`, `existingTags?`): `string`[]

Defined in: src/utils/TaggingService.ts:89

Return matched taxonomy terms for the given content + title.
Terms already in `existingTags` are never duplicated in the output.

#### Parameters

##### content

`string`

##### title?

`string` = `''`

##### existingTags?

`string`[] = `[]`

#### Returns

`string`[]
