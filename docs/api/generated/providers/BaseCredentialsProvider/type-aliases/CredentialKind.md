[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseCredentialsProvider](../README.md) / CredentialKind

# Type Alias: CredentialKind

> __CredentialKind__ = `"passkey"` \| `"totp"` \| `"email"` \| `"sms"` \| `"device"` \| `"identity"` \| `"proxy"` \| `"invitation"`

Defined in: src/providers/BaseCredentialsProvider.ts:36

`identity` (#1743): an outside OpenID Connect identity connected to the
account — subject `${iss}#${sub}`, label the provider's name, secret the
provider's verified email ('' when none).

`proxy` (#1762): a proxy grant — the row's `username` is the person
represented, `subject` the grant id, `secret` the grant's terms as JSON
(whom it is for, the permissions, who made it, when it ends). Never a way
in; AuthManager reads and writes it only through its proxy-grant methods.

`invitation` (#2049): a one-time link that lets a new user set up their
sign-in — `username` the account invited, `subject` the SHA-256 of the
link's token (the token itself is never stored), `secret` the terms as JSON
(who sent it, when it ends). Not a sign-in method; AuthManager reads and
writes it only through its invitation methods.
