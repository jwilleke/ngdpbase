[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/standardize-categories](../README.md) / CategoryStandardizer

# Class: CategoryStandardizer

Defined in: src/utils/standardize-categories.ts:113

Standardize categories across all pages

## Constructors

### Constructor

> __new CategoryStandardizer__(): `CategoryStandardizer`

Defined in: src/utils/standardize-categories.ts:119

#### Returns

`CategoryStandardizer`

## Methods

### getErrors()

> __getErrors__(): `ErrorRecord`[]

Defined in: src/utils/standardize-categories.ts:129

Get the list of errors encountered during processing

#### Returns

`ErrorRecord`[]

***

### standardizeCategories()

> __standardizeCategories__(`dryRun?`): `Promise`\<`void`\>

Defined in: src/utils/standardize-categories.ts:136

Analyze and fix categories

#### Parameters

##### dryRun?

`boolean` = `true`

#### Returns

`Promise`\<`void`\>
