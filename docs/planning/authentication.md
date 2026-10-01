# Authentication — planning

Where authentication in ngdpbase stands, what is planned, in what order, and which questions are still open. Gathered from the GitHub issues on 2026-10-01.

Mostly an index: where an issue holds a design, this page points at it and says how the pieces fit. Two things are recorded here because no issue holds them yet — what YourPHR needs from this work, and the delivery-channel research (2026-10-01). What `AuthManager` does today is [AuthManager.md](../managers/AuthManager.md) and the provider docs it links. How a request is authorised once someone is signed in is [security-posture.md](../security-posture.md) and [access-policies.md](../access-policies.md).

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

### The configuration shape (decided)

Decided on [#1523](https://github.com/jwilleke/ngdpbase/issues/1523) (operator, 2026-09-30; in its comments, not its body). `ngdpbase.auth.required-factors` becomes a list of provider entries:

```json
"ngdpbase.auth.required-factors": [
  { "authproviderid": "passkey",  "primary": true,  "factors": 0, "priority": 0, "enabled": true },
  { "authproviderid": "password", "primary": true,  "factors": 0, "priority": 1, "enabled": true },
  { "authproviderid": "totp",     "primary": false,               "priority": 2, "enabled": true }
]
```

- `primary: true` — the provider can start a sign-in; `factors` is how many __additional__ factors a sign-in through it must pass. `0`: none required, so a second factor is optional
- `primary: false` — only ever a second factor; it has no `factors`
- `priority` — `0` is highest. The sign-in page offers the person's highest-priority __enrolled__ primary method first, the others behind "use another way"; second factors the same
- `enabled` — an entry turned off is not offered
- Email and SMS are non-primary entries, delivered as a __link__, not a typed code; SMS needs an operator-configured transport
- The BIP39 recovery words are one more entry (operator, 2026-10-01); its `primary` and `factors` are undecided

With passkey and password both at `0`, a second factor stays optional until an operator raises password to `1`.

---

## What YourPHR needs

From YourPHR's [authorization-framework.md](https://github.com/jwilleke/yourphr/blob/main/docs/planning/authorization-framework.md) (read 2026-10-01). Each belongs on the ngdpbase issue named; none is there yet.

- __A richer provider result__ ([#1525](https://github.com/jwilleke/ngdpbase/issues/1525), [#1523](https://github.com/jwilleke/ngdpbase/issues/1523)). `AuthResult` carries `username` and `viaToken`. YourPHR's carries subject, provider, the factors satisfied and when, and a token generation. Step-up needs the factors and times in the session
- __Passkeys are bound to the host__ ([#448](https://github.com/jwilleke/ngdpbase/issues/448)). The WebAuthn relying-party id is the `base-url` host; changing it orphans every enrolled passkey. Set once, shown to the operator, and always keep a recovery path (a second passkey, or password plus another factor)
- __Factor-policy rules__ ([#1523](https://github.com/jwilleke/ngdpbase/issues/1523)): an admin account requires a second factor once any are enabled; a role can raise the factor count, never lower it; an unknown or unsatisfiable setting refuses the boot
- __Invariants__ — a provider proves identity and never mints a session; a failed factor is a failed sign-in, never a fall-through to another provider ("any one of" is a policy over __enrolled__ factors, not a loop); delegated credentials carry scopes, never roles; a link never grants anything until the signed-in person acts on the page it opens
- __A sign-in record the account holder can see__ — sign-ins, failures, credential changes and device approvals, with an optional "new sign-in" email. Our audit log records events for administrators; no ngdpbase issue covers the person's own view. Retention is undecided
- __Write scopes inside a consent grant__ ([#1526](https://github.com/jwilleke/ngdpbase/issues/1526)). A connected device ([yourphr#314](https://github.com/jwilleke/yourphr/issues/314), [yourphr#807](https://github.com/jwilleke/yourphr/issues/807)) needs a write scope, only inside a grant from the person: 30 days at most, short-lived keys, extended only by them, suspended after `inactive-after-days` (14) with no upload

Decisions YourPHR is waiting on, which belong to our issues: the second-factor order (they recommend passkey, then email, then TOTP, then SMS); whether a passkey may sign in alone from the day passkeys ship; sign-in record retention and whether refusals go in it.

Where YourPHR's document is out of date about ngdpbase (an issue or PR there, not an edit from here): #448 and #421 are no longer `deferred`; authorization is the policy decision point and policy information point, with roles derived from the policies (#1431), not `UserManager.hasPermission` and `ACLManager`; and #1533 superseded "SMS never carries notices".

---

## Delivery channels

How a sign-in link, a code or a notice reaches a person ([#1532](https://github.com/jwilleke/ngdpbase/issues/1532), [#1528](https://github.com/jwilleke/ngdpbase/issues/1528), [#1533](https://github.com/jwilleke/ngdpbase/issues/1533)). Researched 2026-10-01; free tiers and prices change, so check before relying on one.

__Email__ works today: `EmailManager`'s SMTP provider (`ngdpbase.mail.provider: "smtp"`) takes any of these with no code. Send from your own domain with SPF, DKIM and DMARC, or sign-in links land in spam.

| Provider | Free allowance (approximate) |
| --- | --- |
| Brevo | 300 a day |
| Resend | 3,000 a month, 100 a day |
| Mailjet | 6,000 a month, 200 a day |
| SMTP2GO | 1,000 a month |
| Gmail / Google Workspace (app password) | about 500 a day; sends from Gmail, not meant for application mail |

__SMS__ has no real free option in the US:

- Twilio and Vonage trial credit sends only to verified numbers, with a "trial account" prefix — development only
- Textbelt: one free text a day
- Real application-to-person sending needs A2P 10DLC registration (or a verified toll-free number): a few dollars a month in fees, then about a cent a message
- Carrier email-to-SMS gateways are no longer dependable (AT&T shut its own down in 2025)
- Closest to free: an Android phone as the gateway (for example the open-source SMS Gateway for Android, with an HTTP API), sending on your own phone plan. Fine for a handful of messages; carriers' terms usually forbid automated sending

__RCS__ (RCS Business Messaging) needs a registered, verified sender approved per carrier, through Google or resellers (Twilio, Sinch, Infobip), is billed per message at SMS prices or more, and falls back to SMS. Not free; heavy paperwork for a self-hosted site.

__Signal__ — the Signal Protocol is an encryption scheme, not a delivery service. The Signal app has no official business API; the usual route is the unofficial open-source `signal-cli` (or `signal-cli-rest-api`) on a registered number. Free and end-to-end encrypted, which suits health data, but unofficial: a Signal change can break it, an automated-looking number can be rate-limited or blocked, and the person must use Signal and share their number.

__Free and dependable__: Web Push (browser notifications to a signed-in device; free, no phone number), the Telegram bot API (official and free; not end-to-end encrypted), ntfy (self-hosted push), Matrix (self-hostable, end-to-end encrypted).

Under [#1533](https://github.com/jwilleke/ngdpbase/issues/1533) each channel is a pluggable provider the person consents to, so any of these can be one. They are notification channels: NIST SP 800-63B does not recognise them as authenticators the way it does passkeys and TOTP, so email links ([#1532](https://github.com/jwilleke/ngdpbase/issues/1532)) and passkeys stay the main second factors, and SMS stays off by default with an operator-supplied transport ([#1528](https://github.com/jwilleke/ngdpbase/issues/1528)).

---

## Open questions and conflicts

Points where the issues disagree with a later decision, or where nothing is decided yet. Each is settled on its own issue, not here.

- __Email and SMS: code or link?__ [#1527](https://github.com/jwilleke/ngdpbase/issues/1527) and [#1528](https://github.com/jwilleke/ngdpbase/issues/1528) propose a typed 6–8 digit code. The decision recorded on [#1523](https://github.com/jwilleke/ngdpbase/issues/1523) (operator, 2026-09-30) is that email and SMS are delivered __as a link, not a typed code__, and [#1532](https://github.com/jwilleke/ngdpbase/issues/1532) builds that link. Both issues need their proposals brought in line before they are built.
- __SMS carries codes only?__ [#1528](https://github.com/jwilleke/ngdpbase/issues/1528) says SMS never carries notices or links. [#1533](https://github.com/jwilleke/ngdpbase/issues/1533) supersedes that: the person chooses and consents to each channel, for sign-in links and notices separately.
- __`factors` means two things.__ The decided shape counts __additional__ factors (`password` plus one = `"factors": 1`). The body and title of [#1523](https://github.com/jwilleke/ngdpbase/issues/1523), and YourPHR's document, still describe per-provider `auth-factors` where `2` meant "this provider plus one". Ported as written, every password policy would be off by one.
- __Recovery words as a factor.__ The operator noted on [#1523](https://github.com/jwilleke/ngdpbase/issues/1523) (2026-10-01) that the BIP39 recovery words are an authentication factor, config-gated like the others. No issue builds it yet, and `factors` / `primary` for it are undecided.
- __Passkey storage.__ [#448](https://github.com/jwilleke/ngdpbase/issues/448)'s original plan stores passkey fields on the user record. [#1524](https://github.com/jwilleke/ngdpbase/issues/1524) replaces that with the credentials store, as its comment says; the body still shows the old plan.
- __Priority of passkey and TOTP.__ [#448](https://github.com/jwilleke/ngdpbase/issues/448) and [#421](https://github.com/jwilleke/ngdpbase/issues/421) are no longer `deferred` (2026-10-01) and await a priority.
- __Communication channels__ — [#1533](https://github.com/jwilleke/ngdpbase/issues/1533) is marked "to be detailed later" for verification, consent records and per-purpose consent.

---

## Standards

Pages on jimstest that define the terms and standards this plan relies on.

- [Identity Assurance Level](https://jminim4.nerdsbythehour.com:3000/view/Identity%20Assurance%20Level) — how sure we are a person is who they claim at enrolment (NIST SP 800-63A IAL1–3); what sign-up and account recovery are held to
- [Level Of Assurance](https://jminim4.nerdsbythehour.com:3000/view/Level%20Of%20Assurance) — the umbrella term the three NIST levels sit under
- [NIST.SP.800-63](https://jminim4.nerdsbythehour.com:3000/view/NIST.SP.800-63) — Digital Identity Guidelines — the standard the factor model is measured against
- [NIST.SP.800-63A](https://jminim4.nerdsbythehour.com:3000/view/NIST.SP.800-63A) — enrolment and identity proofing (IAL)
- [NIST.SP.800-63B](https://jminim4.nerdsbythehour.com:3000/view/NIST.SP.800-63B) — authentication and authenticators (AAL): why email is not an out-of-band authenticator and SMS is restricted ([#1527](https://github.com/jwilleke/ngdpbase/issues/1527), [#1528](https://github.com/jwilleke/ngdpbase/issues/1528))
- [NIST.SP.800-63C](https://jminim4.nerdsbythehour.com:3000/view/NIST.SP.800-63C) — federation (FAL): signing in through Google, Cloudflare Access or Authentik, and an identity provider that already did MFA ([#1523](https://github.com/jwilleke/ngdpbase/issues/1523))
- [Multi-Factor Authentication](https://jminim4.nerdsbythehour.com:3000/view/Multi-Factor%20Authentication) — the target of the epic
- [Passkeys](https://jminim4.nerdsbythehour.com:3000/view/Passkeys) — the factor that is complete on its own ([#448](https://github.com/jwilleke/ngdpbase/issues/448))
- [WebAuthN](https://jminim4.nerdsbythehour.com:3000/view/WebAuthN) — the browser API passkeys use ([#448](https://github.com/jwilleke/ngdpbase/issues/448))
- [FIDO2](https://jminim4.nerdsbythehour.com:3000/view/FIDO2) — WebAuthn plus CTAP, the passkey standard
- [RFC 6238](https://jminim4.nerdsbythehour.com:3000/view/RFC%206238) — TOTP ([#421](https://github.com/jwilleke/ngdpbase/issues/421))
- [RFC 8628](https://jminim4.nerdsbythehour.com:3000/view/RFC%208628) — OAuth 2.0 device authorization grant ([#1526](https://github.com/jwilleke/ngdpbase/issues/1526))
- [RFC 6750](https://jminim4.nerdsbythehour.com:3000/view/RFC%206750) — bearer tokens in the Authorization header, the shape of agent tokens and UserInfo ([#1529](https://github.com/jwilleke/ngdpbase/issues/1529))
- [OAuth 2.0](https://jminim4.nerdsbythehour.com:3000/view/OAuth%202.0) — the framework RFC 8628 and RFC 6750 belong to
- [OpenID Connect](https://jminim4.nerdsbythehour.com:3000/view/OpenID%20Connect) — UserInfo ([#1529](https://github.com/jwilleke/ngdpbase/issues/1529)) and the Google sign-in provider
- [JSON Web Token](https://jminim4.nerdsbythehour.com:3000/view/JSON%20Web%20Token) — the Cloudflare Access and Authentik bearer credentials
- [Identity Proofing](https://jminim4.nerdsbythehour.com:3000/view/Identity%20Proofing) — what IAL measures; relevant to self-registration and recovery
- [Credential Service Provider](https://jminim4.nerdsbythehour.com:3000/view/Credential%20Service%20Provider) — the role ngdpbase plays when it issues and checks credentials
- [Mnemonic](https://jminim4.nerdsbythehour.com:3000/view/Mnemonic) — the BIP39 recovery words, proposed as a factor ([#1523](https://github.com/jwilleke/ngdpbase/issues/1523))
- [Phishing](https://jminim4.nerdsbythehour.com:3000/view/Phishing) — what passkeys and step-up approval are chosen to resist ([#1525](https://github.com/jwilleke/ngdpbase/issues/1525), [#1532](https://github.com/jwilleke/ngdpbase/issues/1532))
- [HIPAA Security Rule](https://jminim4.nerdsbythehour.com:3000/view/HIPAA%20Security%20Rule) — the downstream requirement YourPHR brings to this epic

---

## Related

- [AuthManager.md](../managers/AuthManager.md) — the manager and its providers today
- [security-posture.md](../security-posture.md) — P1 (every call carries a context) and P2 (allow and deny are permissions)
- [security-developer-guide.md](../guides/security-developer-guide.md) — how a route or manager authorises
- [private-stores.md](../private-stores.md) — keys that follow sign-in, and the recovery words
- [sharing.md](../sharing.md) — share links, the other delegated credential
