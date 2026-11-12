[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / ActingForChange

# Type Alias: ActingForChange

> __ActingForChange__ = `"chosen"` \| `"switched-back"` \| `"grant-ended"` \| `"proxy-access-off"` \| `"vault-opened"`

Defined in: src/managers/AuthManager.ts:838

Why a session started or stopped acting for someone (#1762 slice 4), as the
`proxy-switch` record's `reason` says it: the person chose a grant, chose
themselves again, or the session was dropped back to them because the grant
no longer allows it (ended, expired, either account inactive) or proxy
access was turned off. `vault-opened` is not a switch: the grant's key copy
was opened, so the represented person's encrypted vaults are open to the
session that acts for them (#1762 slice 5).
