# Authentication — planning

Where authentication in ngdpbase stands, what is planned, in what order, and which questions are still open. Gathered from the GitHub issues on 2026-10-01.

This is an index, not a second copy of the issues. Each issue holds its own design and the decisions recorded on it; this page says how they fit together. What `AuthManager` does today is [AuthManager.md](../managers/AuthManager.md) and the provider docs it links. How a request is authorised once someone is signed in is [security-posture.md](../security-posture.md) and [access-policies.md](../access-policies.md).

---

## Where it stands

`AuthManager` runs a chain of registered `AuthProvider`s, and routes talk only to the manager. Signing in uses __one factor__: `ngdpbase.auth.required-factors` is declared but not enforced as multi-factor.

Providers in the code (`src/providers/`):

- __Password__ (`PasswordAuthProvider`), always registered
- __Magic link__ (`MagicLinkAuthProvider`), [#396](https://github.com/jwilleke/ngdpbase/issues/396); passwordless registration [#1026](https://github.com/jwilleke/ngdpbase/issues/1026)
- __Google OIDC__ (`GoogleOIDCProvider`), [#447](https://github.com/jwilleke/ngdpbase/issues/447)
- __Cloudflare Access JWT__ (`CloudflareAccessAuthProvider`), [#649](https://github.com/jwilleke/ngdpbase/issues/649)
- __Authentik bearer JWT__ (`AuthentikBearerAuthProvider`), for agent ingest, [#818](https://github.com/jwilleke/ngdpbase/issues/818)
- __Agent tokens__ (`AgentTokenAuthProvider`), user-delegated scoped bearer credentials, [#946](https://github.com/jwilleke/ngdpbase/issues/946)

Every account is made through `UserManager.createUser`, whichever provider signs the person up ([#1538](https://github.com/jwilleke/ngdpbase/issues/1538) removed the one path around it), and is given `ngdpbase.user.account-roles` there ([#1539](https://github.com/jwilleke/ngdpbase/issues/1539)).

### Done, for the record

Closed work that shapes what comes next. Each issue is the record of what was decided.

- __The provider seam__ — a public `registerProvider()` so add-ons can contribute a provider, flows named in the interface, `viaToken` declared in `AuthResult`: [#1045](https://github.com/jwilleke/ngdpbase/issues/1045), [#1048](https://github.com/jwilleke/ngdpbase/issues/1048), [#1049](https://github.com/jwilleke/ngdpbase/issues/1049), [#1050](https://github.com/jwilleke/ngdpbase/issues/1050)
- __Sign-in hardening__ — rate limit and lockout [#1044](https://github.com/jwilleke/ngdpbase/issues/1044); Secure cookie and session regeneration [#1043](https://github.com/jwilleke/ngdpbase/issues/1043); open redirect [#1041](https://github.com/jwilleke/ngdpbase/issues/1041); HTTPS cookie and trust-proxy [#1046](https://github.com/jwilleke/ngdpbase/issues/1046), [#1160](https://github.com/jwilleke/ngdpbase/issues/1160); session secret refuses to boot on the shipped literal [#1194](https://github.com/jwilleke/ngdpbase/issues/1194); username leak on `/register` [#1086](https://github.com/jwilleke/ngdpbase/issues/1086); default credentials no longer advertised [#1033](https://github.com/jwilleke/ngdpbase/issues/1033)
- __Magic link__ — consumed by a POST confirm, not a GET that mail scanners prefetch [#1019](https://github.com/jwilleke/ngdpbase/issues/1019); single-use consume [#1021](https://github.com/jwilleke/ngdpbase/issues/1021); IP throttle [#1020](https://github.com/jwilleke/ngdpbase/issues/1020); device binding and redemption IP/User-Agent [#1022](https://github.com/jwilleke/ngdpbase/issues/1022)
- __Sessions__ — admin view and revoke of sessions [#776](https://github.com/jwilleke/ngdpbase/issues/776), [#787](https://github.com/jwilleke/ngdpbase/issues/787); other sessions end when the password changes [#1482](https://github.com/jwilleke/ngdpbase/issues/1482)
- __Private-store keys follow sign-in__ — the key is unlocked into the session at password login and dropped at logout [#1391](https://github.com/jwilleke/ngdpbase/issues/1391), [#1392](https://github.com/jwilleke/ngdpbase/issues/1392); a password change re-wraps it [#1393](https://github.com/jwilleke/ngdpbase/issues/1393)
- __BIP39 recovery words__ — reset the password and unlock private stores with the 12 words: epic [#1451](https://github.com/jwilleke/ngdpbase/issues/1451), [#1452](https://github.com/jwilleke/ngdpbase/issues/1452), [#1453](https://github.com/jwilleke/ngdpbase/issues/1453)
- __Delegated credentials are ceilings__ — an agent token's scopes and a share link's grant bound every decision, and no call shape bypasses them: [#1164](https://github.com/jwilleke/ngdpbase/issues/1164), [#1173](https://github.com/jwilleke/ngdpbase/issues/1173), [#1222](https://github.com/jwilleke/ngdpbase/issues/1222); token mint is a governed, audited capability [#1178](https://github.com/jwilleke/ngdpbase/issues/1178), [#1111](https://github.com/jwilleke/ngdpbase/issues/1111)

---

## What is planned

All open authentication work sits under one epic, [#1522](https://github.com/jwilleke/ngdpbase/issues/1522) — multi-factor sign-in, step-up re-authentication and RFC 8628 device authorization. It is built in ngdpbase first and then ported to YourPHR, whose [authorization-framework.md](https://github.com/jwilleke/yourphr/blob/main/docs/planning/authorization-framework.md) is the source of truth for the downstream needs.

__Target factor model__ (from the epic): a passkey alone, __or__ a password plus __any one__ enrolled second factor. Every factor is a registered `AuthProvider`; how many factors each provider needs is configuration.

### Build order

The blocked-by relations on GitHub give this order. Nothing in the first step depends on anything else.

- __First — the two foundations__
  - [#1523](https://github.com/jwilleke/ngdpbase/issues/1523) Auth factor configuration: `required-factors` becomes a list of provider entries (`authproviderid`, `primary`, `factors`, `priority`, `enabled`). Its decisions are in its comments
  - [#1524](https://github.com/jwilleke/ngdpbase/issues/1524) Credentials store: more than one credential per account, behind a provider, with a migration that copies each password hash into one row
- __Then — the factors__, each blocked by both foundations
  - [#448](https://github.com/jwilleke/ngdpbase/issues/448) Passkey / WebAuthn
  - [#421](https://github.com/jwilleke/ngdpbase/issues/421) TOTP
  - [#1527](https://github.com/jwilleke/ngdpbase/issues/1527) Email as a second factor
  - [#1528](https://github.com/jwilleke/ngdpbase/issues/1528) SMS as a second factor, off by default, operator-configured transport
  - [#1532](https://github.com/jwilleke/ngdpbase/issues/1532) Link-based second factor that approves the waiting sign-in from any device (blocked by #1523)
- __Then — step-up__: [#1525](https://github.com/jwilleke/ngdpbase/issues/1525) a fresh factor for sensitive actions (blocked by #1523)
- __Then — device authorization__: [#1526](https://github.com/jwilleke/ngdpbase/issues/1526) RFC 8628 for devices, AI/MCP clients and CLIs; approval uses step-up (blocked by #1525)
- __Independent of the order__
  - [#1529](https://github.com/jwilleke/ngdpbase/issues/1529) OIDC UserInfo endpoint, "who is this caller" in the standard shape. Blocks [yourphr#804](https://github.com/jwilleke/yourphr/issues/804)
  - [#1533](https://github.com/jwilleke/ngdpbase/issues/1533) Communication channels as a user profile setting, with consent, for sign-in links and notices

---

## Open questions and conflicts

Points where the issues disagree with a later decision, or where nothing is decided yet. Each is settled on its own issue, not here.

- __Email and SMS: code or link?__ [#1527](https://github.com/jwilleke/ngdpbase/issues/1527) and [#1528](https://github.com/jwilleke/ngdpbase/issues/1528) propose a typed 6–8 digit code. The decision recorded on [#1523](https://github.com/jwilleke/ngdpbase/issues/1523) (operator, 2026-09-30) is that email and SMS are delivered __as a link, not a typed code__, and [#1532](https://github.com/jwilleke/ngdpbase/issues/1532) builds that link. Both issues need their proposals brought in line before they are built.
- __SMS carries codes only?__ [#1528](https://github.com/jwilleke/ngdpbase/issues/1528) says SMS never carries notices or links. [#1533](https://github.com/jwilleke/ngdpbase/issues/1533) supersedes that: the person chooses and consents to each channel, for sign-in links and notices separately.
- __Recovery words as a factor.__ The operator noted on [#1523](https://github.com/jwilleke/ngdpbase/issues/1523) (2026-10-01) that the BIP39 recovery words are an authentication factor, config-gated like the others. No issue builds it yet, and `factors` / `primary` for it are undecided.
- __Passkey storage.__ [#448](https://github.com/jwilleke/ngdpbase/issues/448)'s original plan stores passkey fields on the user record. [#1524](https://github.com/jwilleke/ngdpbase/issues/1524) replaces that with the credentials store, as its comment says; the body still shows the old plan.
- __Priority of passkey and TOTP.__ [#448](https://github.com/jwilleke/ngdpbase/issues/448) and [#421](https://github.com/jwilleke/ngdpbase/issues/421) are no longer `deferred` (2026-10-01) and await a priority.
- __Communication channels__ — [#1533](https://github.com/jwilleke/ngdpbase/issues/1533) is marked "to be detailed later" for verification, consent records and per-purpose consent.

---

## Related

- [AuthManager.md](../managers/AuthManager.md) — the manager and its providers today
- [security-posture.md](../security-posture.md) — P1 (every call carries a context) and P2 (allow and deny are permissions)
- [security-developer-guide.md](../guides/security-developer-guide.md) — how a route or manager authorises
- [private-stores.md](../private-stores.md) — keys that follow sign-in, and the recovery words
- [sharing.md](../sharing.md) — share links, the other delegated credential
