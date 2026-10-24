---
name: OidcAuthProvider-Google
description: Sign in with Google — the google preset of OidcAuthProvider, and how to register the site with Google
dateModified: '2026-10-12'
category: providers
code: src/providers/OidcAuthProvider.ts
---

# Sign in with Google

Google is the `google` preset of [OidcAuthProvider](OidcAuthProvider.md): the same provider as every other outside sign-in, with Google's issuer filled in ([#1743](https://github.com/jwilleke/ngdpbase/issues/1743)). It replaced the retired `GoogleOIDCProvider`; the URLs `/auth/oauth/google` and `/auth/oauth/google/callback` are unchanged. What an outside sign-in may do, and what every flow checks, is on [OidcAuthProvider](OidcAuthProvider.md).

## What the preset fills

- Issuer `https://accounts.google.com`.
- Name __Google__ on the sign-in page and the profile (`display-name` overrides it), with Google's logo as its icon (`icon` overrides it).
- Nothing else: the client id and secret come from Google (below).

## Registering the site with Google

In the [Google Cloud console](https://console.cloud.google.com/), in a project of your own:

- 1 Set up the __OAuth consent screen__ (in newer consoles, __Google Auth Platform__: Branding, Audience). User type __External__ unless every user is in your own Google Workspace. Give the app name and support email users will see when they sign in. The site asks only for `openid` and `email`, which need no verification by Google.
- 2 While the app's publishing status is __Testing__, only the test users listed there can sign in. Publish it (In production) when everyone should be able to.
- 3 Under __Credentials__ (or __Clients__), create an __OAuth client ID__ of type __Web application__.
- 4 Add the __Authorized redirect URI__ `<base-url>/auth/oauth/google/callback`, where `<base-url>` is `ngdpbase.application.base-url` exactly (scheme, host, port; no trailing slash). Google compares it character for character. No JavaScript origin is needed.
- 5 Copy the client ID, and put the client secret in the environment (`GOOGLE_CLIENT_SECRET` here), never in configuration.

`ngdpbase.application.base-url` must be set explicitly: without it there is no callback address, and the entry is not registered.

## Configuration

```json
"ngdpbase.auth.oidc.providers": {
  "google": {
    "preset": "google",
    "client-id": "<client id>.apps.googleusercontent.com",
    "client-secret": "$GOOGLE_CLIENT_SECRET",
    "enabled": true
  }
}
```

- The entry's name (`google` here) is the `<name>` in its URLs, so it must match the redirect URI registered with Google.
- `client-secret` must be an environment reference (`$NAME`); an entry with the secret written in literally is not registered, and the log says why.
- To let a Google sign-in create an account, set the entry's `"auto-provision": true` and also `ngdpbase.auth.oidc.auto-provision` and `ngdpbase.application.registration` (see [OidcAuthProvider](OidcAuthProvider.md#configuration)).

## Google's particulars

- __The issuer may come without its scheme.__ Google's ID tokens may name the issuer `accounts.google.com` instead of `https://accounts.google.com`; both are accepted. The connected identity is always recorded under `https://accounts.google.com`.
- __Google reports verified email__ (`email_verified` as a boolean), so its address is kept on the connection and shown in the email step, and account creation can work when it is turned on.
- __No domain restriction.__ The old `ngdpbase.auth.google-oidc.hd` setting is no longer acted on: any Google account can sign in once it is connected to an account here, and creating accounts depends only on the settings above.
- __The old keys still work.__ When `ngdpbase.auth.google-oidc.enabled` is true and `ngdpbase.auth.oidc.providers` has no `google` entry, `ngdpbase.auth.google-oidc.client-id`, `client-secret` and `callback-url` are read as the `google` entry. Their `auto-provision`, `default-roles`, `hd` and `deny-redirect` are not. A `google` entry in the map wins, and the old keys are then ignored with a warning. A factors entry or an account's `allowedAuthMethods` naming `google-oidc` still applies to `oidc:google`.
- Google is on the public internet, so the outbound guard allows it without configuration.

## Counting Google's second factor

- `"trust-mfa": true` on the entry is the switch ([#1633](https://github.com/jwilleke/ngdpbase/issues/1633); `"amr": ["trust"]` in `ngdpbase.auth.factors` does nothing). Google's ID tokens rarely carry `amr` or `acr`, even when the account uses 2-Step Verification, so with `trust-mfa` a Google sign-in is still almost always AAL1. Plan for AAL1; the sign-in's audit record (`metadata.reported`) shows what Google actually sent.

## See Also

- [OidcAuthProvider](OidcAuthProvider.md) — what an outside sign-in may do, the flows and the checks
- [Authentication developer guide](../guides/authentication-developer-guide.md)
- [Microsoft](OidcAuthProvider-Microsoft.md), [Apple](OidcAuthProvider-Apple.md), [authentik](OidcAuthProvider-Authentik.md)
