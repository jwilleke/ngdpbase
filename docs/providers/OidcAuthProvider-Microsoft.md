---
name: OidcAuthProvider-Microsoft
description: Sign in with a personal Microsoft account — the microsoft preset of OidcAuthProvider, and how to register the site in Microsoft Entra
dateModified: '2026-10-12'
category: providers
code: src/providers/OidcAuthProvider.ts
---

# Sign in with Microsoft

Microsoft is the `microsoft` preset of [OidcAuthProvider](OidcAuthProvider.md), for __personal Microsoft accounts only__ (Outlook.com, Hotmail, Live, Xbox, Skype) ([#1743](https://github.com/jwilleke/ngdpbase/issues/1743)). Work and school accounts are not included. What an outside sign-in may do, and what every flow checks, is on [OidcAuthProvider](OidcAuthProvider.md).

## What the preset fills

- Issuer `https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0`: the `consumers` tenant, as its discovery document names it.
- Name __Microsoft__ on the sign-in page and the profile (`display-name` overrides it), with the Microsoft icon (`fab fa-microsoft`; `icon` overrides it).

## Registering the site in Microsoft Entra

In the [Microsoft Entra admin center](https://entra.microsoft.com/) (or the Azure portal), under __App registrations__:

- 1 __New registration__. Give it the name people will see when they sign in.
- 2 Supported account types: __Personal Microsoft accounts only__. The preset's issuer is the personal-accounts tenant, so a registration for any other audience will not match it.
- 3 Redirect URI: platform __Web__, address `<base-url>/auth/oauth/microsoft/callback`, where `<base-url>` is `ngdpbase.application.base-url` exactly. Not the Single-page application platform: the site exchanges the code from the server, with a secret.
- 4 Copy the __Application (client) ID__ from the overview: it is the `client-id`.
- 5 Under __Certificates & secrets__, add a __client secret__ and copy its __Value__ (not its Secret ID) into the environment (`MICROSOFT_CLIENT_SECRET` here), never into configuration. Microsoft shows the value once.
- 6 No API permissions need adding: the site asks only for `openid` and `email`.

`ngdpbase.application.base-url` must be set explicitly: without it there is no callback address, and the entry is not registered.

## Configuration

```json
"ngdpbase.auth.oidc.providers": {
  "microsoft": {
    "preset": "microsoft",
    "client-id": "<Application (client) ID>",
    "client-secret": "$MICROSOFT_CLIENT_SECRET",
    "enabled": true
  }
}
```

- The entry's name (`microsoft` here) is the `<name>` in its URLs, so it must match the redirect URI registered in Entra.
- `client-secret` must be an environment reference (`$NAME`); an entry with the secret written in literally is not registered.
- `auto-provision` does nothing for Microsoft (below).

## Microsoft's particulars

- __No verified email, so no account creation.__ Microsoft sends an `email` but no `email_verified`, and an address counts as verified only when the provider says so. So a Microsoft address is never kept on the connection: a Microsoft sign-in never creates an account, whatever `auto-provision` says, and the email step says "Sign in to connect your Microsoft account" with no address. People sign in another way once and confirm the connection, or connect Microsoft from their profile.
- __The subject belongs to this registration.__ Microsoft gives each registered app a different subject for the same person, so a connection is tied to this site's registration: registering a new app means people connect again.
- __Client secrets expire.__ Entra sets an expiry on each secret (up to two years). When it lapses, the code exchange fails and nobody can sign in with Microsoft; add a new secret and update the environment before then.
- Microsoft is on the public internet, so the outbound guard allows it without configuration.

## Counting Microsoft's second factor

- `"trust-mfa": true` on the entry is the switch ([#1633](https://github.com/jwilleke/ngdpbase/issues/1633); `"amr": ["trust"]` in `ngdpbase.auth.factors` does nothing). Personal-account ID tokens sometimes carry `amr` (such as `pwd`, `mfa`) and sometimes not, so with `trust-mfa` a Microsoft sign-in counts above AAL1 only when that sign-in reported multi-factor (AAL2, or AAL3 when it reports a hardware key with a second factor or user verification). Plan for AAL1; the sign-in's audit record (`metadata.reported`) shows what Microsoft sent.

## See Also

- [OidcAuthProvider](OidcAuthProvider.md) — what an outside sign-in may do, the flows and the checks
- [Authentication developer guide](../guides/authentication-developer-guide.md)
- [Google](OidcAuthProvider-Google.md), [Apple](OidcAuthProvider-Apple.md), [authentik](OidcAuthProvider-Authentik.md)
