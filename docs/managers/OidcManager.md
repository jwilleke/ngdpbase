---
name: OidcManager
description: The embedded OpenID Connect provider at the base URL's /oidc — off unless enabled, never loaded when off (#1570)
dateModified: '2026-10-23'
category: managers
code: src/managers/OidcManager.ts
---

# OidcManager

Embeds [oidc-auth-server](https://github.com/jwilleke/oidc-auth-server) — a hardened [node-oidc-provider](https://github.com/panva/node-oidc-provider) — so an instance can be an OpenID Connect provider at `<base-url>/oidc`: authorization code flow with PKCE, UserInfo, refresh rotation and the device authorization grant (RFC 8628). Epic [#1578](https://github.com/jwilleke/ngdpbase/issues/1578).

## Off unless enabled

`oidc-auth-server.enabled` (default `false`). Off, the package is never imported and `/oidc` does not exist. The manager is still registered and reports `disabled`, so "off" is visible rather than absent (#1155).

On, it needs `ngdpbase.application.base-url` set explicitly — https, or http on localhost. Otherwise it reports `degraded`, names the key, and mounts nothing. The same holds for any configuration the package refuses.

## What ngdpbase decides

| Setting | From | Why not the operator's |
| --- | --- | --- |
| Issuer | `ngdpbase.application.base-url` + `/oidc` | The configured host, never the request's ([#642](https://github.com/jwilleke/ngdpbase/issues/642)) |
| Trust proxy | The `trust proxy` value app.ts resolved for Express | Two settings that are only correct together are one decision ([#1574](https://github.com/jwilleke/ngdpbase/issues/1574)) |
| `acr` values | What ngdpbase's sign-in record can carry | They describe ngdpbase's sign-in, not a preference |
| Development mode | On only for an http issuer on localhost | Never a switch |

Setting `oidc-auth-server.issuer`, `.trust-proxy`, `.development` or `.acr-values` in `app-custom-config.json` is refused. Every other `oidc-auth-server.*` key belongs to the package (its `config/app-default-config.json` documents them); the manager reads them from ConfigurationManager and hands them to the package's loader, which refuses unknown keys and secrets written into a file.

## Keys

`OIDC_AUTH_SERVER_JWKS` (signing keys) and `OIDC_AUTH_SERVER_COOKIE_KEYS` are environment-only. When nothing supplies them, the manager generates them once into `<FAST_STORAGE>/.env` (owner-only), the way the session secret is. Keep a copy with the backup: replacing the JWKS invalidates every ID token and JWT access token already issued.

## Mounting

app.ts mounts the handler at `/oidc` before the body parsers, the session and CSRF. node-oidc-provider reads the raw body, and its endpoints carry their own protections, so CSRF never sees them and needs no exemption list ([#1573](https://github.com/jwilleke/ngdpbase/issues/1573)). `/oidc/interaction/*` is passed on to ngdpbase's own sign-in and consent route ([#1572](https://github.com/jwilleke/ngdpbase/issues/1572)), which therefore keeps the session and CSRF.

The server starts in two steps: `initialize()` validates and prepares the store and keys; `start({ trustProxy })` builds it once app.ts has resolved `trust proxy`, which depends on whether this process terminates TLS.

## Accounts

`findAccount(accountId, signIn)` releases `preferred_username`, `name`, `test_account` and, when set, `email`. Roles are never released: a session can hold fewer roles than the account ([#1569](https://github.com/jwilleke/ngdpbase/issues/1569)).

`test_account` ([#1805](https://github.com/jwilleke/ngdpbase/issues/1805)) is always a boolean, `true` for an account an administrator marked as a test account, so a client can tell a real account (`false`) from a claim it did not ask for (absent). It is released with the `profile` scope: the manager adds it to that scope's claims (`withTestAccountClaim`), since the provider drops any claim no scope names. With the code flow it arrives from UserInfo; an ID token issued without an access token carries it too. It grants nothing: the app decides what a test account may do.

It returns nothing, which fails the request closed, when:

- the account is missing or disabled;
- the request carries a sign-in older than the account's last password change ([#1592](https://github.com/jwilleke/ngdpbase/issues/1592)). The package passes the sign-in's `authTime` from the code, refresh token or access token. A refresh then answers `invalid_grant` and UserInfo `401`, so an app keeps nothing past a password change, as no web session does ([#1482](https://github.com/jwilleke/ngdpbase/issues/1482)).

The change time is written only by `setPassword()` (`src/utils/passwordChange.ts`), the one definition of a password change. `UserManager.updateUser` and `scripts/reset-admin-password.ts` both use it. An access token already issued, which an outside API checks by itself, stays valid until it expires (1 hour by default).

The session that changed the password stays signed in, as #1482 intends, but its sign-in predates the change. Apps signing in through it are refused until the user signs in again.

## Storage

[FileOidcAdapter](../providers/FileOidcAdapter.md) under `<FAST_STORAGE>/oidc` ([#1571](https://github.com/jwilleke/ngdpbase/issues/1571)).

## Backup and restore

`backup()` carries the roster of live grants (account, client, issued, expires) for incident response, marked `restorable: false`. `restore()` refuses: sessions and grants are not restored, so users sign in again and clients re-consent. A restored grant could revive access somebody had ended.

## Sign-in bridge

`/oidc/interaction/:uid` is ngdpbase's route for the provider's pending requests ([#1572](https://github.com/jwilleke/ngdpbase/issues/1572); `src/routes/OidcRoutes.ts`, registered only while the provider is serving):

- Signed out: to `/login?redirect=/oidc/interaction/<uid>`, and back.
- Signed in: `finishLogin` with the username and the session's sign-in record (`amr`, `acr`, `at`). A session without a record gets `login_required`.
- Consent: `views/oidc-consent.ejs`, under the session and CSRF. Allow is `finishConsent`, Deny is `access_denied`. Everyone sees consent once per app; the grant is remembered.
- Consent belongs to the account the request was signed in as. Anyone else signed in on that browser gets `login_required`.
- Acting for someone ([#1762](https://github.com/jwilleke/ngdpbase/issues/1762) slice 6): the account is the user represented, and only a device may be approved; an app sign-in gets `access_denied` with "Switch back to yourself to sign in to an app." The device approval asks `account-security` of the proxy subject (so the grant must carry it, both users hold it, and the step-up is the user acting's), and `proxyApprovalRefusal(subject, scope)` refuses, in plain words, any API permission the device asks for that the grant, the user represented and the user acting do not all allow. Allow goes through `finishConsent(req, res, subject)`, which, acting for someone, writes a `ProxyApproval` row beside the provider's grant (`grantId`, `accountId`, `approvedBy`, `proxyGrantId`, expiring with the grant; the provider rewrites a grant from its own fields, so nothing is added to it) and records `oidcauthorize-allow`, reason `approved-by-proxy`, with `user` the user represented and `actor` the user acting.
- Sign-out (`/logout`) ends the account's provider sessions (`endSessionsFor`). Grants stay, and tokens already issued run to their expiry. A disabled or deleted account fails closed at the next refresh or UserInfo, because `findAccount` returns nothing for it.

__Approving a device__ (RFC 8628, when `oidc-auth-server.device-flow.enabled` is true) gives long-lived access, so at every step it asks `account-security` through ngdpbase's own permission check: policy, then step-up ([#1525](https://github.com/jwilleke/ngdpbase/issues/1525), [#1577](https://github.com/jwilleke/ngdpbase/issues/1577)). A session without a fresh factor goes to `/auth/reauth` and comes back to the same pending request. The consent page says it is a device, and that it stays connected until its access is revoked. The bridge gets this check as `permit` (`WikiRoutes.permitRequest`), not a copy.

Refused rather than faked: a request for a fresh sign-in from an app (`prompt=login`, or a `max_age` the session's sign-in is older than) gets `login_required`. A sign-in made after the request began counts as fresh, so someone sent to `/login` comes back and continues.

## Audit

Every event the provider reports is recorded in ngdpbase's audit log ([#1575](https://github.com/jwilleke/ngdpbase/issues/1575)), under the package's own names. They're declared in `ngdpbase.audit.events` and `AUDIT_EVENT`, and a test holds them equal to the package's `AUDIT_EVENT_NAMES`.

- __Who and what:__ the record's user is the account (or `anonymous` when there is none yet), its resource the app (`resourceType: oidc-client`).
- __Details kept:__ metadata carries the grant, grant type, scope, token kind and error. The package never passes a token, code or secret.
- __On failure:__ every event is `continue`. The package reports after the action has happened, so a record cannot be made a condition of it.
- __Severity:__ a used code or refresh token presented again (`oidctoken-reuse`, the replay signature) and a server error are high. A refused request is medium or low.

## API access

ngdpbase's own API is a resource server at `<base-url>/api`, derived like the issuer ([#1576](https://github.com/jwilleke/ngdpbase/issues/1576)). Its scopes are the permissions a delegation may carry. An app's token for it is verified in process by `verifyAccessToken()` and accepted by [OidcBearerAuthProvider](../providers/OidcBearerAuthProvider.md) as a delegation from the user. When no permission is delegable, the API is left out and sign-in still works. A token under a grant approved by someone acting for the user verifies only while that proxy grant is in force (`AuthManager.liveProxyGrant`).

## Approved apps and devices

Each app or device a user approved through `/oidc` is a grant ([#1601](https://github.com/jwilleke/ngdpbase/issues/1601)). It lasts until it expires or is revoked, whichever comes first: its lifetime is the package's `oidc-auth-server.ttl.grant` (14 days by default), its refresh key's `oidc-auth-server.ttl.refresh-token` (also 14 days). When the grant ends, the app's access ends with it, refresh key or not, and the user approves it again.

- `listGrants(username)`: one entry per live grant, with the app's name, whether it's a device (its client may use the device grant), the scopes allowed, when it was approved, whether it holds a refresh key (`refreshable`), when that key was last renewed (`renewedAt`, from the newest rotated refresh key), and who approved it while acting for the user (`approvedBy`, `proxyGrantId`; null otherwise). The list and the admin user page say "Approved by … (acting for …)" on such a row. Profile → __My tokens and devices__ lists your own beside your agent tokens, through `AuthManager.listDelegations` ([#1764](https://github.com/jwilleke/ngdpbase/issues/1764)); the admin user page lists that user's (`user-read`). Apps are listed only while the provider is on.
- `revokeGrant(username, grantId, by)`: removes the grant, its proxy approval and every code and token under it from the store, recorded as `oidcgrant-revoke` by the subject `by`, naming the owner; under a proxy grant, naming the user acting too. Ending the proxy grant a device was approved under revokes it this way. It never touches another user's grant. Routes reach it only through `AuthManager.revokeDelegation`.
  - From the profile, revoking asks `account-security`, so it needs step-up ([#1525](https://github.com/jwilleke/ngdpbase/issues/1525)).
  - From the admin page it asks `user-edit`.
  - A token can never revoke anything.

## Not yet

Friendlier consent lines for permission scopes, which show by name.
