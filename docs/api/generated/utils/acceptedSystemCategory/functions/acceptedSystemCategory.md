[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/acceptedSystemCategory](../README.md) / acceptedSystemCategory

# Function: acceptedSystemCategory()

> __acceptedSystemCategory__(`submitted`, `offered`, `current?`): `string` \| `null`

Defined in: src/utils/acceptedSystemCategory.ts:15

Which system-category a submitted page save is accepted with (#1504).

`enabled: false` is visibility only (operator, 2026-09-28): a disabled
system-category is never offered, so nobody can choose it for a page — but a
page that already carries it keeps it, and saving that page is not refused.
Whether the save is allowed at all is policy's decision, not this one.

## Parameters

### submitted

`string`

the system-category the form or API sent

### offered

`string`[]

the system-categories people may choose (enabled ones)

### current?

`unknown`

the page's system-category before this save, if it exists

## Returns

`string` \| `null`

the accepted label, or null when the submission names a
  system-category the person may not choose
