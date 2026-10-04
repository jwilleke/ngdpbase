---
name: PasskeyAuthProvider
description: Passkeys (WebAuthn) on @simplewebauthn/server — a passkey alone signs a person in at AAL2, phishing-resistant, tied to the base-url host (#448)
dateModified: '2026-10-03'
category: providers
code: src/providers/PasskeyAuthProvider.ts
---

# PasskeyAuthProvider

__Module:__ `src/providers/PasskeyAuthProvider.ts`
__Implements:__ [AuthProvider](BaseAuthProvider.md)

Passkeys, on `@simplewebauthn/server` directly ([#448](https://github.com/jwilleke/ngdpbase/issues/448)). A passkey alone signs a person in: AAL2, phishing-resistant (`amr: ["swk", "user"]`, `acr: "phr"`).

- __Where it works:__ the relying party is the host of `ngdpbase.application.base-url`, never the request. [AuthManager](../managers/AuthManager.md) registers the provider only when that is set explicitly and is `https` (or `localhost`, where browsers allow WebAuthn), and `ngdpbase.auth.passkey.enabled` is not `false`. A passkey works only on that hostname, so a site answering on several hostnames should redirect the others to it.
- __Where passkeys are kept:__ the credentials store ([FileCredentialsProvider](FileCredentialsProvider.md)), kind `passkey`. The subject is the credential id; the secret holds the public key, signature counter, transports, device type and whether it is backed up (synced). No private key ever reaches the server.
- __Enrolling__ (signed in, `account-security`): `GET /auth/passkey/register/options`, then `POST /auth/passkey/register/verify`. User verification and a discoverable key are required; an authenticator already enrolled is excluded.
- __Names__ (operator, 2026-10-04): every passkey needs a name, so two can be told apart when one has to go. The profile pre-fills it from the browser and the kind of device ("Chrome on Mac", "Safari on iPhone"); Chromium on a phone may report its model ("Chrome on Pixel 8"). Browsers never reveal a device's own name. An empty name is refused in the browser and by `AuthManager` (`credentialLabel`). Each row on Profile → Sign-in methods can be renamed (`POST /profile/credentials/:id/rename`, audited as `credential-rename`); the store re-signs the row.
- __Signing in__ (anyone): `GET /auth/passkey/authenticate/options`, then `POST /auth/passkey/authenticate/verify`. No username is asked; the credential id names the passkey. A counter that does not move forward fails, as does an assertion for another host or another challenge. A success takes the same steps as every sign-in path: new session id, identity, `req.session.signIn`, the password-change generation, audit.
- __The challenge__ is kept in the session: single-use, five minutes, tied to its purpose, so an enrolment challenge cannot be spent on a sign-in.
- __Browser:__ `public/js/passkey.js`, shown only where `window.PublicKeyCredential` exists.
- __Private stores:__ a passkey sign-in does not unlock an encrypted vault, since that key is wrapped with the password; the vault's own unlock page still works.
