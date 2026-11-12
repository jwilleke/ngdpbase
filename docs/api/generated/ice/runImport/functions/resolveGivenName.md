[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/runImport](../README.md) / resolveGivenName

# Function: resolveGivenName()

> __resolveGivenName__(`upload`, `receiver`, `maxLength`): `object`

Defined in: src/ice/runImport.ts:296

The name the user gave this file (#2130), as the engine applies it: none
when the receiver names things itself (it declares no `names`) or the user
kept the file's own name; a problem when the name breaks the rule. Never
trusted from the caller: checked here whoever queued the run.

## Parameters

### upload

[`IceUpload`](../../types/interfaces/IceUpload.md)

### receiver

[`RegisteredReceiver`](../../types/interfaces/RegisteredReceiver.md)

### maxLength

`number`

## Returns

`object`

### name?

> `optional` __name?__: `string`

### problem?

> `optional` __problem?__: `string`
