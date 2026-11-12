[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/availability](../README.md) / ReadProperty

# Type Alias: ReadProperty

> __ReadProperty__ = (`key`) => `unknown`

Defined in: src/utils/availability.ts:44

Read one configuration value. No fallback parameter, deliberately.

A fallback in the call is a second place the value can come from, and it is
invisible to the operator: the shipped `config/app-default-config.json` can
lose a key and nothing says so, because the caller quietly supplied one.
Every key this module reads IS declared there, so absence means a broken
configuration, not a value to invent.

What this module does with an absent value:

- __a switch__ (`…enabled`) reads as OFF, and says so in the log. A missing
  switch must never CLOSE the instance — that would lock everyone out over a
  typo — but it is still reported rather than assumed.
- __a window, schedule or holiday map__ absent means nothing to enforce.
- __a message__ falls back to a constant, because something has to render on
  the page. That is the only fallback here, and it is display text.

## Parameters

### key

`string`

## Returns

`unknown`
