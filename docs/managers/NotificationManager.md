---
name: NotificationManager
description: "System and per-user notifications — toast popups, persistent inbox, scheduled expiry"
dateModified: '2026-05-14'
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
  targetUsers: [],  // Empty = all users
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)  // 24 hours
});

// Get notifications for a user
const userNotifications = notifyManager.getUserNotifications('alice');

// Dismiss notification
await notifyManager.dismissNotification(id, 'alice');
```

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

- [ACLManager](ACLManager.md) - Sends access decision notifications
- [ConfigurationManager](ConfigurationManager.md) - Notification settings

## Developer Documentation

For complete API reference, see:

- [NotificationManager-Complete-Guide.md](NotificationManager-Complete-Guide.md)
- [Generated API Docs](../api/generated/src/managers/NotificationManager/README.md)
