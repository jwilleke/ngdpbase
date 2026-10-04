---
name: OidcBearerAuthProvider
description: Accepts access tokens from this instance's own OpenID Connect provider on ngdpbase's API, as a delegation from the person (#1576)
dateModified: '2026-10-04'
category: providers
code: src/providers/OidcBearerAuthProvider.ts
---

# OidcBearerAuthProvider

Lets an app that a person allowed through `/oidc` call ngdpbase's own API with its access token ([#1576](https://github.com/jwilleke/ngdpbase/issues/1576)). Registered by [AuthManager](../managers/AuthManager.md) when `oidc-auth-server.enabled` is true; verification is [OidcManager](../managers/OidcManager.md)'s, in process.

- __Audience:__ the token must name `<base-url>/api`. An app asks for it with `resource=<base-url>/api` when it starts the sign-in. A token for any other audience, or bound to a key (DPoP, mTLS), is refused.
- __Scopes are permission names__ (`page-read`, `page-edit`, …), the vocabulary agent tokens use. The API offers every defined permission except what a delegation may never carry: `admin-*` and `token-mint` (`src/utils/delegation.ts`, shared with agent tokens). The person sees them on the consent page.
- __A delegation, not a grant:__ the scopes ride on `viaToken` (`id: oidc:<grant>`, the app's name), so the PDP ceiling and the edge gate (#1173) bound the token exactly as they bound an agent token. Authority is the person's, resolved live: a scope the person no longer holds does nothing.
- __Sign-in level:__ the token carries how the person signed in. Roles above that level step down for the request, as in a web session (#1569). `acr` maps to AAL as `aal1`→1, `aal2`→2, `aal3`→3, `phr`/`phrh`→2 (conservative).
- __Fails closed__ when the token is unknown or expired, the account is disabled, or the password changed after the sign-in (#1592).

The bearer middleware tries every provider that declares `acceptsBearer`, in registration order: Authentik, agent tokens, then this one.
