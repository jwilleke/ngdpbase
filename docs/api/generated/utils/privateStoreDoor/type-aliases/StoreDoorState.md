[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreDoor](../README.md) / StoreDoorState

# Type Alias: StoreDoorState

> __StoreDoorState__ = \{ `open`: `true`; \} \| \{ `message`: `string`; `open`: `false`; `reason`: `"unavailable"` \| `"disabled"` \| `"not-installed"`; \}

Defined in: src/utils/privateStoreDoor.ts:95

Whether a kind's door is open (#1414). A kind the site owns is always open.
An addon's kind is open only while that addon is loaded; otherwise the kind
and every user's copy stay exactly as they are — nothing is removed — and
the door says why it is shut.
