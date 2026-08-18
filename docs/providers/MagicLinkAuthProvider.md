---
name: MagicLinkAuthProvider
description: Email-based passwordless authentication — user gets a single-use verification link
dateModified: '2026-08-04'
category: providers
code: src/providers/MagicLinkAuthProvider.ts
---

# MagicLinkAuthProvider

Passwordless authentication via emailed verification link. User enters email → provider generates a single-use token, emails a link → user clicks → confirmation page → user clicks "Sign in" → token consumed and session created.

## Configuration

- `ngdpbase.auth.magic-link.enabled` = `true`
- `ngdpbase.auth.magic-link.token-ttl` — link expiry (default 15 min)
- `ngdpbase.auth.magic-link.from-name` — email From display name
- Outgoing email uses [EmailManager](../managers/EmailManager.md) (selected via `ngdpbase.mail.provider`)

## Flow

1. __Initiate__ — user enters email. Provider:
   - Generates a random token + stores `{username, email, redirect, expiresAt}` in memory.
   - Sends an email with a link to `<canonical-url>/auth/magic-link/verify?token=...`.
2. __Confirm__ — `GET /auth/magic-link/verify`. Validates the token for display only and renders the `magic-link-confirm` interstitial. __Consumes nothing and creates no session.__
3. __Complete__ — `POST /auth/magic-link/verify`, submitted by the button on that page. Consumes the token, creates the session, redirects to the stored target.

### Why the flow has two steps (#1019)

Enterprise mail security — Microsoft Defender Safe Links, Proofpoint and similar — pre-fetches every URL in an incoming message to scan it. When verification lived on the `GET`, that pre-fetch consumed the single-use token, so the link was already dead by the time the user clicked it; the scanner's request also received a valid session cookie. Behind such a gateway the feature did not work at all.

Splitting the flow fixes it: the scanner's `GET` is harmless, and the `POST` carries the per-session CSRF token issued by [the app-wide CSRF middleware](../../src/middleware/csrf.ts), which a scanner following a link has no way to produce. The verb alone would not be enough — some scanners do follow forms — so the CSRF token is the part that actually makes it robust.

For the same reason the interstitial must never auto-submit: no meta refresh, no scripted `form.submit()`. The deliberate click is the mechanism.

## Known limitations

- __Tokens are in-memory only.__ They are lost on restart and are not shared between processes, so magic links break under pm2 cluster mode or any multi-instance deployment. Acceptable at the default 15-minute TTL on a single fork-mode instance.
- __No IP-based request throttle.__ A per-email limit of 1 request per 60 s exists (`isRateLimited()`); nothing caps a single client rotating through addresses. Tracked in #1020.
- __No device binding.__ Any device holding the URL can complete the sign-in, and redemption records no IP or User-Agent. Tracked in #1022.

## See Also

- [BaseAuthProvider](BaseAuthProvider.md) — the contract
- [AuthManager](../managers/AuthManager.md) — dispatcher
- [EmailManager](../managers/EmailManager.md) — outbound transport
- Issue #456 — magic-link consolidation onto EmailManager
- Issue #1019 — GET no longer consumes the token (the two-step flow above)
