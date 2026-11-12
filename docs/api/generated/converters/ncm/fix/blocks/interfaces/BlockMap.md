[__ngdpbase API v5.43.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [converters/ncm/fix/blocks](../README.md) / BlockMap

# Interface: BlockMap

Defined in: src/converters/ncm/fix/blocks.ts:69

## Properties

### code

> __code__: `boolean`[]

Defined in: src/converters/ncm/fix/blocks.ts:75

true for a line inside fenced or indented code (markdown-it or Step 0).

***

### eols

> __eols__: `string`[]

Defined in: src/converters/ncm/fix/blocks.ts:73

`\r` where the line had one, else ''.

***

### html

> __html__: `boolean`[]

Defined in: src/converters/ncm/fix/blocks.ts:77

true for a line inside an HTML block.

***

### items

> __items__: [`ListItem`](ListItem.md)[]

Defined in: src/converters/ncm/fix/blocks.ts:81

Every list item, in source order.

***

### lines

> __lines__: `string`[]

Defined in: src/converters/ncm/fix/blocks.ts:71

Page lines without their `\r`.

***

### lists

> __lists__: [`ListInfo`](ListInfo.md)[]

Defined in: src/converters/ncm/fix/blocks.ts:79

Every list, outer lists before the lists nested in them.

***

### paragraphs

> __paragraphs__: [`ItemBlock`](ItemBlock.md)[]

Defined in: src/converters/ncm/fix/blocks.ts:83

The paragraph blocks' line ranges, in source order.
