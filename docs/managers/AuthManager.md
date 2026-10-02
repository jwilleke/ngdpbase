---
name: AuthManager
description: Pluggable authentication provider chain — registers AuthProviders and delegates authenticate/initiate calls
dateModified: '2026-05-28'
category: managers
code: src/managers/AuthManager.ts
---

# AuthManager

Registers one or more `AuthProvider` instances and delegates authenticate/initiate calls to the appropriate provider. Routes call only AuthManager — never individual providers directly. `ngdpbase.auth.factors` lists the sign-in methods offered, one entry per provider with the `amr` / `aal` / `acr` it gives; configuration may lower those values against what the provider's code declares, never raise them ([#1523](https://github.com/jwilleke/ngdpbase/issues/1523)). `getFactors()` returns the factors actually available, `assess()` what a set of satisfied factors amounts to (combined `amr`, AAL, `acr`, MFA), and a successful `authenticate()` reports the provider and the factors satisfied with their times. Signing in still uses one factor; the per-role `required-aal` check and the multi-factor flow follow under #1523. The retired flat `ngdpbase.auth.required-factors` list is still read from custom config and converted, with a warning.

## Built-in Providers

- __PasswordAuthProvider__ — always registered.
- __MagicLinkAuthProvider__ — registered when `ngdpbase.auth.magic-link.enabled`.
- __GoogleOIDCProvider__ — when `ngdpbase.auth.google-oidc.enabled`.
- __CloudflareAccessAuthProvider__ — when `ngdpbase.auth.cloudflare-access.enabled`.
- __AuthentikBearerAuthProvider__ — when `ngdpbase.auth.authentik-bearer.enabled`; bearer JWTs for agent ingest.
- __AgentTokenAuthProvider__ — when `ngdpbase.auth.agent-token.enabled`; user-delegated agent tokens (#946).

Add-ons contribute more through `registerProvider()` (#1050).

## Planned

Multi-factor sign-in, step-up and device authorization are epic #1522; the order and open questions are in [planning/authentication.md](../planning/authentication.md).

## See Also

- Issue #396 — original AuthManager design
- [BaseAuthProvider](../providers/BaseAuthProvider.md) — the abstract contract
- [PasswordAuthProvider](../providers/PasswordAuthProvider.md), [MagicLinkAuthProvider](../providers/MagicLinkAuthProvider.md), [CloudflareAccessAuthProvider](../providers/CloudflareAccessAuthProvider.md), [GoogleOIDCProvider](../providers/GoogleOIDCProvider.md)

## Credentials store (#1524)

AuthManager is the only door to an account's credentials beyond its password: passkeys, TOTP, verified email/phone and known devices ([BaseCredentialsProvider](../providers/BaseCredentialsProvider.md), stored by [FileCredentialsProvider](../providers/FileCredentialsProvider.md)). Passwords stay on the user record and are never copied here.

- `listCredentials(ctx, username)`, `addCredential(ctx, username, input)`, `removeCredential(ctx, username, id)`. Your own credentials need `profile-manage`; anyone else's need `user-edit`; a signed-out caller is refused. Listings never include a secret. Adding and removing are audited (`user-edit`, action `credential-add` / `credential-remove`).
- __The last way in:__ removing a passkey or verified email is refused when the account would have no password and no other passkey or email left. TOTP and known devices are not ways in on their own, so they never count.
- __A row that does not verify__ (unsigned, signed with another key, edited) is ignored and raised: a `security-event` audit record (`credential-rejected`, severity `high`), an `error`-level admin notification (escalated by email when escalation is on), and AuthManager marked `degraded`, so `/admin` shows it until the store is put right.
- __No key, no store:__ without `NGDPBASE_CREDENTIALS_KEY` the store stays closed and AuthManager is `degraded`. Boot normally generates the key into the instance `.env`.
