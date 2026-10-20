---
name: EmailManager
description: Shared outbound email transport — pluggable provider (console / SMTP)
dateModified: '2026-10-19'
category: managers
code: src/managers/EmailManager.ts
---

# EmailManager

Single manager used by any feature that needs to send email: magic-link auth, notification escalation, server-error alerts, etc. Implements the `MailProvider` interface itself, so it can be passed directly to consumers like `MagicLinkAuthProvider` without coupling them to a specific transport.

## Providers

Selected by `ngdpbase.mail.provider`:

| Provider | Behaviour | Use case |
|---|---|---|
| `console` | Logs the message to the server log instead of sending | Default / development |
| `smtp` | Sends via `NodemailerMailProvider` (works with any SMTP relay: Gmail, Resend, SendGrid, SES, Postfix, …) | Production |

## Configuration

See `docs/admin/email-setup.md` for the full config surface. Headline keys:

- `ngdpbase.mail.provider` — `console` \| `smtp`
- `ngdpbase.mail.from` — From address
- `ngdpbase.mail.smtp.*` — SMTP host/port/auth (when `provider === smtp`)
- `ngdpbase.mail.failure-notice.window-minutes` — default `60`; how long one failure notice to administrators keeps counting before a new one is opened

## When a send fails

Every sender goes through `send()` (`sendTo()` and `sendInBackground()` call it), so a failure is reported here once, for all of them ([#1916](https://github.com/jwilleke/ngdpbase/issues/1916)):

- __Logged__ at error level: provider, recipient domain, subject and the error. Never the body, never the full address; an address quoted inside the SMTP error is cut to its domain.
- __Degraded__: the manager's state becomes `degraded` (reason `SEND_FAILING_REASON`), which the admin dashboard shows and the audit trail records as a manager state change. The next successful send clears it. `isDeliveryFailing()` answers whether that is the case now.
- __Administrators notified__: holders of `admin-system` get one `error` notification, "Email could not be sent", per window. Failures inside the window update its running count instead of sending another. With nobody holding `admin-system`, the log alone carries it.
- __Never emailed__: the notice is created with `escalate: false`, so notification escalation does not try to email it. That email would fail and report another failure.
- __Still rejects__: `send()` and `sendTo()` rethrow after reporting, so a caller with a person waiting can tell them. `sendInBackground()` never rejects; use it where nobody is waiting (a form's confirmation copy, a reservation notice).
- __The `console` provider is never a failure__: it prints and resolves.

What the callers do:

| Caller | Person waiting? | On failure |
|---|---|---|
| Forms add-on, submission copy | no | `sendInBackground`; the submission still succeeds |
| Calendar add-on, reservation emails | no | `sendInBackground`; the reservation still succeeds |
| NotificationManager, escalation | no | logs a warning; never escalates the failure notice |
| Magic-link request (`POST /auth/magic-link`) | yes | while `isDeliveryFailing()`, the login page says no link is on its way. Asked of the site's mail state, not of this request's send, so every address gets the same answer |
| Two-step approval email | yes | `sendEmailApproval` returns `failed`; the page says the email could not be sent, and a retry is not held back |
| Second-factor enrolment | yes | the profile page shows the error |
| Contact form | yes | the form says the message could not be sent (unchanged) |

## See Also

- Issue #456 — EmailManager + magic-link consolidation
- [MagicLinkAuthProvider](../providers/MagicLinkAuthProvider.md) — primary consumer
