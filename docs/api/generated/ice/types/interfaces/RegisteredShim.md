[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / RegisteredShim

# Interface: RegisteredShim

Defined in: src/ice/types.ts:231

A shim the engine holds: its full id, and who registered it.

## Extends

- [`IceShim`](IceShim.md)

## Properties

### accepts

> __accepts__: [`ShimAccepts`](ShimAccepts.md)

Defined in: src/ice/types.ts:170

#### Inherited from

[`IceShim`](IceShim.md).[`accepts`](IceShim.md#accepts)

***

### direction

> __direction__: [`ShimDirection`](../type-aliases/ShimDirection.md)

Defined in: src/ice/types.ts:169

#### Inherited from

[`IceShim`](IceShim.md).[`direction`](IceShim.md#direction)

***

### duplicates?

> `optional` __duplicates?__: `"file"` \| `"item"`

Defined in: src/ice/types.ts:182

Two duplicate kinds (design rule): a whole file by fingerprint, or each item by `itemKey`. Default `file`.

#### Inherited from

[`IceShim`](IceShim.md).[`duplicates`](IceShim.md#duplicates)

***

### id

> __id__: `string`

Defined in: src/ice/types.ts:232

***

### label?

> `optional` __label?__: `string`

Defined in: src/ice/types.ts:168

Shown to people choosing a format.

#### Inherited from

[`IceShim`](IceShim.md).[`label`](IceShim.md#label)

***

### name

> __name__: `string`

Defined in: src/ice/types.ts:166

#### Inherited from

[`IceShim`](IceShim.md).[`name`](IceShim.md#name)

***

### owner

> __owner__: `string`

Defined in: src/ice/types.ts:233

***

### produces

> __produces__: `string`

Defined in: src/ice/types.ts:172

The kind its output items have.

#### Inherited from

[`IceShim`](IceShim.md).[`produces`](IceShim.md#produces)

***

### receivers

> __receivers__: `string`[]

Defined in: src/ice/types.ts:180

Receivers it may hand to directly (ids, `core.pages` or `<slug>.<name>`).
Empty for a shim whose output only feeds another shim. [ANY\_RECEIVER](../variables/ANY_RECEIVER.md)
(`'*'`): any receiver that takes the kind it produces — a generic format
shim such as core's CSV, whose `record` items any add-on's receiver may
take (#2109). Each receiver still decides with its own permission (D5).

#### Inherited from

[`IceShim`](IceShim.md).[`receivers`](IceShim.md#receivers)

## Methods

### clean()?

> `optional` __clean__(`input`): `Promise`\<[`IceCleanResult`](IceCleanResult.md)\>

Defined in: src/ice/types.ts:205

Vetting (#2149): clean this format's own kind of risky content out of a
file that is about to be kept as a file (scripts and handlers in an SVG,
HTML and formulas in CSV cells). Returns the cleaned bytes, and one note
per kind of thing removed, saying what and how many, never the content.
An inbound shim has `read()`, `clean()` or both; one with only `clean()`
is never picked for a run.

#### Parameters

##### input

[`IceItem`](IceItem.md)

#### Returns

`Promise`\<[`IceCleanResult`](IceCleanResult.md)\>

#### Inherited from

[`IceShim`](IceShim.md).[`clean`](IceShim.md#clean)

***

### isAvailable()?

> `optional` __isAvailable__(): `boolean`

Defined in: src/ice/types.ts:196

An outbound shim whose engine is missing says so (#2120): PDF with no
provider chosen. The Export action does not offer it. Default: available.

#### Returns

`boolean`

#### Inherited from

[`IceShim`](IceShim.md).[`isAvailable`](IceShim.md#isavailable)

***

### read()?

> `optional` __read__(`input`, `tools`): `Promise`\<[`ShimReadResult`](ShimReadResult.md)\>

Defined in: src/ice/types.ts:184

Inbound: read one input. Required for `in` and `both`.

#### Parameters

##### input

[`IceItem`](IceItem.md)

##### tools

[`ShimTools`](ShimTools.md)

#### Returns

`Promise`\<[`ShimReadResult`](ShimReadResult.md)\>

#### Inherited from

[`IceShim`](IceShim.md).[`read`](IceShim.md#read)

***

### write()?

> `optional` __write__(`items`, `tools`): `Promise`\<[`IceItem`](IceItem.md)[]\>

Defined in: src/ice/types.ts:191

Outbound (export, #2120): turn the items into this shim's `produces`.
Required for `out` and `both`. An outbound shim matches its input by
`accepts.kinds` alone; a shim that produces `file` makes the download,
and is what the Export action offers.

#### Parameters

##### items

[`IceItem`](IceItem.md)[]

##### tools

[`ExportShimTools`](ExportShimTools.md)

#### Returns

`Promise`\<[`IceItem`](IceItem.md)[]\>

#### Inherited from

[`IceShim`](IceShim.md).[`write`](IceShim.md#write)
