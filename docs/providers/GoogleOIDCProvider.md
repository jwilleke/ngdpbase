---
name: GoogleOIDCProvider
description: Retired — Google sign-in is now the generic OidcAuthProvider with the google preset
dateModified: '2026-10-11'
category: providers
code: src/providers/OidcAuthProvider.ts
---

# GoogleOIDCProvider

Retired in [#1743](https://github.com/jwilleke/ngdpbase/issues/1743). Google sign-in is now [OidcAuthProvider](OidcAuthProvider.md) with the `google` preset (`oidc:google`). The `ngdpbase.auth.google-oidc.*` keys still work, read as the `google` entry, and the URLs `/auth/oauth/google` and `/auth/oauth/google/callback` are unchanged.

Behaviour change: Google no longer finds an account by email or creates one. It signs in only a Google identity the person connected from their profile.
