[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/magicLinkDeviceState](../README.md) / deviceStateCookieOptions

# Function: deviceStateCookieOptions()

> __deviceStateCookieOptions__(`ttlMs`, `secure?`): `object`

Defined in: src/utils/magicLinkDeviceState.ts:93

Cookie options for the state cookie.

`SameSite=Lax` rather than `Strict` is deliberate: the redemption arrives as
a top-level navigation from a mail client or webmail tab, and `Strict` would
withhold the cookie on that cross-site click — making every ordinary
redemption look like a mismatch, which is the failure mode most likely to get
this feature switched off.

`httpOnly` keeps page scripts from reading or forging it. `maxAge` tracks the
token TTL so the cookie does not outlive what it describes.

## Parameters

### ttlMs

`number`

### secure?

`boolean` = `false`

## Returns

`object`

### httpOnly

> __httpOnly__: `true`

### maxAge

> __maxAge__: `number`

### path

> __path__: `"/"`

### sameSite

> __sameSite__: `"lax"`

### secure

> __secure__: `boolean`
