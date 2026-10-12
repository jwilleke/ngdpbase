---
name: OidcAuthProvider
description: Sign-in through any outside OpenID Connect provider, by an identity connected to the account
dateModified: '2026-10-12'
category: providers
code: src/providers/OidcAuthProvider.ts
---

# OidcAuthProvider

Signs people in through an outside OpenID Connect provider (Google, Apple, personal Microsoft accounts, a self-hosted authentik, any issuer that publishes discovery). One class; AuthManager registers one instance per enabled entry of `ngdpbase.auth.oidc.providers`, with the id `oidc:<name>` ([#1743](https://github.com/jwilleke/ngdpbase/issues/1743)). Routes never call it: they call AuthManager.

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
- PKCE (S256) and an OIDC `nonce`; the code is exchanged with the verifier and the client secret (`client_secret_basic`, or `client_secret_post` when the issuer takes only that). For Apple the client secret is a JWT the site signs for each exchange (below).
- The ID token's signature against the issuer's published keys (`jose`), `iss` (the configured issuer; Google's scheme-less `accounts.google.com` is also accepted), `aud` = the client id, `azp` when there are several audiences, `exp`, and `nonce`.
- The discovery document's `issuer` must equal the configured issuer (OIDC Discovery §4.3).

### Why a POSTed callback is relayed, not finished

Apple sends the person back with an auto-submitting form that POSTs the code and state from appleid.apple.com: a cross-site, top-level POST. Every cookie this site sets is `SameSite=Lax`, and browsers send Lax cookies on a cross-site top-level navigation only when its method is safe (GET). So the POST arrives with neither the session cookie nor `ngdp_oauth_state`. Finishing there would mean giving up the browser binding (#1630); and letting the session middleware see the POST would start a new session whose cookie replaces the person's own (signing them out, or losing a connection in progress).

The relay therefore runs before the session and CSRF middleware and does one thing: a 303 to the same callback as a GET, carrying only `code`, `state` and `error`. The GET is a top-level navigation, so the browser sends its Lax cookies with it, and every check above runs unchanged. The `user` field Apple adds on a first sign-in (the person's name) is dropped: it is unsigned and never identifies anyone. A forged POST gains nothing a forged link to the GET callback could not already do, and that is refused by the browser binding. The code appears in the URL, as in every other provider's code flow; it is single-use and bound to the PKCE verifier.

Discovery, the key set and the token exchange go through `guardedFetch` (#1133), so an issuer on the local network needs `ngdpbase.security.egress.allowed-ranges`. Discovery and keys are cached for an hour; the keys are fetched again once when a token names a key not in the set.

## Configuration

- `ngdpbase.auth.oidc.providers` — map of name → `{ preset, issuer, client-id, client-secret, enabled, display-name, auto-provision }`, and for `preset: "apple"` `{ team-id, key-id, private-key }` in place of `client-secret`. `preset: "google"`, `preset: "microsoft"` and `preset: "apple"` fill the issuer and name (below); any other issuer is set with `issuer`, exactly as its discovery document states it. `client-secret` and `private-key` must be environment references (`$NAME`); an entry with either written in literally is not registered. The map is `sensitive`, and secret-looking fields inside it (`client-secret`, `private-key`) are hidden from anyone without `secret-reveal`. The callback is `<base-url>/auth/oauth/<name>/callback`, so `ngdpbase.application.base-url` must be set explicitly.
- `ngdpbase.auth.oidc.auto-provision` — the instance ceiling for account creation, `false`. An entry's own `auto-provision` (default off) and `ngdpbase.application.registration` must also be true.
- The old `ngdpbase.auth.google-oidc.*` keys are read as the `google` entry when enabled and the map has none (its `callback-url` is used when set). Their `auto-provision`, `default-roles`, `hd` and `deny-redirect` are no longer acted on. A factors entry or an account's `allowedAuthMethods` naming `google-oidc` still applies to `oidc:google`.
- A provider with no `ngdpbase.auth.factors` entry is offered as a primary sign-in method at AAL1.

## Presets

- `google` — issuer `https://accounts.google.com`, named Google.
- `microsoft` — personal Microsoft accounts (Outlook.com, Hotmail, Xbox, Skype) only: the `consumers` tenant, issuer `https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0`, named Microsoft. Work and school accounts are not included. Register the app in the Microsoft Entra admin center for personal Microsoft accounts, with the callback below as a Web redirect URI, and use its client secret through an environment reference.
  - Microsoft's subject is different for each registered app, so the identity belongs to this site's registration: registering a new app means people connect again.
  - Microsoft sends an `email` but no `email_verified`, and an email counts as verified only when the provider says so. So the email is never kept: a Microsoft sign-in never creates an account (whatever `auto-provision` says), and the email step shows no address. People sign in another way once and connect Microsoft, or connect it from their profile.

- `apple` — Sign in with Apple: issuer `https://appleid.apple.com`, named Apple. It differs from the others in three ways:
  - __The client secret is signed by the site.__ Instead of `client-secret`, the entry has `team-id`, `key-id` and `private-key`. For each code exchange the provider signs a JWT (ES256, header `kid` = the key id; `iss` = the team id, `sub` = the client id, `aud` = `https://appleid.apple.com`, valid 5 minutes) with that key and sends it as `client_secret` (`client_secret_post`, the only method Apple's discovery lists). An entry whose key is missing, written in literally, or not an EC P-256 key is not registered.
  - __The callback is POSTed__ (`response_mode=form_post`, which Apple requires when the email scope is asked for), relayed as described above.
  - __`email_verified` may be the string `"true"` or `"false"`__; only true, string or boolean, counts. A private-relay address (`…@privaterelay.appleid.com`, `is_private_email`) is a real, verified address that forwards to the person, and is treated like any other. The name Apple sends on the first sign-in is ignored.
  - Apple's subject is stable for one developer team, so moving the Services ID to another team means people connect again.

## Apple

Apple's preset fills the issuer; the operator registers the site with Apple. In the Apple Developer account (Certificates, Identifiers & Profiles):

- Create an __App ID__ with __Sign in with Apple__ enabled (it may be one used only for this), then a __Services ID__ grouped under it. The Services ID's identifier (for example `org.example.site`) is the `client-id`.
- In the Services ID's Sign in with Apple configuration, add the site's domain and the return URL `<base-url>/auth/oauth/apple/callback` (with `<name>` = `apple`, or the entry's name). Apple accepts only `https` addresses on a real domain, not `localhost` or an IP address.
- Under __Keys__, create a key with __Sign in with Apple__ enabled for that App ID, and download the `.p8` file. Apple lets you download it once. Note its __Key ID__.
- The __Team ID__ is on the account's Membership details page.
- Put the `.p8` file's contents in the environment, never in configuration. A multi-line value in quotes works in `.env`; so does one line with `\n` where the line breaks were.

```json
"ngdpbase.auth.oidc.providers": {
  "apple": {
    "preset": "apple",
    "client-id": "org.example.site",
    "team-id": "<Team ID>",
    "key-id": "<Key ID>",
    "private-key": "$APPLE_PRIVATE_KEY",
    "enabled": true
  }
}
```

- Apple must be reachable through the outbound guard (it is on the public internet, so it is by default).
- `auto-provision` may be turned on for Apple: it reports verified email, including private-relay addresses.

## authentik

There is no preset: each authentik has its own issuer, one per application. In authentik:

- Create an __OAuth2/OpenID Provider__: client type __Confidential__; redirect URI `<base-url>/auth/oauth/<name>/callback`, with `<name>` the entry's name below (strict match); scopes `openid`, `email` and `profile`; a signing key, so ID tokens are signed with RS256.
- Create an __Application__ that uses that provider. Its slug is part of the issuer.
- Copy the client ID, and put the client secret in the environment (`AUTHENTIK_CLIENT_SECRET` here), never in configuration.

The issuer is `https://<authentik-host>/application/o/<application-slug>/`, __with the trailing slash__: authentik's discovery document names it that way, and the configured issuer must match it exactly, or the sign-in is refused. The provider page in authentik shows it as the OpenID Configuration Issuer.

```json
"ngdpbase.auth.oidc.providers": {
  "authentik": {
    "issuer": "https://auth.example.org/application/o/ngdpbase/",
    "client-id": "<client id from authentik>",
    "client-secret": "$AUTHENTIK_CLIENT_SECRET",
    "display-name": "Family sign-in",
    "enabled": true
  }
}
```

- When authentik is on the local network, its address range must be in `ngdpbase.security.egress.allowed-ranges`, or discovery, keys and the code exchange are refused by the outbound guard.
- authentik's groups give no roles here: roles come from this site's own role assignments only.
- Whether authentik marks an email verified depends on its property mappings; without `email_verified: true` the email is not kept, as for any provider.

## See Also

- [BaseAuthProvider](BaseAuthProvider.md) — the contract
- [AuthManager](../managers/AuthManager.md) — the one door
- [authentication developer guide](../guides/authentication-developer-guide.md)
- [planning/authentication.md](../planning/authentication.md#external-identity-providers-decided-2026-10-10) — the decisions
