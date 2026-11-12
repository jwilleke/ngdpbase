[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / StepUpReplayAnswer

# Type Alias: StepUpReplayAnswer

> __StepUpReplayAnswer__ = \{ `action`: `string`; `back`: `string`; `fields`: \[`string`, `string`\][]; \} \| \{ `back`: `string`; \}

Defined in: src/managers/AuthManager.ts:1031

What the continue page does (#2154): post `fields` to `action` (`back` is the page it came from), or go `back` with nothing redone.
