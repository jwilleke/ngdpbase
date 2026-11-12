[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/runImport](../README.md) / ChainSpec

# Interface: ChainSpec

Defined in: src/ice/runImport.ts:185

What a chain needs: the shims it may continue through, and where it stops.

## Properties

### maxChainDepth

> __maxChainDepth__: `number`

Defined in: src/ice/runImport.ts:188

***

### shims

> __shims__: [`RegisteredShim`](../../types/interfaces/RegisteredShim.md)[]

Defined in: src/ice/runImport.ts:186

***

### target

> __target__: `string`

Defined in: src/ice/runImport.ts:192

Named in the error when nothing takes an item further.

## Methods

### done()

> __done__(`shim`, `item`): `boolean`

Defined in: src/ice/runImport.ts:190

Does this item, from this shim, stop here?

#### Parameters

##### shim

[`RegisteredShim`](../../types/interfaces/RegisteredShim.md)

##### item

[`IceItem`](../../types/interfaces/IceItem.md)

#### Returns

`boolean`

***

### tools()

> __tools__(`shim`): [`ShimTools`](../../types/interfaces/ShimTools.md)

Defined in: src/ice/runImport.ts:187

#### Parameters

##### shim

[`RegisteredShim`](../../types/interfaces/RegisteredShim.md)

#### Returns

[`ShimTools`](../../types/interfaces/ShimTools.md)
