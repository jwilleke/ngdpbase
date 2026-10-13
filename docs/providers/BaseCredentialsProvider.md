---
name: BaseCredentialsProvider
description: Abstract credentials store — an account's passkeys, TOTP, verified addresses and known devices, signed rows, AuthManager the only door (#1524)
dateModified: '2026-10-13'
category: providers
code: src/providers/BaseCredentialsProvider.ts
---

# BaseCredentialsProvider

__Module:__ `src/providers/BaseCredentialsProvider.ts`
__Extends:__ [BaseProvider](../../src/providers/BaseProvider.ts)

An account's ways in beyond its password, many per account: `passkey`, `totp`, `email`, `sms`, `device`, `identity`. One kind is not a way in: `proxy` ([#1762](https://github.com/jwilleke/ngdpbase/issues/1762)), a proxy grant, whose `username` is the person represented, `subject` the grant id and `secret` the grant's terms as JSON; AuthManager reads and writes it only through its proxy-grant methods. Passwords are not stored here; they stay on the user record ([#1524](https://github.com/jwilleke/ngdpbase/issues/1524), decided 2026-10-02).

A row: `id`, `username`, `kind`, `subject` (a passkey's credential id, an address, a device token's hash), `secret` (a public key, an encrypted TOTP seed, or empty), `label`, `createdAt`, `lastUsedAt`.

`listKind(kind)` returns every row of one kind, whoever's (the grants naming a person as proxy).

Every row is signed with `NGDPBASE_CREDENTIALS_KEY`. `initialize(onRejected)` drops any row that does not verify and reports it; [AuthManager](../managers/AuthManager.md) raises the security alert. AuthManager is the only caller.

The only implementation is [FileCredentialsProvider](FileCredentialsProvider.md).
