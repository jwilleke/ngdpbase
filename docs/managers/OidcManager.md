---
name: OidcManager
description: The embedded OpenID Connect provider at the base URL's /oidc — off unless enabled, never loaded when off (#1570)
dateModified: '2026-10-03'
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

`findAccount` releases `preferred_username`, `name` and, when set, `email`. A missing or disabled account fails the request closed. Roles are never released: a session can hold fewer roles than the account ([#1569](https://github.com/jwilleke/ngdpbase/issues/1569)), and the package asks with an account id only.

## Storage

[FileOidcAdapter](../providers/FileOidcAdapter.md) under `<FAST_STORAGE>/oidc` ([#1571](https://github.com/jwilleke/ngdpbase/issues/1571)).

## Backup and restore

`backup()` carries the roster of live grants (account, client, issued, expires) for incident response, marked `restorable: false`. `restore()` refuses: sessions and grants are not restored, so people sign in again and clients re-consent. A restored grant could revive access somebody had ended.

## Sign-in bridge

`/oidc/interaction/:uid` is ngdpbase's route for the provider's pending requests ([#1572](https://github.com/jwilleke/ngdpbase/issues/1572); `src/routes/OidcRoutes.ts`, registered only while the provider is serving):

- Signed out: to `/login?redirect=/oidc/interaction/<uid>`, and back.
- Signed in: `finishLogin` with the username and the session's sign-in record (`amr`, `acr`, `at`). A session without a record gets `login_required`.
- Consent: `views/oidc-consent.ejs`, under the session and CSRF. Allow is `finishConsent`, Deny is `access_denied`. Everyone sees consent once per app; the grant is remembered.
- Consent belongs to the account the request was signed in as. Anyone else signed in on that browser gets `login_required`.
- Sign-out (`/logout`) ends the account's provider sessions (`endSessionsFor`). Grants stay, and tokens already issued run to their expiry. A disabled or deleted account fails closed at the next refresh or UserInfo, because `findAccount` returns nothing for it.

Refused rather than faked, until step-up exists ([#1525](https://github.com/jwilleke/ngdpbase/issues/1525)):

- A request for a fresh sign-in (`prompt=login`, or a `max_age` the session's sign-in is older than) gets `login_required`. A sign-in made after the request began counts as fresh, so someone sent to `/login` comes back and continues.
- Device approval ([#1577](https://github.com/jwilleke/ngdpbase/issues/1577)) gets `access_denied`.

## Not yet

Audit ([#1575](https://github.com/jwilleke/ngdpbase/issues/1575)), accepting its access tokens on ngdpbase's API ([#1576](https://github.com/jwilleke/ngdpbase/issues/1576)), step-up on device approval ([#1577](https://github.com/jwilleke/ngdpbase/issues/1577)), and revoking an account's grants when its password changes.
