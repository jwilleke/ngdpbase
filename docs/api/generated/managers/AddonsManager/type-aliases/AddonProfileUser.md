[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AddonsManager](../README.md) / AddonProfileUser

# Type Alias: AddonProfileUser

> __AddonProfileUser__ = `Omit`\<[`User`](../../../types/User/interfaces/User.md), `"password"`\>

Defined in: src/managers/AddonsManager.ts:81

Type passed to `AddonModule.profileSection()` (#534). Matches what
`UserManager.getUser()` returns at runtime — `User` minus the password
hash — so addons can read preferences/roles/email without coupling
to whether the host happened to fetch the full User record.
