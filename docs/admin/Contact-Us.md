# Contact Us

ngdpbase ships a built-in `/contact` route that operators can use as a zero-authoring contact form. It's separate from — and composable with — the self-registration toggle, the seeded `Contact Us` page, and any wiki page that links to it.

The form is server-rendered, posts back to `/contact`, validates inputs, defends against bot spam (honeypot + per-IP rate limit), resolves a recipient (explicit config or first-admin fallback), and delivers via the existing `EmailManager`. When mail is unconfigured the form renders a "not configured" state instead, so visitors don't get a misleading success.

This doc covers the current shipping behaviour as of **v3.11.5**. The feature originally landed in #658 (v3.11.0 GET preview, v3.11.1 closed the form-and-send loop). Subsequent improvements ship under the umbrella issue #670 in five phases (A–E); see the *Roadmap* section at the end for what's done vs planned.

---

## What `/contact` does

| Verb | Path | Behaviour |
|---|---|---|
| `GET` | `/contact` | Renders the built-in form (`views/contact.ejs`) — name, email, optional subject, message, plus a hidden honeypot field. |
| `POST` | `/contact` | Validates and sends the message; re-renders the same view with a success banner, a validation error, or a "not configured" notice. |

What it is **not**:

- It is not a ticketing system. Submissions go to email; nothing is persisted server-side (Phase C of #670 will add a JSONL audit log).
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
| `ngdpbase.application.contact.recipient` | `""` | Empty → resolve at request time to the first admin user whose email isn't the install-default sentinel `admin@localhost`. Set to an email (or an SMTP-accepted comma-separated list) → use that verbatim. |
| `ngdpbase.application.contact.footer.enabled` | `true` | Render a "Contact" link in the page footer when `contactAvailable` is true (#670 Phase A). Set `false` to keep `/contact` reachable without advertising it. |

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

`UserManager.getContactRecipient(recipientOverride)`:

1. **If the override is non-empty** (after trim), return it as-is. Multi-recipient strings (e.g. `"ops@example.com, alerts@example.com"`) are passed through to `EmailManager.sendTo` and ultimately to the SMTP transport — Nodemailer accepts comma-separated `to:` headers, so this works in practice. Phase D of #670 will add startup validation of each address in the list. If you need fine-grained control (CC, BCC, per-category routing), it's not in this resolver — wire it yourself or file an issue.
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
| Submissions are email-only (not persisted) | Fix planned | #670 Phase C — append to `data/contact-submissions.log` (JSONL) |
| Recipient list pass-through is undocumented and unvalidated | Fix planned | #670 Phase D — startup invariant + doc update |
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
| C | Submission persistence to `data/contact-submissions.log` (JSONL) | Planned |
| D | Recipient list validation at startup + docs for inline-CSV vs distribution-list patterns | Planned |
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
- `src/utils/SimpleRateLimiter.ts` — the rate limiter used by this route (and a few others).
- `views/contact.ejs` — the form template, including the `_website` honeypot field.
- `views/footer.ejs` — the footer view; renders the `/contact` link when `contactAvailable && contactFooterEnabled`.
- Issue **#658** — the original `/contact` feature; closed in v3.11.1.
- Issue **#670** — umbrella for ongoing improvements; phases A–E.
