# Contact Us

ngdpbase ships a built-in `/contact` route that operators can use as a zero-authoring contact form. It's separate from — and composable with — the self-registration toggle, the seeded `Contact Us` page, and any wiki page that links to it.

The form is server-rendered, posts back to `/contact`, validates inputs, defends against bot spam (honeypot + per-IP rate limit), resolves a recipient (explicit config or first-admin fallback), and delivers via the existing `EmailManager`. When mail is unconfigured the form renders a "not configured" state instead, so visitors don't get a misleading success.

This doc covers the current shipping behaviour as of **v3.12.1**. The feature originally landed in #658 (v3.11.0 GET preview, v3.11.1 closed the form-and-send loop). Subsequent improvements ship under the umbrella issue #670 in five phases (A–E); see the *Roadmap* section at the end for what's done vs planned.

---

## What `/contact` does

| Verb | Path | Behaviour |
|---|---|---|
| `GET` | `/contact` | Renders the built-in form (`views/contact.ejs`) — name, email, optional subject, message, plus a hidden honeypot field. |
| `POST` | `/contact` | Validates and sends the message; re-renders the same view with a success banner, a validation error, or a "not configured" notice. |

What it is **not**:

- It is not a ticketing system. Submissions go to email and to a local JSONL audit log (added in v3.12.0); there is no inbox, no thread, no reply tracking.
- It is not the same thing as the seeded `contact-us` *wiki page*. That page is a static text page at `/view/contact-us` that operators can edit. The `/contact` *route* is the form. They share a name but are independent.

---

## Reachability

Out of the box, `/contact` is reachable in two ways:

1. **Footer link on every page** (since v3.11.4 / #670 Phase A) — when the contact feature is *fully available*. See the next subsection for what "fully available" means.
2. **Direct URL** (`/contact`) — always works as long as `ngdpbase.application.contact.enabled` is true.

Operators can also author wiki-page links to `/contact` (JSPWiki syntax `[Send us a message|/contact]`) on any page; this is independent of the footer.

### `contactAvailable`

The footer link is gated on a single derived boolean, `contactAvailable`, computed once per render in `WikiRoutes.getCommonTemplateData`:

```
contactAvailable =
   ngdpbase.application.contact.enabled === true
   AND ngdpbase.mail.enabled === true
   AND a recipient resolves
       (explicit contact.recipient set, OR first admin user has a
        non-sentinel email)
```

If any of those is false, `contactAvailable` is false and the footer link is suppressed. This avoids advertising a path that would lead to a misconfigured form.

### Footer link toggle

Even when `contactAvailable` is true, operators can hide the footer link without disabling `/contact` itself:

```json
"ngdpbase.application.contact.footer.enabled": false
```

`/contact` remains reachable by direct URL or via authored wiki-page links; it's just not advertised in the footer. Default: `true`.

### Single source of truth

`contactAvailable` is plumbed through `getCommonTemplateData`, so any future header / menu / nav chrome can branch on the same boolean. There's no separate "is contact available" check scattered across handlers.

---

## Configuration

Four keys, all in your instance config at `$FAST_STORAGE/config/app-custom-config.json`:

| Key | Default | Description |
|---|---|---|
| `ngdpbase.application.contact.enabled` | `true` | Master kill switch. `false` → both `GET` and `POST` return 404. |
| `ngdpbase.application.contact.page` | `""` | Empty → use the built-in form. Set to a page slug → `GET /contact` 302-redirects to `/view/<slug>`; `POST /contact` returns **405 Method Not Allowed**. |
| `ngdpbase.application.contact.recipient` | `""` | Empty → resolve at request time to the first admin user whose email isn't the install-default sentinel `admin@localhost`. Set to a single address or an inline CSV → use verbatim. Each address is regex-checked at startup (#670 Phase D); a malformed segment refuses to start. See *Recipient patterns* below. |
| `ngdpbase.application.contact.footer.enabled` | `true` | Render a "Contact" link in the page footer when `contactAvailable` is true (#670 Phase A). Set `false` to keep `/contact` reachable without advertising it. |
| `ngdpbase.application.contact.persist.enabled` | `true` | Append every legitimate `POST /contact` submission to a JSONL audit log (#670 Phase C, v3.12.0). Set `false` to disable persistence entirely. |
| `ngdpbase.application.contact.persist.path` | `""` | Override the audit log path. Empty → `{instanceDataFolder}/contact-submissions.log` (resolves under `FAST_STORAGE` / `INSTANCE_DATA_FOLDER` / `./data`). Set to an absolute path to send the log to a mounted log volume off the data tree. |

### Minimal example — built-in form, default recipient resolution, footer link on

```json
{
  "ngdpbase.application.contact.enabled": true,
  "ngdpbase.application.contact.recipient": ""
}
```

For this to actually deliver mail, you also need a non-sentinel email on at least one admin user (set via the admin UI), plus working `ngdpbase.mail.*` configuration. See [`email-setup.md`](./email-setup.md).

### Explicit recipient

```json
{
  "ngdpbase.application.contact.recipient": "ops@example.com"
}
```

Overrides the first-admin resolver. The address is never rendered to clients — it stays server-side only.

### Operator-owned page instead of the built-in form

```json
{
  "ngdpbase.application.contact.page": "support"
}
```

`GET /contact` will 302-redirect to `/view/support`. You author whatever page content you like (a `[{Form …}]` plugin, an external SaaS link, etc.). `POST /contact` returns 405 in this mode — the built-in submit handler is bypassed because you've taken ownership of the contact UX.

The page slug `"contact"` itself is rejected at startup as a redirect loop — `ConfigurationManager.assertContactPageNotLoop` throws if anyone tries it.

### Hide the footer link without disabling /contact

```json
{
  "ngdpbase.application.contact.enabled": true,
  "ngdpbase.application.contact.footer.enabled": false
}
```

Useful during a soft launch, or when you want `/contact` reachable from a specific authored page only.

---

## Recipient patterns

`ngdpbase.application.contact.recipient` is a single config string, but it accepts two patterns. Both work today and are equivalently supported by `EmailManager` / Nodemailer / SMTP. Pick the one that matches your operational shape.

### Pattern 1 — single address (distribution-list pattern)

Point the config at one address, typically a mailing list managed on the mail-server side (Google Group, Postfix alias, mailman, etc.):

```json
"ngdpbase.application.contact.recipient": "admins@example.com"
```

ngdpbase sees one address; the mail server handles fan-out. Adding or removing admins doesn't require an ngdpbase config change — you just edit the list on the mail-server side.

### Pattern 2 — inline CSV

List multiple addresses directly in the config string, separated by commas:

```json
"ngdpbase.application.contact.recipient": "alice@example.com, bob@example.com, carol@example.com"
```

ngdpbase passes the string verbatim to `EmailManager.sendTo()` and ultimately to Nodemailer, which accepts comma-separated `to:` headers (per RFC 5322). The mail server delivers a single message to all recipients. Whitespace around commas is tolerated.

### Pattern 3 — empty (resolves at request time)

Leave `contact.recipient` empty:

```json
"ngdpbase.application.contact.recipient": ""
```

`UserManager.getContactRecipient()` then iterates users at request time and returns the first admin with a non-sentinel email. This is the install default — useful for fresh deploys before an operator picks an explicit address. See *Recipient resolution* further down for the resolver semantics.

### Decision matrix

| If you have… | Use |
|---|---|
| 1 admin, stable | a single address — no list infrastructure needed |
| 2–5 admins, mostly stable | inline CSV — simplest for small teams, no extra infra |
| Many admins / frequent rotation / want CC/BCC control | a distribution list address — manage on the mail server, point ngdpbase at one address |
| Fresh install, no admin picked yet | leave empty — resolves to first admin automatically |

### Startup validation (#670 Phase D, v3.12.1)

`ConfigurationManager.assertContactRecipientWellFormed` runs at boot and refuses to start if any segment of `contact.recipient` is malformed:

```
[ConfigurationManager] Refusing to start: 'ngdpbase.application.contact.recipient'
contains malformed address(es): "oops". Use a single address ("admins@example.com"),
an inline CSV ("alice@example.com, bob@example.com"), or leave the key empty to
auto-resolve to the first admin user with a non-default email. (#670 Phase D)
```

The check splits on `,`, trims each segment, and applies the same pragmatic shape check the form uses (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`). It's not RFC-perfect — SMTP verifies the rest at send time — but it catches typos that would otherwise only surface when a visitor tries to send something. Trailing-comma cases (e.g., `"a@b.com,"`) and whitespace-only segments are flagged as malformed because they usually indicate edit accidents.

---

## State matrix

The handlers mirror each other on the front-of-pipeline checks; submission adds rate limit, honeypot, validation, and mail send.

### `GET /contact`

| `enabled` | `page` | `mail.enabled` | `EmailManager` | `recipient` resolves | Result |
|---|---|---|---|---|---|
| `false` | * | * | * | * | **404** Not found |
| `true` | `<slug>` (≠ "contact") | * | * | * | **302** → `/view/<slug>` |
| `true` | `""` | * | not registered | * | **200** "not configured" (logged at error) |
| `true` | `""` | `false` | registered | * | **200** "not configured" (logged at error) |
| `true` | `""` | `true` | registered | no | **200** "not configured" |
| `true` | `""` | `true` | registered | yes | **200** form view (`state: "form"`) |

### `POST /contact`

| Step | On failure | On success |
|---|---|---|
| `enabled = false` | **404** | continue |
| `page = "<slug>"` (≠ "contact") | **405** Method Not Allowed | continue |
| Per-IP rate limit (5 / 15-min rolling) | **429** + `Retry-After` header | continue |
| Honeypot field `_website` non-empty | **200** silent success view, **no mail** sent (logged) | continue |
| `EmailManager` is registered | render "not configured" (logged at error) | continue |
| `mail.enabled = true` | render "not configured" (logged at error) | continue |
| Recipient resolves | render "not configured" view | continue |
| Field validation (name 1–100, email 1–254 + shape, subject ≤200, message 1–5000) | **400** + form re-render with error + preserved values | continue |
| `EmailManager.sendTo` | **200** form re-render with "We could not send your message right now." | **200** success view (`state: "submitted"`) |

The mail / recipient checks now run **before** field validation, so a misconfigured deploy short-circuits to "not configured" without parsing the visitor's input. This is a behaviour change in v3.11.5 (#670 Phase B) — earlier versions accepted submissions and silently dropped them when mail was disabled.

---

## Recipient resolution

See *Recipient patterns* above for the three operator-facing patterns. This section covers the underlying resolver behaviour.

`UserManager.getContactRecipient(recipientOverride)`:

1. **If the override is non-empty** (after trim), return it as-is. Each address segment was already validated at startup (since v3.12.1, #670 Phase D); the resolver does not re-parse. If you need fine-grained control (CC, BCC, per-category routing), it's not in this resolver — wire it yourself or file an issue.
2. **Otherwise** iterate users in `getUsers()` order. For each user where `email` is non-empty AND `email !== "admin@localhost"` AND the user has the `admin` role, return their email. **First match wins.** "First" here means the iteration order returned by `UserManager.getUsers()`, which is filesystem-load order — predictable but not guaranteed alphabetical.
3. **If no admin with a real email exists**, return `null`. The handler renders the "not configured" view in that case; no mail is attempted.

The recipient is never written into the rendered HTML. Even on the success view, the visitor sees only "Message sent" — never the address it went to.

---

## Mail dependency

The `/contact` POST handler delegates mail send to `EmailManager.sendTo(recipient, subject, text)`. The mail subsystem is configured separately under the `ngdpbase.mail.*` namespace. Two providers:

| Provider | Behaviour | Use case |
|---|---|---|
| `console` (default) | Prints the message body to the server log; nothing is delivered. | Local development, tests. |
| `smtp` | Sends via Nodemailer to a configured SMTP relay. | Production. |

If `ngdpbase.mail.enabled` is `false`, both `GET /contact` and `POST /contact` render the **"not configured"** view rather than the form, and log at error level (#670 Phase B, v3.11.5):

```
[contactPage] ngdpbase.mail.enabled is false — rendering not-configured view;
visitors cannot submit until mail is configured

[processContact] ngdpbase.mail.enabled is false — rejecting submission with
not-configured view (was previously a silent drop)
```

The form is suppressed entirely; visitors see the operator-facing "please use whatever other channel" copy. The previous behaviour (return "Message sent" while silently dropping the submission) is gone. POST checks the mail subsystem **before** field validation, so a misconfigured deploy short-circuits without parsing input.

`EmailManager` not being registered at all is treated identically — both handlers render "not configured" and log at error.

For SMTP setup details (host, port, auth, From: address, custom-domain SPF/DKIM/DMARC), see [`email-setup.md`](./email-setup.md).

---

## Submission persistence (audit log)

Since v3.12.0 (#670 Phase C), every legitimate `POST /contact` submission is appended to a JSONL audit log. The log is the source of truth that survives mail failure: if SMTP rejects, if the upstream relay is down, if mail is misconfigured, the submission is still captured locally so an operator can recover it.

### What is and isn't logged

| Outcome | Persisted? | `mailResult` value |
|---|---|---|
| `EmailManager.sendTo` succeeded | yes | `"sent"` |
| `EmailManager.sendTo` threw | yes | `"mail-failed"` |
| `EmailManager` not registered | yes | `"mail-disabled"` |
| `ngdpbase.mail.enabled = false` | yes | `"mail-disabled"` |
| Recipient resolver returned null | yes | `"no-recipient"` |
| Honeypot field `_website` non-empty | **no** — visitor sees silent success; warn log records it |
| Per-IP rate limit (429) | **no** — rejected before any per-submission processing |
| Field validation error (400) | **no** — visitor mistake, not an attempted communication |

The four `mailResult` values cover every legitimate submission path. Honeypot, rate-limit, and validation rejections are deliberately excluded so the log file stays useful — operators can ack each entry as a real attempted contact.

### Entry shape

One JSON object per line:

```json
{
  "ts": "2026-05-10T12:34:56.789Z",
  "ip": "198.51.100.7",
  "userAgent": "Mozilla/5.0 (test)",
  "referer": "/view/contact-us",
  "name": "Alice",
  "email": "alice@example.com",
  "subject": "Hello",
  "message": "Hi there.",
  "recipient": "ops@example.com",
  "mailResult": "sent"
}
```

Notes:

- `ts` is ISO 8601 UTC, captured at write time.
- `ip` comes from `req.ip`; falls back to `null` if Express can't resolve it. Trust depends on whether `trust proxy` is configured upstream.
- `recipient` is `null` for `mail-disabled` and `no-recipient` outcomes (the address either wasn't resolved or didn't exist). For `sent` and `mail-failed`, it's the resolved address.
- The recipient address appears in the **log file** but never in the **response body** — there's an explicit test for that invariant.

### Path resolution

Default: `{instanceDataFolder}/contact-submissions.log`. The instance data folder resolves in this priority order (per `ConfigurationManager`):

1. `FAST_STORAGE` env var, if set
2. `INSTANCE_DATA_FOLDER` env var, if set
3. `./data` (cwd)

Set `ngdpbase.application.contact.persist.path` to an absolute path to override — useful for sending the log off the data volume to a mounted log directory:

```json
{
  "ngdpbase.application.contact.persist.path": "/var/log/ngdpbase/contact-submissions.log"
}
```

### Disabling persistence

For privacy-sensitive deploys, set:

```json
{
  "ngdpbase.application.contact.persist.enabled": false
}
```

The form continues to work normally; nothing is written to disk. Note that this also removes the recovery path for `mail-failed` submissions — there is no other record of the visitor's message, since no mail was delivered.

### Operational notes

- **No log rotation in v1.** The file grows monotonically. Operators who expect significant submission volume should rotate externally (logrotate, etc.) — see the [logrotate(8) man page](https://linux.die.net/man/8/logrotate) for the typical pattern.
- **Best-effort writes.** A failure to append is logged at error level via the main app logger but does NOT throw. Persistence must never block the response on the visitor-facing path.
- **Append-only.** The writer never truncates or rewrites the file. Existing entries are preserved across restarts.
- **No inbox UI.** There's no admin route for browsing the log today. Operators read it directly via `tail`, `jq`, or grep.
- **GDPR / right to erasure.** Submissions contain visitor-supplied PII (name, email, message body, IP, user-agent). If a visitor invokes deletion rights, operators must remove the relevant lines from the log file by hand — there's no built-in scrubber.

### Reading the log

JSONL plays nicely with `jq`:

```sh
# Last 10 entries
tail -n 10 /path/to/data/contact-submissions.log | jq .

# All mail-failed entries — these are the ones to recover
jq -c 'select(.mailResult == "mail-failed")' /path/to/data/contact-submissions.log

# Submissions in the last 24 hours
jq -c "select(.ts > \"$(date -u -v-24H +%Y-%m-%dT%H:%M:%SZ)\")" /path/to/data/contact-submissions.log
```

---

## Security & abuse defenses

### What's in place

- **Honeypot field `_website`** — hidden via inline CSS in `views/contact.ejs` (positioned `-10000px` off-screen, `tabindex="-1"`, `aria-hidden`). Bots that scrape and fill every field are caught; the request returns the success view but no mail is sent (rate-limit budget is still consumed). Logged at warn level.
- **Per-IP rate limit** — 5 submissions per IP per 15-minute rolling window, enforced by `SimpleRateLimiter`. Module-scope counter; distributed deployments get per-replica budgets, not a shared one. Run a real WAF or proxy upstream if you need cross-replica enforcement. Phase E of #670 will move these settings (max submissions, window, on/off) to config under `ngdpbase.mail.{honeypot,rate-limit}.*`.
- **Recipient sentinel** — install-default `admin@localhost` is excluded from auto-resolution, so a freshly installed dormant instance can't be turned into an open mail relay just by enabling `/contact`. The form renders "not configured" until an admin sets a real email or `contact.recipient` is set explicitly.
- **No HTML emails** — `EmailManager.sendTo` is called with plain-text body only; the subject prefix and from-address are server-controlled. Visitor-supplied HTML in the message field is delivered verbatim as text.

### Known gap: CSRF

`POST /contact` **does not validate CSRF tokens**. This is documented in the handler comment block (`WikiRoutes.ts` around line 4119) and the v3.11.1 CHANGELOG entry. Rationale: the codebase has no application-wide CSRF middleware (`csurf` is in `package.json` but never imported), and other POST routes — `/register`, `/admin/*` — also skip the check. Adding CSRF only on `/contact` would be inconsistent with that broader gap.

For an unauthenticated mail-send surface, the honeypot + rate limit + recipient sentinel cover realistic abuse. CSRF mainly matters for state-mutating actions a logged-in user could be tricked into; submitting an anonymous contact form on the attacker's behalf isn't a useful attack.

The broader CSRF gap is tracked separately and is not specific to this route.

---

## Verifying the setup

After configuring, restart the instance and probe each surface in order:

```sh
# Form renders (or shows "not configured")
curl -s -o /dev/null -w "GET /contact: %{http_code}\n" http://your-host/contact
# Expected: 200

# What does the body actually say?
curl -s http://your-host/contact | grep -E "Contact form is not configured|<form action=\"/contact\""
# If you see "Contact form is not configured" → no admin has a real email,
#   and contact.recipient is empty. Fix one or the other.
# If you see the <form> tag → recipient resolved; you're ready to submit.

# Footer link rendered? (Phase A)
curl -s http://your-host/ | grep -E 'href="/contact".*Contact'
# Expected: a match if mail.enabled, contact.enabled, recipient resolved,
# and contact.footer.enabled = true. Otherwise no match.

# Submission with a console-mode mail provider (local-dev path)
curl -s -X POST http://your-host/contact \
  -d "name=Test&email=test@example.com&subject=Hello&message=Probe" \
  -o /dev/null -w "POST /contact: %{http_code}\n"
# Expected: 200

# Tail the log to confirm the message body was rendered (console provider)
tail -n 200 /path/to/data/logs/*.log | grep -iE "ConsoleMail|sendTo|processContact"
```

For an SMTP-configured production instance, replace the log-tail step with a check of the recipient's inbox. Check both the submission **and** that `Retry-After` rate-limit headers fire on the 6th rapid POST from the same IP.

---

## Known limitations and design gaps

These aren't bugs you need to work around — they're current-state limitations being addressed in the remaining phases of #670 or tracked as separate codebase-wide concerns.

| Limitation | Status | Tracking |
|---|---|---|
| `mail.enabled = false` returns "Message sent" to the visitor | **Fixed in v3.11.5** | #670 Phase B — both handlers now render "not configured" and log at error level when `EmailManager` is unregistered or `mail.enabled = false` |
| Submissions are email-only (not persisted) | **Fixed in v3.12.0** | #670 Phase C — every legitimate POST is appended to `data/contact-submissions.log` (JSONL); see *Submission persistence* above |
| Recipient list pass-through is undocumented and unvalidated | **Fixed in v3.12.1** | #670 Phase D — startup invariant in `ConfigurationManager.assertContactRecipientWellFormed`; *Recipient patterns* doc section above |
| Anti-spam settings are hard-coded | Fix planned | #670 Phase E — config under `ngdpbase.mail.{honeypot,rate-limit}.*` |
| No CSRF validation on `POST /contact` | Codebase-wide gap, not route-specific | Tracked separately |
| Rate limit is per-replica, not shared | Architectural | Run a WAF / proxy upstream; per `docker/HEADLESS-DEPLOYMENT-NOTES.md` §9 |
| `contact-us` *page* is incorrectly tagged `system-category: documentation` | Cosmetic — wrong filter bucket in admin views | One-line fix to `required-pages/c0a01d19-…md`; not blocking |
| Recipient resolver returns the *first* admin in load order | Not alphabetical; multi-admin sites get an arbitrary primary | Set `contact.recipient` explicitly to be deterministic |
| Composition with `ngdpbase.application.registration: false` requires authoring an intermediate page that links to `/contact` | The "Request access" header button can't directly point at `/contact` because `views/header.ejs` hard-codes `/view/<slug>` | Edit the seeded `request-access` or `contact-us` page to include a JSPWiki-style link to `/contact`, or wait for a future PR that adds a `redirect-url` config |

---

## Roadmap (#670)

Tracked as one umbrella `[FEATURE]` issue with five phases:

| Phase | Description | Status |
|---|---|---|
| A | Footer link to `/contact`, `contactAvailable` plumbing, `contact.footer.enabled` toggle | **Shipped v3.11.4** |
| B | Mail-disabled UX honesty (render "not configured", log at error) | **Shipped v3.11.5** |
| C | Submission persistence to `data/contact-submissions.log` (JSONL) | **Shipped v3.12.0** |
| D | Recipient list validation at startup + docs for inline-CSV vs distribution-list patterns | **Shipped v3.12.1** |
| E | Configurable anti-spam under `ngdpbase.mail.{honeypot,rate-limit}.*` | Planned |

This doc is updated as each phase merges.

---

## Related

- [`config/app-default-config.json`](../../config/app-default-config.json) — the inline `_comment_application_contact` block documents the four keys at source-of-truth scale.
- [`docs/admin/email-setup.md`](./email-setup.md) — required reading before going live: SMTP provider selection, App Passwords, custom-domain SPF/DKIM/DMARC, troubleshooting.
- [`docs/admin/Self-Registration.md`](./Self-Registration.md) — the registration toggle and how it composes with `/contact`.
- [`docker/HEADLESS-DEPLOYMENT-NOTES.md`](../../docker/HEADLESS-DEPLOYMENT-NOTES.md) §9 — operator activation steps for the contact feature in a containerised deploy, plus rate-limit caveats for replicas.
- `required-pages/c0a01d19-4558-482d-a485-a94ed3ff1729.md` — the seeded `contact-us` page (the static text landing page, separate from this form route).
- `src/routes/WikiRoutes.ts` — `contactPage` (GET, ~line 4055), `processContact` (POST, ~line 4127), `contactRateLimiter` (~line 312), `getCommonTemplateData` (~line 515 — derives `contactAvailable`).
- `src/managers/UserManager.ts` `getContactRecipient` — the recipient resolver.
- `src/managers/EmailManager.ts` — the mail dispatch layer; `console` and `smtp` providers; `isEnabled()` reads `ngdpbase.mail.enabled`.
- `src/managers/ConfigurationManager.ts` `assertContactPageNotLoop` — the `contact.page = "contact"` redirect-loop guard.
- `src/managers/ConfigurationManager.ts` `assertContactRecipientWellFormed` — the recipient-shape startup invariant (#670 Phase D).
- `src/utils/SimpleRateLimiter.ts` — the rate limiter used by this route (and a few others).
- `src/utils/ContactSubmissionLog.ts` — the JSONL writer (#670 Phase C); append-only, best-effort, never throws.
- `views/contact.ejs` — the form template, including the `_website` honeypot field.
- `views/footer.ejs` — the footer view; renders the `/contact` link when `contactAvailable && contactFooterEnabled`.
- Issue **#658** — the original `/contact` feature; closed in v3.11.1.
- Issue **#670** — umbrella for ongoing improvements; phases A–E.
