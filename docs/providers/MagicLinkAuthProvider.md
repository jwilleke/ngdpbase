---
name: MagicLinkAuthProvider
description: Email-based passwordless authentication — user gets a single-use verification link
dateModified: '2026-05-28'
category: providers
code: src/providers/MagicLinkAuthProvider.ts
---

# MagicLinkAuthProvider

Passwordless authentication via emailed verification link. User enters email → provider generates a single-use token, emails a link → user clicks → token verified → session created.

## Configuration

- `ngdpbase.auth.magic-link.enabled` = `true`
- `ngdpbase.auth.magic-link.token-ttl` — link expiry (default 15 min)
- `ngdpbase.auth.magic-link.from-name` — email From display name
- Outgoing email uses [EmailManager](../managers/EmailManager.md) (selected via `ngdpbase.mail.provider`)

## Flow

1. **Initiate** — user enters email. Provider:
   - Generates a random token + persists `{token, email, expiresAt}` in `MagicLinkStore`.
   - Sends an email with a link to `<canonical-url>/auth/magic-link/verify?token=...`.
2. **Verify** — user clicks link. Provider:
   - Looks up the token, checks expiry, marks it used.
   - Resolves the email to an ngdpbase user (auto-provisions if enabled).
   - Returns success → AuthManager creates the session.

## See Also

- [BaseAuthProvider](BaseAuthProvider.md) — the contract
- [AuthManager](../managers/AuthManager.md) — dispatcher
- [EmailManager](../managers/EmailManager.md) — outbound transport
- Issue #456 — magic-link consolidation onto EmailManager
