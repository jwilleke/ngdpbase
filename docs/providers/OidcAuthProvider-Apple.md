---
name: OidcAuthProvider-Apple
description: Sign in with Apple — the apple preset of OidcAuthProvider, its signed client secret and POSTed callback, and how to register the site with Apple
dateModified: '2026-10-12'
category: providers
code: src/providers/OidcAuthProvider.ts
---

# Sign in with Apple

Apple is the `apple` preset of [OidcAuthProvider](OidcAuthProvider.md) ([#1743](https://github.com/jwilleke/ngdpbase/issues/1743) slice 4b). What an outside sign-in may do, and what every flow checks, is on [OidcAuthProvider](OidcAuthProvider.md). Built against Apple's published discovery document and documentation; not yet tried with a real Apple sign-in.

## What the preset fills

- Issuer `https://appleid.apple.com`.
- Name __Apple__ on the sign-in page and the profile (`display-name` overrides it), with the Apple icon (`fab fa-apple`; `icon` overrides it).
- A client secret the site signs itself, in place of `client-secret` (below).
- `response_mode=form_post`: Apple POSTs the callback (below).
- `email_verified` read as a string as well as a boolean (below).

## Registering the site with Apple

In the Apple Developer account (Certificates, Identifiers & Profiles):

- 1 Create an __App ID__ with __Sign in with Apple__ enabled (it may be one used only for this), then a __Services ID__ grouped under it. The Services ID's identifier (for example `org.example.site`) is the `client-id`.
- 2 In the Services ID's Sign in with Apple configuration, add the site's domain and the return URL `<base-url>/auth/oauth/apple/callback` (`apple` being the entry's name). Apple accepts only `https` addresses on a real domain, not `localhost` or an IP address.
- 3 Under __Keys__, create a key with __Sign in with Apple__ enabled for that App ID, and download the `.p8` file. Apple lets you download it once. Note its __Key ID__.
- 4 The __Team ID__ is on the account's Membership details page.
- 5 Put the `.p8` file's contents in the environment (`APPLE_PRIVATE_KEY` here), never in configuration. A multi-line value in quotes works in `.env`; so does one line with `\n` where the line breaks were.

`ngdpbase.application.base-url` must be set explicitly: without it there is no callback address, and the entry is not registered.

## Configuration

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

- An entry with no `team-id` or `key-id`, a `private-key` written in literally, a key that is not PEM, or a key that is not EC P-256 is not registered, and the log says which.
- `auto-provision` may be turned on for Apple: it reports verified email, including private-relay addresses.

## Apple's particulars

- __The client secret is signed by the site.__ For each code exchange the provider signs a JWT with the key (ES256, header `kid` = the key id; `iss` = the team id, `sub` = the client id, `aud` = `https://appleid.apple.com`, valid 5 minutes) and sends it as `client_secret` in the form (`client_secret_post`, the only method Apple's discovery lists). Nothing long-lived leaves the server.
- __The callback is POSTed__ (`response_mode=form_post`, which Apple requires when the email scope is asked for). The POST arrives without this site's cookies, so it is relayed to the ordinary GET callback before the session and CSRF middleware see it; [OidcAuthProvider](OidcAuthProvider.md#why-a-posted-callback-is-relayed-not-finished) says why and how.
- __`email_verified` may be the string `"true"` or `"false"`__; only true, string or boolean, counts.
- __Private relay addresses are real.__ A `…@privaterelay.appleid.com` address is verified and forwards to the user; it is treated like any other address. It will not match an address the user gave this site directly.
- __The name is ignored.__ Apple sends the user's name only on the first sign-in, as an unsigned `user` field; the relay drops it.
- __The subject is per developer team.__ Moving the Services ID to another team means users connect again.
- Apple is on the public internet, so the outbound guard allows it without configuration.

## Counting Apple's second factor

- `"trust-mfa": true` on the entry is the switch ([#1633](https://github.com/jwilleke/ngdpbase/issues/1633); `"amr": ["trust"]` in `ngdpbase.auth.factors` does nothing). Apple's ID tokens carry no `amr` or `acr`, although Apple accounts use two-factor authentication, so even with `trust-mfa` an Apple sign-in is AAL1.

## See Also

- [OidcAuthProvider](OidcAuthProvider.md) — what an outside sign-in may do, the flows and the checks
- [Authentication developer guide](../guides/authentication-developer-guide.md)
- [Google](OidcAuthProvider-Google.md), [Microsoft](OidcAuthProvider-Microsoft.md), [authentik](OidcAuthProvider-Authentik.md)
