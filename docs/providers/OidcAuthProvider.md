---
name: OidcAuthProvider
description: Sign-in through any outside OpenID Connect provider, by an identity connected to the account
dateModified: '2026-10-12'
category: providers
code: src/providers/OidcAuthProvider.ts
---

# OidcAuthProvider

Signs people in through an outside OpenID Connect provider ([Google](OidcAuthProvider-Google.md), [Apple](OidcAuthProvider-Apple.md), personal [Microsoft](OidcAuthProvider-Microsoft.md) accounts, a self-hosted [authentik](OidcAuthProvider-Authentik.md), any issuer that publishes discovery). One class; AuthManager registers one instance per enabled entry of `ngdpbase.auth.oidc.providers`, with the id `oidc:<name>` ([#1743](https://github.com/jwilleke/ngdpbase/issues/1743)). Routes never call it: they call AuthManager.

## What an outside sign-in may do

- __Only a connected identity signs in.__ The identity is the issuer plus the subject (`iss` + `sub`, OIDC Core §5.7), kept as a credentials-store row of kind `identity` (subject `${issuer}#${sub}`, label the provider's name, secret the provider's verified email or `''`). A sign-in whose identity is connected to no account signs nobody in: the provider keeps the verified identity on the flow (`unconnectedIdentity`) and AuthManager decides what happens next (below).
- __Email never signs anyone in__ and never finds an account. Only an address the provider reports verified (`email_verified === true`) is kept on the row, and it is refreshed at each sign-in.
- __No roles.__ Groups and roles claims are never read.
- __The email step.__ An identity connected to no account is held in the session as a pending connection for 5 minutes (one at a time), and the sign-in page says "Sign in to connect your *Provider* account (*email*)", with __Don't connect it__ to cancel. After the person's next sign-in, by any method, they are asked whether that account is theirs (`/login/connect/confirm`). Only __Connect__ connects it, after checking again that it has not expired or been connected to another account meanwhile; the profile says what happened. A sign-in never connects it alone: on a shared computer it may be the previous person's. Declined or ignored, nothing is connected; signing out drops it. Nothing is looked up by email, so the page is the same whether or not an account has that address.
- __Account creation__ only when `ngdpbase.auth.oidc.auto-provision`, the entry's own `auto-provision` and `ngdpbase.application.registration` are all true, and only for an email the provider verified. The account is made as magic-link auto-provisioning makes one: a username from the email, no password, registration's default roles (the provider gives none). The identity is then connected and the person signed in; if it cannot be connected, the new account is deleted again and nobody is signed in. An email that already belongs to an account creates nothing: the person gets the email step with the email-taken message. Without a verified email, the email step.
- __No tokens are kept.__ The access token in the token response is discarded; there is no refresh token.

## Flows

- __Sign in__: `POST /auth/oauth/<name>` → `AuthManager.startFlow` → the provider's authorization endpoint → `GET /auth/oauth/<name>/callback` (Apple POSTs it; see below) → `AuthManager.finishOutsideSignIn`, which runs `authenticate('oidc:<name>', …)` and then `completeSignIn(req, result, { method: 'oidc:<name>' })` for a connected identity, creates the account first where allowed, or holds the identity for the email step. Google's URLs are these with `<name>` = `google`.
- __Cancel the email step__: `POST /login/connect/cancel` drops the pending connection.
- __Confirm after the sign-in__: `GET /login/connect/confirm` asks; `POST /login/connect/confirm` with `answer=connect` → `AuthManager.confirmPendingConnection`, anything else → `declinePendingConnection`.
- __Connect__ (Profile → Sign-in methods → Connect *Provider*): `POST /auth/oauth/<name>/connect`, an `account-security` change, so step-up applies → `AuthManager.startConnect` → the provider → the same callback → `AuthManager.connectIdentity`, which refuses an identity already connected to any account (`connected-elsewhere`) and adds the row otherwise.
- __Disconnect__: the profile's credential-removal route, `POST /profile/credentials/:id/remove` → `AuthManager.removeCredential`, refused when it is the account's last way in. An identity counts as a way in only while its provider is enabled.

- __A POSTed callback__ (Apple, `response_mode=form_post`): `POST /auth/oauth/<name>/callback` is answered by the relay in `src/middleware/outsideCallbackRelay.ts`, mounted before the session and CSRF middleware, with a 303 to `GET /auth/oauth/<name>/callback?code=…&state=…` (and `error` when there is one), which then finishes as above. Only a provider for which `AuthManager.callbackIsPosted` is true is relayed; any other POST to a callback falls through to CSRF and is refused.

A flow carries its purpose: a flow started to connect never signs in, a sign-in flow never connects, and a connection finishes only for the account that started it.

## What each flow checks

- `state` is single-use, expires in 10 minutes, and is bound to the starting browser by the HTTP-only `ngdp_oauth_state` cookie (#1630).
- PKCE (S256) and an OIDC `nonce`; the code is exchanged with the verifier and the client secret (`client_secret_basic`, or `client_secret_post` when the issuer takes only that). For Apple the client secret is a JWT the site signs for each exchange ([Apple](OidcAuthProvider-Apple.md)).
- The ID token's signature against the issuer's published keys (`jose`), `iss` (the configured issuer; Google's scheme-less `accounts.google.com` is also accepted), `aud` = the client id, `azp` when there are several audiences, `exp`, and `nonce`.
- The discovery document's `issuer` must equal the configured issuer (OIDC Discovery §4.3).

### Why a POSTed callback is relayed, not finished

Apple sends the person back with an auto-submitting form that POSTs the code and state from appleid.apple.com: a cross-site, top-level POST. Every cookie this site sets is `SameSite=Lax`, and browsers send Lax cookies on a cross-site top-level navigation only when its method is safe (GET). So the POST arrives with neither the session cookie nor `ngdp_oauth_state`. Finishing there would mean giving up the browser binding (#1630); and letting the session middleware see the POST would start a new session whose cookie replaces the person's own (signing them out, or losing a connection in progress).

The relay therefore runs before the session and CSRF middleware and does one thing: a 303 to the same callback as a GET, carrying only `code`, `state` and `error`. The GET is a top-level navigation, so the browser sends its Lax cookies with it, and every check above runs unchanged. The `user` field Apple adds on a first sign-in (the person's name) is dropped: it is unsigned and never identifies anyone. A forged POST gains nothing a forged link to the GET callback could not already do, and that is refused by the browser binding. The code appears in the URL, as in every other provider's code flow; it is single-use and bound to the PKCE verifier.

Discovery, the key set and the token exchange go through `guardedFetch` (#1133), so an issuer on the local network needs `ngdpbase.security.egress.allowed-ranges`. Discovery and keys are cached for an hour; the keys are fetched again once when a token names a key not in the set.

## Configuration

- `ngdpbase.auth.oidc.providers` — map of name → `{ preset, issuer, client-id, client-secret, enabled, display-name, auto-provision }`, and for `preset: "apple"` `{ team-id, key-id, private-key }` in place of `client-secret`. `preset: "google"`, `preset: "microsoft"` and `preset: "apple"` fill the issuer and name ([Providers](#providers)); any other issuer is set with `issuer`, exactly as its discovery document states it. `client-secret` and `private-key` must be environment references (`$NAME`); an entry with either written in literally is not registered. The map is `sensitive`, and secret-looking fields inside it (`client-secret`, `private-key`) are hidden from anyone without `secret-reveal`. The callback is `<base-url>/auth/oauth/<name>/callback`, so `ngdpbase.application.base-url` must be set explicitly.
- `ngdpbase.auth.oidc.auto-provision` — the instance ceiling for account creation, `false`. An entry's own `auto-provision` (default off) and `ngdpbase.application.registration` must also be true.
- The old `ngdpbase.auth.google-oidc.*` keys are read as the `google` entry when enabled and the map has none (its `callback-url` is used when set). Their `auto-provision`, `default-roles`, `hd` and `deny-redirect` are no longer acted on. A factors entry or an account's `allowedAuthMethods` naming `google-oidc` still applies to `oidc:google`.
- A provider with no `ngdpbase.auth.factors` entry is offered as a primary sign-in method at AAL1.

## Providers

Each provider's own page says what its preset fills, how to register the site with it, its configuration entry, and what is particular to it:

- [Google](OidcAuthProvider-Google.md) — `preset: "google"`; also the old `ngdpbase.auth.google-oidc.*` keys
- [Microsoft](OidcAuthProvider-Microsoft.md) — `preset: "microsoft"`, personal Microsoft accounts only; never creates accounts
- [Apple](OidcAuthProvider-Apple.md) — `preset: "apple"`; a client secret the site signs, and a POSTed callback
- [authentik](OidcAuthProvider-Authentik.md) — no preset; its own issuer, with the trailing slash

Any other issuer that publishes discovery works the same way as authentik: set `issuer` exactly as its discovery document states it.

## See Also

- [BaseAuthProvider](BaseAuthProvider.md) — the contract
- [Google](OidcAuthProvider-Google.md), [Microsoft](OidcAuthProvider-Microsoft.md), [Apple](OidcAuthProvider-Apple.md), [authentik](OidcAuthProvider-Authentik.md) — each provider
- [AuthManager](../managers/AuthManager.md) — the one door
- [authentication developer guide](../guides/authentication-developer-guide.md)
- [planning/authentication.md](../planning/authentication.md#external-identity-providers-decided-2026-10-10) — the decisions
