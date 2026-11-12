[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / InviteOutcome

# Type Alias: InviteOutcome

> __InviteOutcome__ = \{ `invitation`: [`InvitationView`](../interfaces/InvitationView.md); `outcome`: `"sent"`; \} \| \{ `outcome`: `"email-unavailable"` \| `"send-failed"` \| `"not-invitable"`; `reason`: `string`; \}

Defined in: src/managers/AuthManager.ts:799

What sending an invitation came to (#2049); `reason` is plain words for the administrator.
