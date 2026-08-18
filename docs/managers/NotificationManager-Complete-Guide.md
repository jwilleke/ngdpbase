# NotificationManager Complete Guide

__Module:__ `src/managers/NotificationManager.js`
__Quick Reference:__ [NotificationManager.md](NotificationManager.md)
__Generated API:__ [API Docs](../api/generated/src/managers/NotificationManager/README.md)

---

## Table of Contents

1. [Architecture](#architecture)
2. [Initialization](#initialization)
3. [Configuration](#configuration)
4. [Creating Notifications](#creating-notifications)
5. [Querying Notifications](#querying-notifications)
6. [Managing Notifications](#managing-notifications)
7. [Persistence](#persistence)
8. [API Reference](#api-reference)
9. [Integration Examples](#integration-examples)

---

## Architecture

```text
┌─────────────────────────────────────────────────────────┐
│                 NotificationManager                      │
│  - createNotification(notification)                      │
│  - getUserNotifications(username)                        │
│  - dismissNotification(id, username)                     │
└────────────────┬────────────────────────────────────────┘
                 │
         ┌───────┴────────┐
         ▼                ▼
┌─────────────────┐ ┌──────────────────┐
│ ConfigManager   │ │ notifications.json│
│ (settings)      │ │ (persistence)     │
└─────────────────┘ └──────────────────┘
```

### Properties

| Property | Type | Description |
| ---------- | ------ | ------------- |
| `notifications` | `Map<string, Object>` | Active notifications by ID |
| `notificationId` | `number` | Auto-incrementing ID counter |
| `storagePath` | `string\|null` | Path to JSON storage file |
| `saveQueue` | `Set<number>` | Notifications pending save |
| `saveInterval` | `NodeJS.Timer` | Auto-save interval handle |

---

## Initialization

```javascript
async initialize(config = {}) {
  await super.initialize(config);

  const cfgMgr = this.engine?.getManager?.('ConfigurationManager');

  // Configuration from ConfigurationManager
  const defaultDir = cfgMgr?.getProperty?.('ngdpbase.directories.data', './data');
  const dataDirCfg = cfgMgr?.getProperty?.('ngdpbase.notifications.dir', defaultDir);
  const fileNameCfg = cfgMgr?.getProperty?.('ngdpbase.notifications.file', 'notifications.json');
  const intervalCfg = cfgMgr?.getProperty?.('ngdpbase.notifications.auto-save-interval');

  this.storagePath = path.resolve(dataDirCfg, fileNameCfg);

  await this.loadNotifications();

  // Set up periodic auto-save
  this.saveInterval = setInterval(() => {
    this.saveNotifications();
  }, intervalMs);
}
```

---

## Configuration

All settings come from ConfigurationManager:

| Property | Type | Default | Description |
| ---------- | ------ | --------- | ------------- |
| `ngdpbase.directories.data` | string | `./data` | Base data directory |
| `ngdpbase.notifications.dir` | string | (data dir) | Notifications directory |
| `ngdpbase.notifications.file` | string | `notifications.json` | Storage filename |
| `ngdpbase.notifications.auto-save-interval` | number | `300000` | Auto-save interval (ms) |

---

## Creating Notifications

### createNotification(notification)

Create a new notification.

```javascript
async createNotification(notification)
```

__Parameters:__

| Field | Type | Required | Description |
| ------- | ------ | ---------- | ------------- |
| `type` | string | No | Type: system, maintenance, user (default: system) |
| `title` | string | No | Notification title (default: "System Notification") |
| `message` | string | No | Notification message |
| `level` | string | No | Level: info, warning, error, success (default: info) |
| `targetUsers` | string[] | No | Target usernames, empty = all users |
| `expiresAt` | Date | No | Expiration date/time |

__Returns:__ `string` - Notification ID (e.g., `notification_1`)

__Example:__

```javascript
const id = await notifyManager.createNotification({
  type: 'system',
  title: 'New Feature Available',
  message: 'Check out the new export functionality!',
  level: 'info',
  targetUsers: [],
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)  // 1 week
});
```

---

### addNotification(notification)

Alias for `createNotification()` for backward compatibility.

---

### createMaintenanceNotification(enabled, adminUsername, config)

Create a maintenance mode notification.

```javascript
async createMaintenanceNotification(enabled, adminUsername, config = {})
```

__Parameters:__

- `enabled` - Whether maintenance mode is enabled
- `adminUsername` - Admin who toggled maintenance mode
- `config` - Maintenance configuration (optional)

__Returns:__ `string` - Notification ID

__Example:__

```javascript
// Maintenance enabled
const id = await notifyManager.createMaintenanceNotification(true, 'admin');

// Maintenance disabled (auto-expires in 24 hours)
const id = await notifyManager.createMaintenanceNotification(false, 'admin');
```

---

## Querying Notifications

### getUserNotifications(username, includeExpired)

Get notifications for a specific user.

```javascript
getUserNotifications(username, includeExpired = false)
```

__Parameters:__

- `username` - Username to get notifications for
- `includeExpired` - Include expired notifications (default: false)

__Returns:__ `Array<Object>` - Notifications for the user

__Filters:__

- Excludes expired notifications (unless includeExpired is true)
- Includes notifications targeted to this user or all users
- Excludes notifications user has dismissed

---

### getAllNotifications(includeExpired)

Get all notifications.

```javascript
getAllNotifications(includeExpired = false)
```

__Returns:__ `Array<Object>` - All notifications

---

### getStats()

Get notification statistics.

```javascript
getStats()
```

__Returns:__

```javascript
{
  total: 15,           // Total notifications
  active: 10,          // Non-expired
  expired: 5,          // Expired
  byType: {
    system: 8,
    maintenance: 2,
    user: 5
  },
  byLevel: {
    info: 10,
    warning: 3,
    error: 1,
    success: 1
  }
}
```

---

## Managing Notifications

### dismissNotification(notificationId, username)

Dismiss a notification for a user.

```javascript
async dismissNotification(notificationId, username)
```

__Parameters:__

- `notificationId` - Notification ID to dismiss
- `username` - Username dismissing the notification

__Returns:__ `boolean` - Success status

__Note:__ Dismissal is per-user. Other users still see the notification.

---

### cleanupExpiredNotifications()

Remove all expired notifications.

```javascript
async cleanupExpiredNotifications()
```

Called automatically during periodic operations.

---

### clearAllActive()

Clear all active (non-expired) notifications.

```javascript
async clearAllActive()
```

__Returns:__ `number` - Count of cleared notifications

---

## Persistence

### loadNotifications()

Load notifications from storage file.

```javascript
async loadNotifications()
```

- Restores notifications from JSON file
- Converts date strings back to Date objects
- Updates ID counter to prevent collisions

---

### saveNotifications()

Save notifications to storage file.

```javascript
async saveNotifications()
```

- Called automatically at interval
- Called after create/dismiss operations
- Called during shutdown

__Storage format:__

```json
{
  "lastSaved": "2025-12-19T12:00:00.000Z",
  "notifications": {
    "notification_1": {
      "id": "notification_1",
      "type": "system",
      "title": "Welcome",
      "message": "Welcome to ngdpbase!",
      "level": "info",
      "targetUsers": [],
      "createdAt": "2025-12-19T10:00:00.000Z",
      "expiresAt": null,
      "dismissedBy": ["alice"]
    }
  }
}
```

---

## API Reference

### Creation Methods

| Method | Parameters | Returns |
| -------- | ------------ | --------- |
| `createNotification(notification)` | Object | `Promise<string>` |
| `addNotification(notification)` | Object | `Promise<string>` |
| `createMaintenanceNotification(enabled, admin, config)` | boolean, string, Object? | `Promise<string>` |

### Query Methods

| Method | Parameters | Returns |
| -------- | ------------ | --------- |
| `getUserNotifications(username, includeExpired)` | string, boolean? | `Array<Object>` |
| `getAllNotifications(includeExpired)` | boolean? | `Array<Object>` |
| `getStats()` | - | `Object` |

### Management Methods

| Method | Parameters | Returns |
| -------- | ------------ | --------- |
| `dismissNotification(id, username)` | string, string | `Promise<boolean>` |
| `cleanupExpiredNotifications()` | - | `Promise<void>` |
| `clearAllActive()` | - | `Promise<number>` |

### Persistence Methods

| Method | Parameters | Returns |
| -------- | ------------ | --------- |
| `loadNotifications()` | - | `Promise<void>` |
| `saveNotifications()` | - | `Promise<void>` |
| `shutdown()` | - | `Promise<void>` |

---

## Integration Examples

### Display User Notifications

```javascript
// Middleware to load notifications for views
app.use(async (req, res, next) => {
  if (req.user) {
    const notifyManager = engine.getManager('NotificationManager');
    res.locals.notifications = notifyManager.getUserNotifications(req.user.username);
  }
  next();
});
```

### Notification API Endpoints

```javascript
// Get notifications
app.get('/api/notifications', (req, res) => {
  const notifyManager = engine.getManager('NotificationManager');
  const notifications = notifyManager.getUserNotifications(req.user.username);
  res.json(notifications);
});

// Dismiss notification
app.post('/api/notifications/:id/dismiss', async (req, res) => {
  const notifyManager = engine.getManager('NotificationManager');
  const success = await notifyManager.dismissNotification(
    req.params.id,
    req.user.username
  );
  res.json({ success });
});
```

### Admin Notification Management

```javascript
// Create system announcement
app.post('/admin/notifications', async (req, res) => {
  const notifyManager = engine.getManager('NotificationManager');
  const id = await notifyManager.createNotification({
    type: 'system',
    title: req.body.title,
    message: req.body.message,
    level: req.body.level,
    expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null
  });
  res.json({ success: true, id });
});

// Get statistics
app.get('/admin/notifications/stats', (req, res) => {
  const notifyManager = engine.getManager('NotificationManager');
  res.json(notifyManager.getStats());
});
```

---

## Notes

- __Auto-save:__ Notifications are saved automatically at configurable intervals
- __Graceful shutdown:__ `shutdown()` clears interval and performs final save
- __Per-user dismissal:__ Each user can dismiss independently
- __ID format:__ IDs are `notification_{number}` format

---

## Related Documentation

- [NotificationManager.md](NotificationManager.md) - Quick reference
- [ACLManager](ACLManager.md) - Access logging integration
- [ConfigurationManager](ConfigurationManager.md) - Settings
