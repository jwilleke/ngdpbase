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
  - [#448](https://github.com/jwilleke/ngdpbase/issues/448) Passkey / WebAuthn (P1)
  - [#421](https://github.com/jwilleke/ngdpbase/issues/421) TOTP (P2)
  - [#1527](https://github.com/jwilleke/ngdpbase/issues/1527) Email as a second factor
  - [#1528](https://github.com/jwilleke/ngdpbase/issues/1528) SMS as a second factor, off by default, operator-configured transport
  - [#1532](https://github.com/jwilleke/ngdpbase/issues/1532) Link-based second factor that approves the waiting sign-in from any device (blocked by #1523)
- __Then — step-up__: [#1525](https://github.com/jwilleke/ngdpbase/issues/1525) a fresh factor for sensitive actions (blocked by #1523)
- __Then — device authorization__: [#1526](https://github.com/jwilleke/ngdpbase/issues/1526) RFC 8628 for devices, AI/MCP clients and CLIs; approval uses step-up (blocked by #1525)
- __Independent of the order__
  - [#1529](https://github.com/jwilleke/ngdpbase/issues/1529) OIDC UserInfo endpoint, "who is this caller" in the standard shape. Blocks [yourphr#804](https://github.com/jwilleke/yourphr/issues/804)
  - [#1533](https://github.com/jwilleke/ngdpbase/issues/1533) Communication channels as a user profile setting, with consent, for sign-in links and notices
  - [#1546](https://github.com/jwilleke/ngdpbase/issues/1546) Session idle timeout
- __A separate epic__: [#1545](https://github.com/jwilleke/ngdpbase/issues/1545) Account recovery

### The configuration shape (decided)

Decided on [#1523](https://github.com/jwilleke/ngdpbase/issues/1523) (operator, 2026-09-30 to 2026-10-02); its body states the decided design, its comments the record of each decision. `ngdpbase.auth.required-factors` becomes a list of provider entries:

```json
"ngdpbase.auth.required-factors": [
  { "authproviderid": "passkey",  "primary": true,  "factors": 0, "priority": 0, "enabled": true },
  { "authproviderid": "password", "primary": true,  "factors": 0, "priority": 1, "enabled": true },
  { "authproviderid": "totp",     "primary": false,               "priority": 2, "enabled": true }
]
```

- `primary: true` — the provider can start a sign-in; `factors` is how many __additional__ factors a sign-in through it must pass. `0`: none required, so a second factor is optional
- `primary: false` — only ever a second factor; it has no `factors`
- ~~`priority`~~ — dropped (operator, 2026-10-02): enrolled methods are offered __strongest first__, worked out from `acr` and `aal`, the rest behind "use another way"
- `enabled` — an entry turned off is not offered
- A second factor delivered by message is a non-primary entry. The message carries a __link__ that returns to the server as the verification (a confirm page; its POST approves the waiting sign-in), and the same message carries a code for autofill; whichever is used first completes the sign-in and voids the other (operator, 2026-10-02)
- Which channel the message goes by — email, SMS or another — is the __person's preference__ in their profile ([#1533](https://github.com/jwilleke/ngdpbase/issues/1533)), not a fixed provider; SMS needs an operator-configured transport
- The BIP39 recovery words are __not__ a factor and have no entry: they are only for account recovery after a lost password or lost keys (operator, 2026-10-02)

With passkey and password both at `0`, a second factor stays optional until an operator raises password to `1`.

__Factor types__ (operator, 2026-10-02). Every factor is classified by its NIST SP 800-63 type: __know__ (knowledge), __have__ (possession) or __are__ (inherence). Exactly one primary starts the sign-in; MFA means the factors satisfied cover __two or more distinct types__, not merely two providers. Each provider declares the types it gives; an OIDC identity provider reports what it did through RFC 8176 `amr` values.

| NIST SP 800-63B authenticator | Example | Type(s) |
| --- | --- | --- |
| Password | password, passphrase | know |
| Look-up secret | backup codes | have |
| Out-of-band device | link or code to a phone | have (email is not accepted as out-of-band) |
| Single-factor OTP | TOTP app | have |
| Multi-factor OTP | OTP device unlocked by PIN or biometric | have + know or are |
| Single-factor cryptographic | security key without PIN | have |
| Multi-factor cryptographic | passkey with user verification; key with PIN | have + know or are — MFA on its own |

__How a factor is described__ (operator, 2026-10-02): each factor declares its RFC 8176 `amr` value(s) and whether it is phishing-resistant; its type and whether it is device-bound (`hwk` vs `swk`) are derived from `amr`. An email link uses the unregistered `"email"` ([Email Magic Link](https://jminim4.nerdsbythehour.com:3000/view/Email%20Magic%20Link)); an SMS link the registered `sms`. A sign-in carries the combined `amr` array and one computed `acr`.

__`acr` follows NIST strictly__ (operator, 2026-10-02). A sign-in's `acr` is computed by SP 800-63B, strongest first — `phrh`, `phr`, AAL2, AAL1 — and is what we __claim__ (session, audit, UserInfo); it never overstates. Email is never phishing-resistant and never lifts a sign-in above AAL1 (§5.1.3.1 bars email as out-of-band): password plus an email link is AAL1, and reaches AAL2 only when the other factors do so without it. Our MFA rule — two or more distinct types — is what we __require__, and is separate: password plus an email link satisfies it. Only WebAuthn and smart cards (PIV) are phishing-resistant. Sign-in factors never change IAL, which is identity proofing at enrolment.

__`acr` follows NIST strictly__ (operator, 2026-10-02). A sign-in's `acr` is computed by SP 800-63B, strongest first — `phrh`, `phr`, AAL2, AAL1 — and is what we __claim__ (session, audit, UserInfo); it never overstates. Email is never phishing-resistant and never lifts a sign-in above AAL1 (§5.1.3.1 bars email as out-of-band): password plus an email link is AAL1. Our MFA rule — two or more distinct types — is what we __require__, and is separate: password plus an email link satisfies it. Only WebAuthn and smart cards (PIV) are phishing-resistant. Sign-in factors never change IAL, which is identity proofing at enrolment.

__The required level is per role__ (operator, 2026-10-02). Each role declares the assurance level its holders must reach — AAL1, AAL2, AAL3, with phishing resistance as an extra — and a person must meet the __highest__ among their roles. The sign-in's computed `acr` is compared with it; short of it, the next factor is asked for. "Admins need a second factor" becomes the `admin` role's level. There is __no "MFA" step__ (operator, 2026-10-02): the levels are NIST's only, so password plus an email link (AAL1) never meets a role at AAL2. Still open: how a known device meets a role above AAL1.

__Known devices and misclassification__ (operator, 2026-10-02):

- A known device is `{ "authproviderid": "known-device", "amr": [], "aal": 0, "carry-forward": "24h", "remember": "30d", "enabled": true }`. On re-entry of the primary factor it carries the level the device last reached for at most 24 hours (NIST allows an AAL2 re-authentication with one factor plus the session secret within that window); after that it only skips the prompt, and the sign-in reports what was entered
- Over-limit security settings are __lowered with a warning__ (log, admin dashboard, posture report), not refused. Config may lower a provider's `amr` / `aal` / `acr`, never raise it; the truth is in the provider's code. Refusing to start is only for a required level no available factor can reach
- Known devices are rows in the credentials store ([#1524](https://github.com/jwilleke/ngdpbase/issues/1524)), kind `device`, storing the `amr` of the sign-in that created them — never a level, which is recomputed at use. The person sees and removes them; a password change or sign-out-everywhere clears them
- Tamper protection: each row is signed with a key from the environment and references the audit record of the sign-in that created it, anchored by the hash-chained audit log. A row that fails either check is treated as unknown and recorded as a security event. Config changes are already audited (security-posture D19)

__Link approval__ (operator, 2026-10-02; [#1532](https://github.com/jwilleke/ngdpbase/issues/1532)): on every channel the message says what is asking, from which browser and device, roughly where and when, with __Approve__ and __This wasn't me__; opening the link alone does nothing. No number matching — it only guards unsolicited approvals, and an email link never satisfies an AAL2 role. One pending request at a time, short-lived, repeats throttled; several "wasn't me" answers or a burst of requests alert the person.

__Prompting and the admin default__ (operator, 2026-10-02):

- __Admins require a second factor by default.__ A role may raise the factor count, and the shipped default does so for `admin`
- __A known device is not a factor__ — it is a prompt-skipping policy. A remembered browser skips the second-factor prompt; a new or forgotten device prompts. The sign-in reports only the factors actually used (`amr: ["pwd"]`, AAL1) with a known-device flag, and a policy needing AAL2 or phishing resistance (step-up, a regulated posture) still prompts. The remembered period is configuration (NIST expects AAL2 re-authentication at least every 24 hours). A device holding a bound key is a real factor: a passkey today, Device Bound Session Credentials later
- __A factor is disabled until it is truly available__ — its provider registered and fully configured (SMS with its transport, for example); listed but unavailable is never offered. __The server refuses to start__ when the required policy cannot be met: an unknown provider, or a requirement such as the admin second factor that no available factor can satisfy ([#1194](https://github.com/jwilleke/ngdpbase/issues/1194) is the precedent)
- __The sign-in result says how__ (part of [#1523](https://github.com/jwilleke/ngdpbase/issues/1523)). `AuthResult` carries the provider, the factors satisfied each with its time, and the known-device flag; they go into the session for step-up, the admin default and the audit record
- __No constant prompting.__ A second factor is asked for only on a new or forgotten device, and step-up only for rare sensitive actions ([#1525](https://github.com/jwilleke/ngdpbase/issues/1525)). A passkey is the sign-in and adds no prompt
- __An account is only as strong as its weakest way in.__ A passkey protects only the passkey path; while the password alone can still sign the account in, a stolen password still works. The admin default closes that for admins, and passkeys are encouraged so their honest record is `["swk", "user"]` at `phr`

Account recovery — a lost password, passkey, second factor, known device or private-store keys — is its own epic, [#1545](https://github.com/jwilleke/ngdpbase/issues/1545).

---

## What YourPHR needs

From YourPHR's [authorization-framework.md](https://github.com/jwilleke/yourphr/blob/main/docs/planning/authorization-framework.md) (read 2026-10-01). Each belongs on the ngdpbase issue named; none is there yet.

- __A richer provider result__ — decided (2026-10-02), part of [#1523](https://github.com/jwilleke/ngdpbase/issues/1523): provider, factors satisfied and when
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

## Prior art: activescott/auth

[activescott/auth](https://github.com/activescott/auth) (MIT, TypeScript; core 5.7.0, 2026-09-29) is direct, passwordless sign-in: email magic link plus a code in the same message, SMS codes, and passkeys via `@simplewebauthn/server`, with an optional OIDC sign-in package. It runs on Fetch `Request`/`Response` and WebCrypto, ships a React Router adapter, and asks the app for three stores (`IdentityStore`, `UserStore`, `ChallengeStore`). Used in production by the author's ramblefeed, tinkerbellbot and fernfiles; fernfiles' [auth plan](https://github.com/activescott/fernfiles/blob/main/docs/specs/003-auth/plan.md) (a private repository) shows a waitlist (pending, approved, blocked) layered on top. Reviewed 2026-10-02.

__Not adopted as a library__ — YourPHR's plan reaches the same conclusion:

- it has no multi-factor: each method is a complete sign-in, its result records no factors or times, and there is no step-up (TOTP was set aside in [auth#76](https://github.com/activescott/auth/issues/76) "since we have passkey support") — the core of [#1522](https://github.com/jwilleke/ngdpbase/issues/1522) is not there
- it brings its own JWT-cookie session with a two-minute user cache, which would compete with ours (Express sessions, sessions ended on password change [#1482](https://github.com/jwilleke/ngdpbase/issues/1482), the private-store key held in the session). Fernfiles had to re-read the user on every request so a block took effect at once
- it is Fetch and React Router, not Express; even its passkey provider depends on its own `AuthProvider` and `IdentityStore`, so [#448](https://github.com/jwilleke/ngdpbase/issues/448) is simpler on `@simplewebauthn/server` directly

__Ideas to take__, each on the issue it belongs to:

- __Identities as rows, linking and merge__ ([#1524](https://github.com/jwilleke/ngdpbase/issues/1524)). An identity is a `(provider, identifier)` row; a passkey is one more row. A signed-in person can link another email or phone after the same proof-of-possession round trip as a sign-in, without revealing whether the address already has an account. If it belongs to another account, a single-use, ten-minute merge ticket (same browser, both accounts proven) lets them combine the two. Removing a method is not built there yet ([auth#71](https://github.com/activescott/auth/issues/71)); ours must also refuse removing the last way in
- __Link and code in one message__ ([#1527](https://github.com/jwilleke/ngdpbase/issues/1527), [#1532](https://github.com/jwilleke/ngdpbase/issues/1532)). Every sign-in email carries both a link (opening a confirm page; the POST redeems it, so mail scanners cannot) and a numeric code that iOS and macOS autofill. That settles the code-or-link conflict below without choosing
- __Confirmation wording for linking__ — a message that adds an identifier says "confirm your email", not "sign in", because the recipient did not ask to sign in
- __SMS without A2P 10DLC__ ([#1528](https://github.com/jwilleke/ngdpbase/issues/1528)). A hosted verification transport (Twilio Verify) generates, sends and checks the code: no number to buy and no brand or campaign registration, at about 4–6 times the price per sign-in. A messaging transport (your own number) is cheaper at volume and carries RCS through a Twilio Messaging Service. WebOTP lets the phone autofill the code
- __Passkey host binding__ ([#448](https://github.com/jwilleke/ngdpbase/issues/448)). In production the relying-party id and expected origin are derived from the configured site URL, never from the request; conditional UI (passkey autofill) is supported; Safari needs the options fetched before the tap ([auth#150](https://github.com/activescott/auth/issues/150))
- __Abuse guard on the initiate step__ ([#1044](https://github.com/jwilleke/ngdpbase/issues/1044)). A form token, per-IP and per-identifier limits, an optional bot check (Cloudflare Turnstile), and an initiate gate the app controls; a blocked initiate gets the same answer as a sent one, so it reveals nothing. Their [auth#140](https://github.com/activescott/auth/issues/140) found that a per-address send cap lets anyone lock a person out for a day — check our limits for the same denial of service
- __Atomic, shared challenges__ ([#1021](https://github.com/jwilleke/ngdpbase/issues/1021)). [auth#153](https://github.com/activescott/auth/issues/153) makes consuming a challenge atomic (our #1021); [auth#154](https://github.com/activescott/auth/issues/154) adds a database-backed challenge store for more than one instance
- __A reusable authorization server__ ([#1526](https://github.com/jwilleke/ngdpbase/issues/1526), [#1529](https://github.com/jwilleke/ngdpbase/issues/1529)). [auth#83](https://github.com/activescott/auth/issues/83), started 2026-10-01 for fernfiles' MCP server, ports an OIDC/OAuth authorization server so apps can register OAuth clients. It is the nearest outside work to RFC 8628 device authorization and UserInfo; worth coordinating before building ours
- __Admin views__ — a read-only users page (each user's identities, created and last used) and a configuration page with secrets removed; an admin allowlist matched against every identity a user owns; a non-admin gets 404, not 403
- __End-to-end tests without a mail server__ — a capture transport records the last link and code per recipient, and a test-only readback route (test mode plus a shared-secret header) hands them to the browser test

---

## Regulated deployments — a guideline

> __Guidance, not legal advice.__ This section describes what a regulated deployment typically configures. It is not legal advice and does not make any deployment compliant: the operator alone is accountable for their configuration and for meeting the rules that apply to them, and should take advice from someone qualified in those rules. When authentication ships, this moves into the Security Posture Recommendations page ([#1146](https://github.com/jwilleke/ngdpbase/issues/1146), [security-posture.md](../security-posture.md) D17), which carries the same disclaimer; until then it lives here.

| Setting | Regulated guideline | Why |
| --- | --- | --- |
| Role `required-aal` | `aal2` for every role that reads regulated data; phishing-resistant for `admin` | HIPAA §164.312(d) person authentication (the 2025 proposed rule makes MFA mandatory); PCI DSS 4.0 Req. 8.4 MFA for all access to card data; NIST 800-171 3.5.3 MFA for privileged access; OMB M-22-09 phishing-resistant MFA |
| Session idle timeout | 15 minutes | PCI DSS 4.0 Req. 8.2.8; NIST SP 800-63B-4 AAL3 (AAL2: 60 minutes); HIPAA §164.312(a)(2)(iii) automatic logoff names no figure |
| Known device `carry-forward` | 12 hours or less | NIST re-authentication limits (12 hours in revision 3, 24 in revision 4) |
| Known device `remember` | 7 days or less | shorter exposure if a device is lost |
| `ngdpbase.audit.retentiondays` | 2190 (six years) | HIPAA keeps required documentation six years (§164.316(b)(2)); PCI DSS keeps audit history one year |
| SMS as a second-factor channel | off | NIST SP 800-63B classes SMS as restricted |
| Email link as a second factor | allowed, but never counted toward AAL2 | email is not an out-of-band authenticator (§5.1.3.1) |

Not covered, by decision (operator, 2026-10-02): __identity proofing (IAL2)__ — checking a real-world identity document at enrolment — is an HR / onboarding process, not an application setting. Sign-in factors never change IAL.

### Settings this needs

- __Session idle timeout — new__, [#1546](https://github.com/jwilleke/ngdpbase/issues/1546). Today a session ends only at `ngdpbase.session.max-age` (24 hours, an absolute lifetime from sign-in), with no inactivity limit. Proposed: `ngdpbase.session.idle-timeout-minutes`, `0` = off, otherwise any number of minutes — no fixed cap, since a value at or above `max-age` simply has no effect (the posture report says so). A role may set a __shorter__ value and a person gets the shortest among their roles — the same never-loosen rule as `required-aal`
- __Audit retention — exists.__ `ngdpbase.audit.retentiondays` (default `90`), in days; six years is `2190`

---

## Open questions and conflicts

Points where the issues disagree with a later decision, or where nothing is decided yet. Each is settled on its own issue, not here.

- __SMS carries codes only?__ [#1528](https://github.com/jwilleke/ngdpbase/issues/1528) says SMS never carries notices or links. [#1533](https://github.com/jwilleke/ngdpbase/issues/1533) supersedes that: the person chooses and consents to each channel, for sign-in links and notices separately.
- __`factors` in YourPHR.__ [#1523](https://github.com/jwilleke/ngdpbase/issues/1523) now states the decided shape (rewritten 2026-10-02): `factors` counts __additional__ factors (`password` plus one = `"factors": 1`). YourPHR's document still describes per-provider `auth-factors` where `2` meant "this provider plus one"; ported as written, every password policy would be off by one.
- __Passkey storage.__ [#448](https://github.com/jwilleke/ngdpbase/issues/448)'s original plan stores passkey fields on the user record. [#1524](https://github.com/jwilleke/ngdpbase/issues/1524) replaces that with the credentials store, as its comment says; the body still shows the old plan.
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
- [Multi-Factor Authentication](https://jminim4.nerdsbythehour.com:3000/view/Multi-Factor%20Authentication) — the target of the epic: two or more __independent__ factors
- [Something You Know](https://jminim4.nerdsbythehour.com:3000/view/Something%20You%20Know), [Something You Have](https://jminim4.nerdsbythehour.com:3000/view/Something%20You%20Have), [Something You Are](https://jminim4.nerdsbythehour.com:3000/view/Something%20You%20Are) — the three factor types every factor is classified by; [Something You Do](https://jminim4.nerdsbythehour.com:3000/view/Something%20You%20Do) is not a NIST factor type
- [RFC 8176](https://jminim4.nerdsbythehour.com:3000/view/RFC%208176) — Authentication Method Reference (`amr`) values, how an identity provider reports the factors it checked
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
- [Mnemonic](https://jminim4.nerdsbythehour.com:3000/view/Mnemonic) — the BIP39 recovery words, used for account recovery only ([#1452](https://github.com/jwilleke/ngdpbase/issues/1452), [#1453](https://github.com/jwilleke/ngdpbase/issues/1453))
- [Phishing](https://jminim4.nerdsbythehour.com:3000/view/Phishing) — what passkeys and step-up approval are chosen to resist ([#1525](https://github.com/jwilleke/ngdpbase/issues/1525), [#1532](https://github.com/jwilleke/ngdpbase/issues/1532))
- [HIPAA Security Rule](https://jminim4.nerdsbythehour.com:3000/view/HIPAA%20Security%20Rule) — the downstream requirement YourPHR brings to this epic

---

## Related

- [AuthManager.md](../managers/AuthManager.md) — the manager and its providers today
- [security-posture.md](../security-posture.md) — P1 (every call carries a context) and P2 (allow and deny are permissions)
- [security-developer-guide.md](../guides/security-developer-guide.md) — how a route or manager authorises
- [private-stores.md](../private-stores.md) — keys that follow sign-in, and the recovery words
- [sharing.md](../sharing.md) — share links, the other delegated credential
