---
name: OidcAuthProvider
description: Sign-in through any outside OpenID Connect provider, by an identity connected to the account
dateModified: '2026-10-11'
category: providers
code: src/providers/OidcAuthProvider.ts
---

# OidcAuthProvider

Signs people in through an outside OpenID Connect provider (Google, a self-hosted authentik, any issuer that publishes discovery). One class; AuthManager registers one instance per enabled entry of `ngdpbase.auth.oidc.providers`, with the id `oidc:<name>` ([#1743](https://github.com/jwilleke/ngdpbase/issues/1743)). Routes never call it: they call AuthManager.

## What an outside sign-in may do

- __Only a connected identity signs in.__ The identity is the issuer plus the subject (`iss` + `sub`, OIDC Core §5.7), kept as a credentials-store row of kind `identity` (subject `${issuer}#${sub}`, label the provider's name, secret the provider's verified email or `''`). A sign-in whose identity is connected to no account is refused, with a message that does not say whether an account exists.
- __Email never signs anyone in__ and never finds an account. Only an address the provider reports verified (`email_verified === true`) is kept on the row, and it is refreshed at each sign-in.
- __No roles.__ Groups and roles claims are never read.
- __No account is created.__ Account creation (`auto-provision`) and the email step are still to be built; until then a person connects the identity from their profile first.
- __No tokens are kept.__ The access token in the token response is discarded; there is no refresh token.

## Flows

- __Sign in__: `POST /auth/oauth/<name>` → `AuthManager.startFlow` → the provider's authorization endpoint → `GET /auth/oauth/<name>/callback` → `AuthManager.authenticate('oidc:<name>', …)` → `completeSignIn(req, result, { method: 'oidc:<name>' })`. Google's URLs are these with `<name>` = `google`.
- __Connect__ (Profile → Sign-in methods → Connect *Provider*): `POST /auth/oauth/<name>/connect`, an `account-security` change, so step-up applies → `AuthManager.startConnect` → the provider → the same callback → `AuthManager.connectIdentity`, which refuses an identity already connected to any account (`connected-elsewhere`) and adds the row otherwise.
- __Disconnect__: the profile's credential-removal route, `POST /profile/credentials/:id/remove` → `AuthManager.removeCredential`, refused when it is the account's last way in. An identity counts as a way in only while its provider is enabled.

A flow carries its purpose: a flow started to connect never signs in, a sign-in flow never connects, and a connection finishes only for the account that started it.

## What each flow checks

- `state` is single-use, expires in 10 minutes, and is bound to the starting browser by the HTTP-only `ngdp_oauth_state` cookie (#1630).
- PKCE (S256) and an OIDC `nonce`; the code is exchanged with the verifier and the client secret (`client_secret_basic`, or `client_secret_post` when the issuer takes only that).
- The ID token's signature against the issuer's published keys (`jose`), `iss` (the configured issuer; Google's scheme-less `accounts.google.com` is also accepted), `aud` = the client id, `azp` when there are several audiences, `exp`, and `nonce`.
- The discovery document's `issuer` must equal the configured issuer (OIDC Discovery §4.3).

Discovery, the key set and the token exchange go through `guardedFetch` (#1133), so an issuer on the local network needs `ngdpbase.security.egress.allowed-ranges`. Discovery and keys are cached for an hour; the keys are fetched again once when a token names a key not in the set.

## Configuration

- `ngdpbase.auth.oidc.providers` — map of name → `{ preset, issuer, client-id, client-secret, enabled, display-name, auto-provision }`. `preset: "google"` fills the issuer and name. `client-secret` must be an environment reference (`$NAME`); an entry with a literal secret is not registered. The callback is `<base-url>/auth/oauth/<name>/callback`, so `ngdpbase.application.base-url` must be set explicitly.
- `ngdpbase.auth.oidc.auto-provision` — the instance ceiling for account creation, `false`; not acted on yet.
- The old `ngdpbase.auth.google-oidc.*` keys are read as the `google` entry when enabled and the map has none (its `callback-url` is used when set). Their `auto-provision`, `default-roles`, `hd` and `deny-redirect` are no longer acted on. A factors entry or an account's `allowedAuthMethods` naming `google-oidc` still applies to `oidc:google`.
- A provider with no `ngdpbase.auth.factors` entry is offered as a primary sign-in method at AAL1.

## See Also

- [BaseAuthProvider](BaseAuthProvider.md) — the contract
- [AuthManager](../managers/AuthManager.md) — the one door
- [authentication developer guide](../guides/authentication-developer-guide.md)
- [planning/authentication.md](../planning/authentication.md#external-identity-providers-decided-2026-10-10) — the decisions
