[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [export/pdfEngine](../README.md) / normalizePdfInChild

# Function: normalizePdfInChild()

> __normalizePdfInChild__(`pdf`, `timeoutMs`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: src/export/pdfEngine.ts:222

Normalise a PDF in a child process (`normalizePdf`, the same pass a local
render gets). Rejects when the bytes are not a PDF pdf-lib can read, or the
child times out.

## Parameters

### pdf

`Uint8Array`

A PDF a PDF service returned

### timeoutMs

`number`

The child is killed after this

## Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>
