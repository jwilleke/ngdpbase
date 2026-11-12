[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / PendingStepUp

# Interface: PendingStepUp

Defined in: src/managers/AuthManager.ts:927

A step-up asked for and not yet given, kept on the session (#2145): which
permission it was for, where the prompt returns, and whether going there
does the action again (a page GET, or a form POST kept to be redone, #2154)
or only brings the person back to it.

## Properties

### next

> __next__: `string`

Defined in: src/managers/AuthManager.ts:929

***

### permission

> __permission__: `string`

Defined in: src/managers/AuthManager.ts:928

***

### replay?

> `optional` __replay?__: `string`

Defined in: src/managers/AuthManager.ts:932

The kept form POST the confirmation releases (#2154).

***

### replays

> __replays__: `boolean`

Defined in: src/managers/AuthManager.ts:930
