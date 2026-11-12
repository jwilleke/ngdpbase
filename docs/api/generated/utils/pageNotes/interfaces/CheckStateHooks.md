[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageNotes](../README.md) / CheckStateHooks

# Interface: CheckStateHooks

Defined in: src/utils/pageNotes.ts:356

The manager state a startup check sets and clears: the manager's own (BaseManager).

## Methods

### markNeedsAttention()

> __markNeedsAttention__(`reason`): `boolean`

Defined in: src/utils/pageNotes.ts:358

True when this is a new state. The pages work; an admin moves the notes in, so it needs attention, not down (#1946).

#### Parameters

##### reason

`string`

#### Returns

`boolean`

***

### markReadyIfDegradedBy()

> __markReadyIfDegradedBy__(`reason`): `boolean`

Defined in: src/utils/pageNotes.ts:360

Clears the degraded state only while it is still `reason`, so another fault stays reported.

#### Parameters

##### reason

`string`

#### Returns

`boolean`
