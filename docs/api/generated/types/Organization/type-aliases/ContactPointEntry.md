[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Organization](../README.md) / ContactPointEntry

# Type Alias: ContactPointEntry

> __ContactPointEntry__ = [`ContactPoint`](../interfaces/ContactPoint.md) \| [`PostalAddress`](../interfaces/PostalAddress.md)

Defined in: src/types/Organization.ts:60

One `contactPoint[]` entry: a ContactPoint, or a PostalAddress (schema.org's
ContactPoint subtype). Typed by `contactType` (`mailing`, `business`,
`agent`, `emergency`, …); the home address stays in `address`.
