# Plan: EmailManager + NotificationManager Email Escalation

GitHub issues: #456 (Phase 1 — EmailManager), #457 (Phase 2 — escalation)

---

## Context

Mail sending was previously hard-coded inside `AuthManager` under config keys scoped to
`ngdpbase.auth.magic-link.smtp.*`. This coupled email entirely to magic-link auth.
`NotificationManager` already has `level` (`info|warning|error|success`) and `type`
(`maintenance|system|user`) but sent nothing — notifications were in-app only.

Goals:

1. __Phase 1__ — `EmailManager`: a proper manager for all outbound email, config under
   `ngdpbase.mail.*`, any SMTP relay supported via config (no per-service classes).
2. __Phase 2__ — Notification escalation: `NotificationManager` optionally emails
   admins when a notification meets a configured level threshold.

Magic-link remains fully optional. Browser push notifications (Web Push / VAPID) are
out of scope — separate future issue.

---

## Phase 1 — EmailManager (#456)

### Files changed / created

| File | Change |
|------|--------|
| `config/app-default-config.json` | Replaced `magic-link.smtp.*` with `ngdpbase.mail.*` |
| `src/managers/EmailManager.ts` | __New__ — extends BaseManager, implements MailProvider |
| `src/managers/AuthManager.ts` | Removed inline mail factory; uses EmailManager |
| `src/WikiEngine.ts` | Registers EmailManager before AuthManager |
| `src/managers/__tests__/EmailManager.test.js` | __New__ — 10 unit tests |
| `src/managers/__tests__/AuthManager.test.js` | Updated mocks to use EmailManager |
| `docs/admin/email-setup.md` | __New__ — SMTP setup guide (provider-agnostic) |

Existing `src/mail/MailProvider.ts` and `src/mail/NodemailerMailProvider.ts` — kept as-is.

### Config keys (`config/app-default-config.json`)

Old keys removed:

- `ngdpbase.auth.magic-link.mail-transport`
- `ngdpbase.auth.magic-link.smtp.*`

New keys added:

```json
"ngdpbase.mail.enabled": false,
"ngdpbase.mail.provider": "console",
"ngdpbase.mail.from": "",
"ngdpbase.mail.provider.smtp.host": "",
"ngdpbase.mail.provider.smtp.port": 587,
"ngdpbase.mail.provider.smtp.secure": false,
"ngdpbase.mail.provider.smtp.user": "",
"ngdpbase.mail.provider.smtp.pass": "",
"ngdpbase.mail.provider.smtp.from": ""
```

`ngdpbase.mail.from` = global default sender.
`ngdpbase.mail.provider.smtp.from` overrides it (allows display names).
Default `enabled: false` — operators opt in explicitly.

### EmailManager design

Extends `BaseManager`, implements `MailProvider` so it drops into `MagicLinkAuthProvider`
without any changes to that class.

```
initialize():
  Read ngdpbase.mail.enabled
  Read ngdpbase.mail.provider ('console' | 'smtp')
  Resolve effective from: smtp.from || mail.from
  If enabled && provider=console → logger.warn (emails logged not sent)
  If provider=smtp:
    validate: host required (error), from required (error),
              user/pass empty → warn (some relays allow anon)
    create NodemailerMailProvider(smtpConfig)
  Log: [EmailManager] Initialized provider=smtp from=noreply@...

send(message: MailMessage):
  Inject this.from if message.from absent
  Delegate to this.provider.send()

sendTo(to, subject, text, html?): convenience wrapper over send()
getProviderName(): 'console' | 'smtp'
getFrom():         effective from address
isEnabled():       ngdpbase.mail.enabled
```

### Manager registration order

`EmailManager` must be initialized before `AuthManager` in `WikiEngine.ts`:

```
UserManager → EmailManager → AuthManager → NotificationManager → ...
```

---

## Phase 2 — NotificationManager Email Escalation (#457)

> Separate issue. Depends on Phase 1 being merged.

### Proposed config additions

```json
"ngdpbase.notifications.email.enabled": false,
"ngdpbase.notifications.email.min-level": "error",
"ngdpbase.notifications.email.admin-address": ""
```

`min-level` ordered: `info < warning < error`. `success` notifications never email.

### Behavior in `NotificationManager.createNotification()`

After storing the notification, if email escalation is configured:

```typescript
if (this.shouldEmail(notification)) {
  const emailManager = this.engine.getManager<EmailManager>('EmailManager');
  if (emailManager?.isEnabled()) {
    const adminAddress = cfgMgr.getProperty('ngdpbase.notifications.email.admin-address', '');
    if (adminAddress) {
      await emailManager.sendTo(
        adminAddress,
        `[${notification.level.toUpperCase()}] ${notification.title}`,
        notification.message
      );
    }
  }
}
```

`shouldEmail()` checks level meets threshold and type is `system` or `maintenance`
(not `user` — user notifications don't email admin).

### Phase 2 files

- `src/managers/NotificationManager.ts` — add email escalation in `createNotification()`
- `config/app-default-config.json` — add `ngdpbase.notifications.email.*` keys
- `src/managers/__tests__/NotificationManager.test.js` — add escalation tests

---

## Decision log

| Decision | Rationale |
|----------|-----------|
| `ngdpbase.mail.*` namespace (not per-feature) | Single manager shared across all mail-sending features |
| SMTP only, no SDK-specific providers | Config-only differentiation; one `NodemailerMailProvider` covers all relays |
| Mailgun rejected | Cost after free trial; not justified for a self-hosted wiki platform |
| `EmailManager implements MailProvider` | Drops into `MagicLinkAuthProvider.mailProvider` with no changes to that class |
| `enabled: false` default | Operators must opt in; avoids surprise emails on first boot |
| Phase 2 as separate issue | NotificationManager escalation depends on Phase 1 being stable |
