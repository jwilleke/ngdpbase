---
name: AuthManager
description: Pluggable authentication provider chain — registers AuthProviders and delegates authenticate/initiate calls
dateModified: '2026-05-28'
category: managers
code: src/managers/AuthManager.ts
---

# AuthManager

Registers one or more `AuthProvider` instances and delegates authenticate/initiate calls to the appropriate provider. Routes call only AuthManager — never individual providers directly. `ngdpbase.auth.factors` lists the sign-in methods offered, one entry per provider with the `amr` / `aal` / `acr` it gives; configuration may lower those values against what the provider's code declares, never raise them ([#1523](https://github.com/jwilleke/ngdpbase/issues/1523)). `getFactors()` returns the factors actually available, `assess()` what a set of satisfied factors amounts to (combined `amr`, AAL, `acr`, MFA), and a successful `authenticate()` reports the provider and the factors satisfied with their times. `signInRecord(result)` turns that into what the session keeps as `req.session.signIn` — provider, factors, `amr` / `aal` / `acr` / `mfa`, and when — on every sign-in path (password, magic link, Google, Cloudflare Access). Step-up (#1525) and UserInfo (#1529) read it there. A delegated credential never starts a session, so it never gets one. Signing in still uses one factor; the per-role `required-aal` check and the second-factor flow follow under #1523. The retired flat `ngdpbase.auth.required-factors` list is still read from custom config and converted, with a warning.

## Built-in Providers

- __PasswordAuthProvider__ — always registered.
- __MagicLinkAuthProvider__ — registered when `ngdpbase.auth.magic-link.enabled`.
- __GoogleOIDCProvider__ — when `ngdpbase.auth.google-oidc.enabled`.
- __CloudflareAccessAuthProvider__ — when `ngdpbase.auth.cloudflare-access.enabled`.
- __AuthentikBearerAuthProvider__ — when `ngdpbase.auth.authentik-bearer.enabled`; bearer JWTs for agent ingest.
- __AgentTokenAuthProvider__ — when `ngdpbase.auth.agent-token.enabled`; user-delegated agent tokens (#946).

Add-ons contribute more through `registerProvider()` (#1050).

## Planned

Multi-factor sign-in, step-up and device authorization are epic #1522; the order and open questions are in [planning/authentication.md](../planning/authentication.md).

## See Also

- Issue #396 — original AuthManager design
- [BaseAuthProvider](../providers/BaseAuthProvider.md) — the abstract contract
- [PasswordAuthProvider](../providers/PasswordAuthProvider.md), [MagicLinkAuthProvider](../providers/MagicLinkAuthProvider.md), [CloudflareAccessAuthProvider](../providers/CloudflareAccessAuthProvider.md), [GoogleOIDCProvider](../providers/GoogleOIDCProvider.md)

## Required assurance level per role (#1523, #448)

Each role in `ngdpbase.roles.definitions` may carry `required-aal` (1–3): the NIST level a sign-in must reach to act with that role. `admin` and `user-admin` ship at 2 (since passkeys); every other role at 1; `anonymous` has none.

- __Roles step down__ (decided 2026-10-03). In a session signed in below a role's level, the person acts without that role: `rolesAtSignIn(roles, signInAal, cap?)` splits the roles into kept and stepped down, and the session middleware sets the request's roles to the kept ones. A banner says which roles are off and offers "Sign in with your passkey" or "Add a passkey". A session from before sign-ins were recorded counts as AAL1.
- __No lockout:__ the `signed-in-self-service` policy grants `profile-manage` and `account-security` (#1525) to `vault-owner`, the role every account is given, so a person whose site role stepped down can still reach their profile and enrol a passkey.
- __Shipped default vs operator's level:__ a shipped level that no available factor reaches (no explicit https `base-url`, so no passkeys) acts at what is reachable, and AuthManager is `degraded` saying how to fix it. A level set in `app-custom-config.json` that no factor reaches refuses the boot (`checkRequiredAal()`, run by `app.ts` once add-ons have registered their providers). An operator's level is never lowered.
- __Per account, no way to AAL2 means AAL1__ ([#1690](https://github.com/jwilleke/ngdpbase/issues/1690), operator 2026-10-08). `aalCapFor(username)` is what the site's factors, narrowed to the account's `allowedAuthMethods` (none listed = all), reach — never below 1. It is computed where the request subject is built (session and bearer paths) and carried as `subject.aalCap`. A role never requires more than it: in `rolesAtSignIn`, `requiredAalFor`, `stepUpNeeded` and the re-auth page. So an account with no AAL2 method keeps its roles on a password sign-in; one that can reach AAL2 still steps down until it uses that method.
- `requiredAalFor(roles, cap?)` is the highest effective level among the roles; `reachableAal()` what the available factors reach together; `unreachableRequiredAal()` describes every role above it.

## Two-step sign-in (#1523)

A person who has enrolled a second factor signs in with their password __and__ one of their second factors. Everyone else signs in in one step, as before. Any enrolled second factor works; the first built is the email link (operator, 2026-10-04).

- __After the password__ (`processLogin`): if `secondFactorsFor(username)` offers anything, no session identity is set. `beginTwoStep()` holds a pending sign-in in AuthManager: never a provider, single-use, 10 minutes, bound to the browser by an HTTP-only `ngdp_two_step` cookie on `/login`. Private-store keys the password opened are held with it, and locked if it expires or is refused.
- __The email link__ (`sendEmailApproval`, one per minute): the link opens `/login/approve` on any device. Opening it changes nothing, because mail scanners open links; __Approve__ completes the factor, and __This wasn't me__ refuses the sign-in and counts as a failed one. The waiting page checks back (`/login/second-factor/status`) and finishes with `completeTwoStep()`. The session's sign-in then carries both factors (`amr: ["pwd","email"]`, still AAL1: email never raises it).
- __Enrolment__ (Profile → Sign-in methods, `account-security`, so step-up): `startEmailFactorEnrolment()` mails a link to the account's address, and the same signed-in person must open it, so a factor that cannot be satisfied never locks its owner out. The row is a credentials-store `email` row, removable like any other.
- __Availability__: an email link is offered only with mail configured and an explicit base-url. A factor that cannot work is never offered.

## Step-up (#1525)

A few permissions ask for a __fresh__ sign-in even inside a valid session, so a session left open on a shared machine can't change what protects the account or the instance. Each such permission is marked on its own entry in `ngdpbase.permissions.definitions` (#1638), and `ngdpbase.auth.step-up` holds only the window:

```json
"ngdpbase.permissions.definitions": { "config-manage": { "description": "…", "step-up": true } },
"ngdpbase.auth.step-up": { "max-age-minutes": 5 }
```

Shipped with `step-up: true`: `account-security`, `config-manage`, `secret-reveal`, `token-mint`. An add-on marks its own permissions the same way. A `permissions` list still set under `ngdpbase.auth.step-up` in a custom config (the shape before #1638) is honoured, with a warning naming where it moved.

- __Decided at the door__ (#1635): `PolicyDecisionPoint.decide()` applies step-up itself, so every door that asks the PDP — a route, `AuthManager`'s credential methods, `AgentTokenManager`, an add-on's `requirePermission` — gets it, and none can forget it. A granted permission whose sign-in is not fresh is refused with reason `step-up`; `WikiRoutes.permitted()` turns that into the `/auth/reauth` prompt. The request subject carries `signIn` for this. Work with no request (a `JobSubject`: timers, operator commands) is not asked. An affordance (show this button) asks `holds` — policy alone — so a person whose sign-in is not fresh still sees the way to the prompt.
- __Fresh__ (`stepUpNeeded`) means a factor satisfied within the window that reaches the level the person's roles require. An admin (AAL2) re-authenticates with a passkey; others with a passkey or their password. A known device never counts.
- __Delegated credentials__ (agent tokens, app tokens, shares) never satisfy step-up. They're refused outright, not sent to a prompt.
- __Everyday self-service__ (`profile-manage`) is never on the list, so viewing your pages or changing the theme never prompts (decided 2026-10-04).
- __Where it's checked__: inside the route's permission check (`permitted()` in WikiRoutes, and the few handlers that ask `hasPermission()` themselves). A page action goes to `/auth/reauth?next=…`; a JSON action answers 403 with `reauth`, which `passkey.js` follows.
- __The prompt__ (`/auth/reauth`) offers a passkey when one is enrolled, and the password when the roles accept one. Success adds the factor to the session's sign-in (`reauthenticated`: factors joined, assessment redone, sign-in time moved to now) and returns to the page. A POST is not replayed; the form is filled in again.
- __Audit and throttle__: `reauth-prompt`, `reauth-success` and `reauth-failure` are recorded. Wrong passwords count toward the sign-in throttle like every other secret check.

## Passkeys (#448)

[PasskeyAuthProvider](../providers/PasskeyAuthProvider.md) is registered once the credentials store is open, when `ngdpbase.application.base-url` is set explicitly and is https (or localhost), and `ngdpbase.auth.passkey.enabled` is not `false`. AuthManager owns the store and hands the provider only "find this passkey" and "record its use". The routes talk to `passkeyRegistrationOptions()`, `passkeyRegister()` and `passkeyAuthenticationOptions()`, and sign in through `authenticate('passkey', { webauthn })`. `passkeyRelyingParty()` names the host passkeys are tied to.

## Credentials store (#1524)

AuthManager is the only door to an account's credentials beyond its password: passkeys, TOTP, verified email/phone and known devices ([BaseCredentialsProvider](../providers/BaseCredentialsProvider.md), stored by [FileCredentialsProvider](../providers/FileCredentialsProvider.md)). Passwords stay on the user record and are never copied here.

- `listCredentials(ctx, username)`, `addCredential(ctx, username, input)`, `removeCredential(ctx, username, id)`. Your own credentials need `account-security` (#1525); anyone else's need `user-edit`; a signed-out caller is refused. Listings never include a secret. Adding and removing are audited (`user-edit`, action `credential-add` / `credential-remove`).
- __The last way in:__ removing a passkey or verified email is refused when the account would have no password and no other passkey or email left. TOTP and known devices are not ways in on their own, so they never count.
- __A row that does not verify__ (unsigned, signed with another key, edited) is ignored and raised: a `security-event` audit record (`credential-rejected`, severity `high`), an `error`-level admin notification (escalated by email when escalation is on), and AuthManager marked `degraded`, so `/admin` shows it until the store is put right.
- __It is kept, not dropped__ (#1633): the row stays in the file, unchanged, in quarantine, so a lost or changed `NGDPBASE_CREDENTIALS_KEY` costs no data. When the operator knows why the rows were rejected, `npx tsx scripts/retrust-credentials.ts --reason "…" --actor <name>` re-signs every well-formed quarantined row under the current key (a `security-event`, `credential-retrusted`, naming each row), then restart. Malformed rows and duplicates of a trusted credential stay quarantined. It is a server command on purpose: a web button that re-signs whatever is in the file would bless a planted row. If you do not know why rows were rejected, do not run it.
- __No key, no store:__ without `NGDPBASE_CREDENTIALS_KEY` the store stays closed and AuthManager is `degraded`. Boot normally generates the key into the instance `.env`.
