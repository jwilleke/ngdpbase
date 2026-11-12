[__ngdpbase API v5.43.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [converters/ncm/fix/types](../README.md) / FixStepResult

# Interface: FixStepResult

Defined in: src/converters/ncm/fix/types.ts:8

What one step changed. Empty `lines` means nothing changed.

## Properties

### content

> __content__: `string`

Defined in: src/converters/ncm/fix/types.ts:9

***

### lines

> __lines__: `number`[]

Defined in: src/converters/ncm/fix/types.ts:11

1-based line numbers, in the step's input, that were rewritten or removed.
