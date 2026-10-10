---
name: Authentication developer guide
description: How sign-in works and how to change it — AuthManager as the one door, sign-in factors and levels (AAL), per-role required levels and what happens when one cannot be reached, step-up, sessions ending, and adding a sign-in provider
dateModified: 2026-10-10
category: guides
relatedModules: [AuthManager, UserManager, PolicyDecisionPoint, OidcManager]
---

# Authentication developer guide

What a developer has to know to change how people sign in. Who may do what once signed in is [security-developer-guide.md](security-developer-guide.md); the design history, open plans and YourPHR's needs are in [planning/authentication.md](../planning/authentication.md).

## Standing rules

- __AuthManager is the one door.__ Routes call `AuthManager`, never a provider. Every sign-in method is a registered `AuthProvider` (`registerProvider`), so a new method is a provider, not a route.
- __What is offered is configuration.__ `ngdpbase.auth.factors` lists the methods a site offers, one entry per provider: `authproviderid`, `primary` (can start a sign-in), `amr` / `aal` / `acr`, `enabled`. Configuration may lower what a provider's code declares, never raise it. `getFactors()` is what is available; `assess(factors)` what a set of satisfied factors amounts to, by NIST SP 800-63B: an email link never lifts a sign-in above AAL1, and only WebAuthn is phishing-resistant.
- __The session records how it signed in.__ Every sign-in path writes `req.session.signIn` (`signInRecord()`): the provider, each factor with its time, and `amr` / `aal` / `acr`. Step-up and UserInfo read it there. A delegated credential (agent token, share, app token) never starts a session and never satisfies step-up.
- __What is required is per role.__ Each role in `ngdpbase.roles.definitions` may carry `required-aal` (1–3). A person must meet the highest among their roles. `admin` and `user-admin` ship at 2; every other role at 1; `anonymous` has none.
- __A role above the sign-in steps down; nobody is locked out.__ In a session signed in below a role's level, the person acts without that role (`rolesAtSignIn`) and a banner says how to get it back. `profile-manage` and `account-security` stay, so the profile, where a passkey is added, is always reachable. When the level cannot be reached at all, see the next section.
- __Sensitive actions ask for a fresh sign-in.__ A permission entry marked `"step-up": true` needs a factor satisfied within `ngdpbase.auth.step-up.max-age-minutes` (5) at the level the person's roles require. The PDP decides it inside `hasPermission`; a control's visibility asks `holdsPermission`, which leaves step-up out ([#1635](https://github.com/jwilleke/ngdpbase/issues/1635)). An add-on marks its own permission the same way, in its `config/default-config.json`: permission definitions merge per entry, so it neither touches core's list nor another add-on's.
- __Every way a session ends goes through one door:__ `endSession()` in `src/utils/sessionEnd.ts` drops the session's private-store keys and records `authentication-logout` with the reason ([#1670](https://github.com/jwilleke/ngdpbase/issues/1670)).
- __Passwords:__ scrypt at N=2^17, hashed off the request path (async), and re-hashed at the current cost on the next sign-in ([#1632](https://github.com/jwilleke/ngdpbase/issues/1632)). The minimum length is `ngdpbase.user.security.password-min-length` (6).

## When a role's level cannot be reached

Operator rule (2026-10-08): __whenever there is no way to reach AAL2, AAL1 must be set__ — and the person is told, until they fix it, what to add.

| Situation | What a password sign-in gets | Where |
| --- | --- | --- |
| The site offers no AAL2 method (no explicit https `base-url`, so no passkeys), and the level is the shipped default | The roles, at AAL1. AuthManager reports `degraded` and says how to fix it | `effectiveLevels()`, [#448](https://github.com/jwilleke/ngdpbase/issues/448) |
| The site offers no AAL2 method, and the operator set the level in `app-custom-config.json` | The boot refuses and names the role | `checkRequiredAal()`, [#1523](https://github.com/jwilleke/ngdpbase/issues/1523) |
| The account's `allowedAuthMethods` exclude every AAL2 method | The roles, at AAL1 | `aalReachFor()`, [#1690](https://github.com/jwilleke/ngdpbase/issues/1690) |
| The account is allowed a passkey but has not enrolled one | The roles, at AAL1 — and a red banner on every page, which cannot be dismissed, saying to add a passkey, until one is | `rolesAwaitingEnrolment()`, [#1690](https://github.com/jwilleke/ngdpbase/issues/1690) |
| The account has an AAL2 method it can use | Roles above AAL1 step down for this session; the banner offers the passkey sign-in | `rolesAtSignIn()`, [#448](https://github.com/jwilleke/ngdpbase/issues/448) |

`aalReachFor(username)` gives `{ now, ifEnrolled }`: what the account's allowed, offered and (for a passkey) enrolled factors reach, and what they would reach once enrolled — both at least 1. `now` is carried on the request subject as `aalCap` and caps the level everywhere it is enforced: `rolesAtSignIn`, `requiredAalFor`, `stepUpNeeded` and the re-auth page. A factor that has to be enrolled before it counts is listed in `ENROLLED_FACTORS` in `AuthManager.ts`.

## Checklist for a new sign-in provider or factor

1. Write it as an `AuthProvider` and register it with `AuthManager.registerProvider` (an add-on registers it at load). No route calls it directly.
2. Declare its `amr`, `aal` and `acr` honestly, by SP 800-63B. Configuration can lower them; nothing can raise them.
3. Add it to `ngdpbase.auth.factors` (shipped, or in the add-on's `config/default-config.json`), with `primary` set only if it can start a sign-in on its own.
4. If it must be enrolled before it counts (a key, an app), add it to `ENROLLED_FACTORS`, store its rows through the credentials store, and offer enrolment on the profile's sign-in methods.
5. Its sign-ins produce a `signInRecord`, and success and failure are audited (`authentication-success` / `authentication-failed`) through `AuditManager.logAuthentication`.
6. Tests: the assessed level with and without it; a role at AAL2 kept or stepped down as the table above says; the audit records written. Sabotage each once.

## How you know you are done

- `npm test -- src/managers/__tests__/AuthManager.test.ts src/security/__tests__/PolicyDecisionPoint.stepUp.test.ts src/utils/__tests__/sessionEnd.test.ts`
- `npm run lint:audit` and `npm run lint:permissions` when a permission, its `step-up` flag or an audit event changed
- `npm run test:e2e`: the auth setup signs in, upgrades to a passkey where one is allowed, and every admin spec runs

## See also

- [managers/AuthManager.md](../managers/AuthManager.md) — the methods
- [planning/authentication.md](../planning/authentication.md) — decisions, plans, prior art, YourPHR
- [security-developer-guide.md](security-developer-guide.md) — permissions once signed in
- [security-posture.md](../security-posture.md)

## Known gaps

- [#1748](https://github.com/jwilleke/ngdpbase/issues/1748) — two accounts can share an email, and a magic link signs into whichever comes first. Until it's fixed, nothing new may look a person up by email. The rule it brings: one email, one account, never optional, and a duplicate always raises an admin alert
- [#1745](https://github.com/jwilleke/ngdpbase/issues/1745) — an add-on route that refuses a step-up permission answers a bare 403 (`ApiContext.requirePermission`), with no way to re-authenticate as core routes give
- [#1522](https://github.com/jwilleke/ngdpbase/issues/1522) — multi-factor epic: TOTP ([#421](https://github.com/jwilleke/ngdpbase/issues/421)), device authorization ([#1526](https://github.com/jwilleke/ngdpbase/issues/1526)), link-based second factor ([#1532](https://github.com/jwilleke/ngdpbase/issues/1532))
- [#1743](https://github.com/jwilleke/ngdpbase/issues/1743) — sign-in through any OpenID Connect provider; Google is the only outside login provider today (Cloudflare Access and the authentik bearer are not login providers; see the planning doc). The decided design is in [planning/authentication.md](../planning/authentication.md#external-identity-providers-decided-2026-10-10)
- [#1545](https://github.com/jwilleke/ngdpbase/issues/1545) — account recovery
- [#1594](https://github.com/jwilleke/ngdpbase/issues/1594) — strong sign-ins unlock private stores
- [#1633](https://github.com/jwilleke/ngdpbase/issues/1633) — an outside provider's own second factor counts toward AAL2
