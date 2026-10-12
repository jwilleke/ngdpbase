---
name: OidcAuthProvider-Authentik
description: Sign in through a self-hosted authentik — an OidcAuthProvider entry with its own issuer (no preset), and how to set it up in authentik
dateModified: '2026-10-12'
category: providers
code: src/providers/OidcAuthProvider.ts
---

# Sign in with authentik

A self-hosted [authentik](https://goauthentik.io/) is an ordinary [OidcAuthProvider](OidcAuthProvider.md) entry ([#1743](https://github.com/jwilleke/ngdpbase/issues/1743)). What an outside sign-in may do, and what every flow checks, is on [OidcAuthProvider](OidcAuthProvider.md). This is interactive sign-in for people; a headless client presenting an authentik token on the API is [AuthentikBearerAuthProvider](AuthentikBearerAuthProvider.md).

## No preset

Each authentik has its own issuer, one per application, so there is no preset: the entry sets `issuer` itself, and is named on the sign-in page by its `display-name` (or, without one, by the entry's name), with a generic sign-in icon unless `icon` sets one.

## Setting it up in authentik

- 1 Create an __OAuth2/OpenID Provider__: client type __Confidential__; redirect URI `<base-url>/auth/oauth/<name>/callback`, with `<name>` the entry's name below (strict match); scope mappings including `openid` and `email` (the site asks for those two); and a __signing key__, so ID tokens are signed with RS256. Without a signing key the tokens cannot be checked against the published keys, and every sign-in is refused.
- 2 Create an __Application__ that uses that provider. Its slug is part of the issuer.
- 3 Copy the client ID, and put the client secret in the environment (`AUTHENTIK_CLIENT_SECRET` here), never in configuration.

The issuer is `https://<authentik-host>/application/o/<application-slug>/`, __with the trailing slash__: authentik's discovery document names it that way, and the configured issuer must match it exactly, or the sign-in is refused. The provider page in authentik shows it as the OpenID Configuration Issuer.

`ngdpbase.application.base-url` must be set explicitly: without it there is no callback address, and the entry is not registered.

## Configuration

```json
"ngdpbase.auth.oidc.providers": {
  "authentik": {
    "issuer": "https://auth.example.org/application/o/ngdpbase/",
    "client-id": "<client id from authentik>",
    "client-secret": "$AUTHENTIK_CLIENT_SECRET",
    "display-name": "Shared family sign-in",
    "icon": "https://auth.example.org/static/dist/assets/icons/icon.png",
    "enabled": true
  }
}
```

- The entry's name (`authentik` here) is the `<name>` in its URLs: lowercase letters, digits and hyphens.
- `display-name` is the button's text, after "Sign in with": plain words people recognise, not a host name.
- `icon` is the picture left of it: here the authentik's own icon, by its `https://` address. A site path (`/…`) or a Font Awesome name (`fa-users`) also works; see [OidcAuthProvider](OidcAuthProvider.md#configuration).
- `client-secret` must be an environment reference (`$NAME`); an entry with the secret written in literally is not registered.

## authentik's particulars

- __The trailing slash matters__ (above). Discovery is fetched from the issuer with any trailing slash removed, then `/.well-known/openid-configuration`, which is where authentik serves it.
- __On the local network, allow it.__ When authentik is on a private address, its range must be in `ngdpbase.security.egress.allowed-ranges`, or discovery, keys and the code exchange are refused by the outbound guard.
- __Groups give no roles.__ authentik's groups and roles claims are never read: roles come from this site's own role assignments only.
- __Verified email depends on the property mappings.__ Whether authentik marks an email verified depends on its scope mappings; without `email_verified: true` (a boolean) the address is not kept, the email step shows none, and no account is created, as for any provider.
- __The issuer is part of every connection.__ A connected identity is recorded as issuer + subject, so changing the application's slug (and with it the issuer) means people connect again.

## See Also

- [OidcAuthProvider](OidcAuthProvider.md) — what an outside sign-in may do, the flows and the checks
- [AuthentikBearerAuthProvider](AuthentikBearerAuthProvider.md) — authentik tokens on the API, for headless clients
- [Authentication developer guide](../guides/authentication-developer-guide.md)
- [Google](OidcAuthProvider-Google.md), [Microsoft](OidcAuthProvider-Microsoft.md), [Apple](OidcAuthProvider-Apple.md)
