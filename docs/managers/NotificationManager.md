---
name: NotificationManager
description: "System and per-user notifications — toast popups, persistent inbox, scheduled expiry"
dateModified: '2026-10-26'
category: managers
code: src/managers/NotificationManager.ts
---

# NotificationManager

__Module:__ `src/managers/NotificationManager.ts`
__Extends:__ [BaseManager](BaseManager.md)
__Complete Guide:__ [NotificationManager-Complete-Guide.md](NotificationManager-Complete-Guide.md)

---

## Overview

NotificationManager handles system notifications and user alerts with persistent storage. It manages user-facing notifications with support for targeting, expiration, and dismissal tracking.

## Key Features

- Create and manage system notifications
- Target notifications to specific users or all users
- Automatic expiration and cleanup
- Persistent storage to JSON file
- User dismissal tracking
- Notification statistics

## Quick Example

```javascript
const notifyManager = engine.getManager('NotificationManager');

// Create a notification
const id = await notifyManager.createNotification({
  type: 'system',
  title: 'Scheduled Maintenance',
  message: 'Wiki will be down for maintenance at 2:00 AM',
  level: 'warning',
  targetUsers: [],  // Empty = all users; usernames or identity @ids, stored as @ids
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)  // 24 hours
});

// Get notifications for a user: their context, matched by identity @id
const userNotifications = await notifyManager.getUserNotifications(ctx);

// Dismiss notification: the caller's context
await notifyManager.dismissNotification(id, ctx);
```

## Recipients by identity @id

A notification names its recipients (`targetUsers`) and who dismissed it (`dismissedBy`) by identity `@id` ([#2041](https://github.com/jwilleke/ngdpbase/issues/2041), step 6 of the [identity model](../planning/identity-model.md)). `createNotification` takes usernames or `@id`s and stores each username as the user's `@id`, from `IdentityManager.identityIdOf(ctx, username)` under the system context; a name with no account, or any name while the identity store cannot answer, is stored as given (so `notifyAdmins` and every other notice still go out with the store down). `dismissNotification(id, ctx)` stores the caller's `@id`, and `getUserNotifications(ctx)` matches the caller's `@id` or username.

At start-up the manager converts the stored file once: each `targetUsers` and `dismissedBy` entry that is still a username becomes the user's `@id`, and the file is written once. Entries already an `@id` (`urn:`), `anonymous` and the system principal are left alone, so a second start writes nothing. A username with no account becomes `orphan:<name>` (nobody's from then on: a later account with the same name never takes it over, and the notice reaches nobody by it); the orphans are logged at every start, counts only, at info: an orphan is the intended final state and needs nothing from an administrator, so it is never on the dashboard ([#2097](https://github.com/jwilleke/ngdpbase/issues/2097)). An orphan is never looked up again. When the identity store cannot answer, nothing is converted, the dashboard says "identity store unavailable, conversion postponed", and the next start tries again.

## One notice with a running count

`createNotification({ ..., escalate: false })` never emails the notification, whatever the escalation settings. `updateNotificationMessage(id, message)` replaces an existing notification's message without escalating, so one notice can carry a running count instead of one notice per event. EmailManager uses both for its "Email could not be sent" notice ([#1916](https://github.com/jwilleke/ngdpbase/issues/1916)).

## Notification Types

| Type | Description |
| ------ | ------------- |
| `system` | General system announcements |
| `maintenance` | Maintenance mode notifications |
| `user` | User-specific notifications |

## Severity Levels

| Level | Description |
| ------- | ------------- |
| `info` | Informational message |
| `warning` | Warning or caution |
| `error` | Error or problem |
| `success` | Success confirmation |

## Related Managers

- [PolicyInformationPoint](PolicyInformationPoint.md) - Sends access decision notifications
- [ConfigurationManager](ConfigurationManager.md) - Notification settings

## Developer Documentation

For complete API reference, see:

- [NotificationManager-Complete-Guide.md](NotificationManager-Complete-Guide.md)
- [Generated API Docs](../api/generated/src/managers/NotificationManager/README.md)
