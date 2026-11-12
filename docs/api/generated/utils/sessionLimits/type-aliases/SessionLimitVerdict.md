[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sessionLimits](../README.md) / SessionLimitVerdict

# Type Alias: SessionLimitVerdict

> __SessionLimitVerdict__ = \{ `end`: `"max-age"` \| `"idle-timeout"`; \} \| \{ `end`: `null`; `stampSignedIn`: `boolean`; `touch`: `boolean`; \}

Defined in: src/utils/sessionLimits.ts:67

What one request does to a signed-in session.
