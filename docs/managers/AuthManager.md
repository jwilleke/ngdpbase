---
name: AuthManager
description: Pluggable authentication provider chain — registers AuthProviders and delegates authenticate/initiate calls
dateModified: '2026-05-28'
category: managers
code: src/managers/AuthManager.ts
---

# AuthManager

Registers one or more `AuthProvider` instances and delegates authenticate/initiate calls to the appropriate provider. Routes call only AuthManager — never individual providers directly. `ngdpbase.auth.factors` lists the sign-in methods offered, one entry per provider with the `amr` / `aal` / `acr` it gives; configuration may lower those values against what the provider's code declares, never raise them ([#1523](https://github.com/jwilleke/ngdpbase/issues/1523)). `getFactors()` returns the factors actually available, `assess()` what a set of satisfied factors amounts to (combined `amr`, AAL, `acr`, MFA), and a successful `authenticate()` reports the provider and the factors satisfied with their times. `signInRecord(result)` turns that into what the session keeps as `req.session.signIn` — provider, factors, `amr` / `aal` / `acr` / `mfa`, and when — on every sign-in path (password, magic link, Google, Cloudflare Access). Step-up (#1525) and UserInfo (#1529) read it there. A delegated credential never starts a session, so it never gets one. Signing in still uses one factor; the per-role `required-aal` check and the second-factor flow follow under #1523. The retired flat `ngdpbase.auth.required-factors` list is still read from custom config and converted, with a warning.

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

## Required assurance level per role (#1523)

Each role in `ngdpbase.roles.definitions` may carry `required-aal` (1–3): the NIST level a sign-in must reach to hold it. A person needs the highest among their roles (`requiredAalFor(roles)`). Every role ships at 1, and `anonymous` has none. `admin` and `user-admin` move to 2 in the same change that ships the first AAL2-capable factor (passkeys or TOTP), together with an enrol-now step (decided 2026-10-03).

`unreachableRequiredAal()` lists every role whose level the available factors cannot reach: one factor declaring that level, or distinct factor types lifting a sign-in to AAL2, with email never lifting. After add-ons register their providers, `app.ts` refuses to start when that list is not empty, naming the role, the level and what `ngdpbase.auth.factors` offers. A role nobody can sign in to is a lockout, so it is found at boot rather than at the door. The check at sign-in itself comes with the second-factor flow.

## Passkeys (#448)

[PasskeyAuthProvider](../providers/PasskeyAuthProvider.md) is registered once the credentials store is open, when `ngdpbase.application.base-url` is set explicitly and is https (or localhost), and `ngdpbase.auth.passkey.enabled` is not `false`. AuthManager owns the store and hands the provider only "find this passkey" and "record its use". The routes talk to `passkeyRegistrationOptions()`, `passkeyRegister()` and `passkeyAuthenticationOptions()`, and sign in through `authenticate('passkey', { webauthn })`. `passkeyRelyingParty()` names the host passkeys are tied to.

## Credentials store (#1524)

AuthManager is the only door to an account's credentials beyond its password: passkeys, TOTP, verified email/phone and known devices ([BaseCredentialsProvider](../providers/BaseCredentialsProvider.md), stored by [FileCredentialsProvider](../providers/FileCredentialsProvider.md)). Passwords stay on the user record and are never copied here.

- `listCredentials(ctx, username)`, `addCredential(ctx, username, input)`, `removeCredential(ctx, username, id)`. Your own credentials need `profile-manage`; anyone else's need `user-edit`; a signed-out caller is refused. Listings never include a secret. Adding and removing are audited (`user-edit`, action `credential-add` / `credential-remove`).
- __The last way in:__ removing a passkey or verified email is refused when the account would have no password and no other passkey or email left. TOTP and known devices are not ways in on their own, so they never count.
- __A row that does not verify__ (unsigned, signed with another key, edited) is ignored and raised: a `security-event` audit record (`credential-rejected`, severity `high`), an `error`-level admin notification (escalated by email when escalation is on), and AuthManager marked `degraded`, so `/admin` shows it until the store is put right.
- __No key, no store:__ without `NGDPBASE_CREDENTIALS_KEY` the store stays closed and AuthManager is `degraded`. Boot normally generates the key into the instance `.env`.
