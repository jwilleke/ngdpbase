---
name: EmailManager
description: Shared outbound email transport — pluggable provider (console / SMTP)
dateModified: '2026-05-28'
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

## See Also

- Issue #456 — EmailManager + magic-link consolidation
- [MagicLinkAuthProvider](../providers/MagicLinkAuthProvider.md) — primary consumer
