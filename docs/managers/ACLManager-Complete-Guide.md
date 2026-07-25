# ACLManager Complete Guide

**Module:** `src/managers/ACLManager.js`
**Quick Reference:** [ACLManager.md](ACLManager.md)
**Generated API:** [API Docs](../api/generated/src/managers/ACLManager/README.md)

---

## Table of Contents

1. [Architecture](#architecture)
2. [Permission Evaluation Order](#permission-evaluation-order)
3. [Initialization](#initialization)
4. [Configuration](#configuration)
5. [ACL Markup Syntax](#acl-markup-syntax)
6. [Permission Checking Methods](#permission-checking-methods)
7. [Context-Aware Restrictions](#context-aware-restrictions)
8. [Audit Logging](#audit-logging)
9. [API Reference](#api-reference)
10. [Integration Examples](#integration-examples)

---

## Permission Evaluation Order

Every page access call goes through `checkPagePermissionWithContext(wikiContext, action)`.
The method evaluates tiers in order and **returns on the first decision**. Later tiers are
only reached if earlier ones did not decide.

```text
Tier 0  — private keyword        hard deny; only admin or page creator allowed
Tier 1  — frontmatter audience   page-level restriction; overrides all global policies
Tier 2  — global PolicyEvaluator site-wide policy fallback (ngdpbase.access.policies)
Tier 3  — legacy page ACL markup deprecated [{ALLOW}]/[{DENY}] — blocked on new saves
Default — deny                   if nothing matched, access is denied
```

### What WikiContext carries at evaluation time

By the time `checkPagePermissionWithContext` is called the WikiContext already holds:

| Field | Source | Used by |
|---|---|---|
| `userContext.roles` | `req.userContext` (set at login) | All tiers |
| `userContext.username` | `req.userContext` | Tier 0, Tier 1 |
| `pageMetadata.audience` | loaded from page frontmatter | Tier 1 |
| `pageMetadata.user-keywords` | loaded from page frontmatter | Tier 0 |
| `content` | loaded from page file | Tier 3 (legacy) |

### Tier 1 — frontmatter `audience` (page-level override)

If the page frontmatter contains an `audience` array, only users whose role appears
in that list (or whose username matches) can view the page — **regardless of what
global policies say**.

```yaml
---
audience:
  - admin
  - reader
  - occupant
---
```

A page with no `audience` field skips Tier 1 entirely and falls through to the
global policies in Tier 2.

> **Key rule:** page-level `audience` always wins over site-wide policies.
> This is why restricted pages (Members Only, admin pages) use `audience`
> rather than relying solely on global policies.

### Tier 2 — global policies (`ngdpbase.access.policies`)

Policies are defined in `config/app-default-config.json` and can be overridden or
extended (by `id`) in `data/config/app-custom-config.json`. The merge is by `id` —
a custom entry with the same `id` replaces the default; a new `id` is appended.

Default policy evaluation order (by priority, highest first):

| id | priority | role | effect | actions |
|---|---|---|---|---|
| `admin-full-access` | 100 | admin | allow | all |
| `editor-permissions` | 80 | editor | allow | read/write/create/delete |
| `contributor-permissions` | 70 | contributor | allow | read/create/edit |
| `reader-permissions` | 60 | reader | allow | `page:read`, `attachment:read`, `search:all`, `export:pages` |
| `anonymous-read-only` | 50 | anonymous | allow | `page:read` |
| `default-view-for-all` | 1 | All | allow | `page:read` |

> **Removed 2026-07-25:** `deny-anonymous-system-pages` (priority 90, deny, `*` on `system`/`admin`
> categories). It had never functioned — `PolicyEvaluator.matchesResource` matches only
> `type: 'page'` resources, and anonymous users carry the role `Anonymous` while the policy named
> `anonymous` (subject matching is case-sensitive). Rather than make it work, it was deleted: the
> `system` category marks platform-owned content (site chrome, user documentation, privacy notice,
> request-access), not restricted content, so enforcing the rule would have blanked the sidebar and
> footer for every anonymous visitor. See #945 (closed as `wontfix`).
>
> Consequence: **there are no `deny` policies in the default catalog.** Access restriction is carried
> by page `private` (tier 0), author-lock (tier 0.5), and frontmatter `audience`/`access` (tier 1) —
> not by global policy.

`ngdpbase.access.policies.default-policy: "deny"` — if no policy matches, access is denied.

### Role hierarchy summary

| Role | Assigned to | Permissions |
|---|---|---|
| `admin` | Administrators | Full access |
| `editor` | Content editors | Read + write + create + delete |
| `contributor` | Content contributors | Read + create + edit |
| `reader` | Residents (also assigned to `unit-N` users) | Read pages/attachments, search, export |
| `occupant` | Google OIDC auto-provisioned users (default role) | Identity label; also gets `reader` via `default-roles` config |
| `anonymous` | Unauthenticated visitors | Read public pages only |

---

## Architecture

```text
┌─────────────────────────────────────────────────────────┐
│                    ACLManager                            │
│  - parsePageACL(content)                                │
│  - checkPagePermissionWithContext(wikiContext, action)  │
│  - checkContextRestrictions(user, context)              │
└────────────────┬────────────────────────────────────────┘
                 │
         ┌───────┼───────┬───────────────┐
         ▼       ▼       ▼               ▼
┌─────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ PolicyEval  │ │ UserManager  │ │ ConfigMgr   │ │ NotifyMgr    │
│ (policies)  │ │ (roles)      │ │ (settings)  │ │ (audit)      │
└─────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

### Properties

| Property | Type | Description |
| ---------- | ------ | ------------- |
| `accessPolicies` | `Map<string, Object>` | Global access policies loaded from config |
| `policyEvaluator` | `PolicyEvaluator\|null` | Reference to PolicyEvaluator manager |

---

## Initialization

```javascript
async initialize() {
  const configManager = this.engine.getManager('ConfigurationManager');
  const policies = configManager.getProperty('ngdpbase.access.policies', []);
  this.accessPolicies = new Map(policies.map(p => [p.id, p]));

  this.policyEvaluator = this.engine.getManager('PolicyEvaluator');
}
```

ACLManager requires:

- **ConfigurationManager** - For loading policies and settings
- **PolicyEvaluator** - For global policy evaluation (optional but recommended)

---

## Configuration

All settings come from ConfigurationManager:

```json
{
  "ngdpbase.access.policies": [
    {
      "id": "admin-full-access",
      "roles": ["admin"],
      "actions": ["*"],
      "effect": "allow"
    }
  ],
  "ngdpbase.access-control.context-aware.enabled": true,
  "ngdpbase.access-control.context-aware.time-zone": "UTC",
  "ngdpbase.features.maintenance.enabled": false,
  "ngdpbase.features.maintenance.allow-admins": true,
  "ngdpbase.schedules.enabled": true,
  "ngdpbase.schedules.businessHours": {
    "enabled": false,
    "days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
    "start": "09:00",
    "end": "17:00"
  },
  "ngdpbase.holidays.enabled": false,
  "ngdpbase.holidays.dates": {},
  "ngdpbase.holidays.recurring": {}
}
```

---

## ACL Markup Syntax

### Format

```
[{ALLOW action1, action2 principal1, principal2}]
```

### Examples

```wiki
[{ALLOW view All}]
[{ALLOW edit Admin, Editor}]
[{ALLOW delete Admin}]
[{ALLOW view, edit Authenticated}]
```

### Parsing Method

```javascript
parsePageACL(content) {
  const acl = new Map();
  // Regex: /\[\{\s*ALLOW\s+([a-z, ]+)\s+([^}]+)\s*\}\]/gi
  // Returns Map<action, Set<principals>>
}
```

**Returns:** `Map<string, Set<string>>` where:

- Key = action (lowercase)
- Value = Set of allowed principals

---

## Permission Checking Methods

### checkPagePermissionWithContext (Recommended)

```javascript
async checkPagePermissionWithContext(wikiContext, action)
```

Uses WikiContext as the single source of truth:

```javascript
const canEdit = await aclManager.checkPagePermissionWithContext(wikiContext, 'edit');
```

**Parameters:**

- `wikiContext` - WikiContext with pageName, userContext, content
- `action` - Action to check: view, edit, delete, create, rename, upload

**Returns:** `Promise<boolean>`

**Evaluation Flow:**

1. Map action to policy action (e.g., `view` → `page:read`)
2. Call PolicyEvaluator.evaluateAccess() if available
3. If policy decides, log and return
4. Parse page content for ACL markup
5. Check if user/roles match ACL principals
6. Default deny if no match

### checkPagePermission (Deprecated)

```javascript
async checkPagePermission(pageName, action, userContext, pageContent)
```

Legacy method - use `checkPagePermissionWithContext` instead.

### performStandardACLCheck

```javascript
async performStandardACLCheck(pageName, action, user, pageContent)
```

Standard ACL check without policy evaluation:

- Checks admin:system permission first
- Parses ACL from content
- Falls back to role-based defaults

---

## Context-Aware Restrictions

### checkContextRestrictions

```javascript
async checkContextRestrictions(user, context)
// Returns: { allowed: boolean, reason: string }
```

Checks all context restrictions:

1. Maintenance mode
2. Business hours
3. Holiday restrictions

### checkMaintenanceMode

```javascript
checkMaintenanceMode(user, maintenanceConfig)
```

```javascript
const result = aclManager.checkMaintenanceMode(user, {
  enabled: true,
  allowedRoles: ['admin']
});
// { allowed: false, reason: 'maintenance_mode', message: '...' }
```

### checkBusinessHours

```javascript
checkBusinessHours(businessHoursConfig, timeZone)
```

Checks if current time is within configured business hours.

### checkEnhancedTimeRestrictions

```javascript
async checkEnhancedTimeRestrictions(user, context)
```

Comprehensive time-based checking:

1. Check holidays first (they override all)
2. Check custom schedules
3. Fall back to business hours

### checkHolidayRestrictions

```javascript
async checkHolidayRestrictions(currentDate, holidaysConfig)
```

Checks both exact dates and recurring holidays:

- Exact: `"2025-12-25": { "name": "Christmas" }`
- Recurring: `"*-12-25": { "name": "Christmas" }`

---

## Audit Logging

### logAccessDecision

```javascript
logAccessDecision(userOrObj, pageName, action, allowed, reason, context)
// Or single object form:
logAccessDecision({
  user: userContext,
  pageName: 'Main',
  action: 'edit',
  allowed: true,
  reason: 'page_acl_role_Admin',
  context: {}
})
```

Logs to:

- Engine logger (info for allowed, warn for denied)
- NotificationManager for UI surfacing

---

## API Reference

### Core Methods

| Method | Parameters | Returns |
| -------- | ------------ | --------- |
| `initialize()` | - | `Promise<void>` |
| `parsePageACL(content)` | string | `Map<string, Set<string>>` |
| `checkPagePermissionWithContext(wikiContext, action)` | WikiContext, string | `Promise<boolean>` |
| `checkPagePermission(pageName, action, userContext, pageContent)` | string, string, Object, string | `Promise<boolean>` |
| `performStandardACLCheck(pageName, action, user, pageContent)` | string, string, Object, string | `Promise<boolean>` |
| `checkDefaultPermission(action, user)` | string, Object | `Promise<boolean>` |

### Context Methods

| Method | Parameters | Returns |
| -------- | ------------ | --------- |
| `checkContextRestrictions(user, context)` | Object, Object | `Promise<Object>` |
| `checkMaintenanceMode(user, config)` | Object, Object | Object |
| `checkBusinessHours(config, timeZone)` | Object, string | Object |
| `checkEnhancedTimeRestrictions(user, context)` | Object, Object | `Promise<Object>` |
| `checkHolidayRestrictions(date, config)` | string, Object | `Promise<Object>` |

### Utility Methods

| Method | Parameters | Returns |
| -------- | ------------ | --------- |
| `removeACLMarkup(content)` | string | string |
| `stripACLMarkup(content)` | string | string |
| `logAccessDecision(...)` | various | void |

---

## Integration Examples

### Route Protection

```javascript
app.get('/wiki/:pageName/edit', async (req, res) => {
  const aclManager = engine.getManager('ACLManager');
  const wikiContext = await engine.createWikiContext(req.params.pageName, req.user);

  const canEdit = await aclManager.checkPagePermissionWithContext(wikiContext, 'edit');
  if (!canEdit) {
    return res.status(403).render('error', { message: 'Access denied' });
  }
  // ... render edit page
});
```

### Stripping ACL from Display

```javascript
const aclManager = engine.getManager('ACLManager');
const cleanContent = aclManager.removeACLMarkup(page.content);
// Renders without [{ALLOW ...}] markers
```

### Checking Admin Access

```javascript
async isAdmin(user) {
  const userManager = this.engine.getManager('UserManager');
  return await userManager.hasPermission(user.username, 'admin:system');
}
```

---

## Notes

- **No backup/restore needed**: Policies come from ConfigurationManager, page ACLs from page content
- **Private method**: `#notify()` sends alerts to NotificationManager
- **Action mapping**: Legacy actions (view, edit) map to policy actions (page:read, page:edit)

---

## Related Documentation

- [ACLManager.md](ACLManager.md) - Quick reference
- [PolicyEvaluator.md](PolicyEvaluator.md) - Global policy evaluation
- [PolicyManager.md](PolicyManager.md) - Policy management
- [UserManager.md](UserManager.md) - User and role management
