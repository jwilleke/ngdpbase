---
name: ACLManager
description: "Per-page access control: private/author-lock/audience/role-policy evaluation via the canonical wikiContext.canAccess facade"
dateModified: '2026-05-14'
category: managers
code: src/managers/ACLManager.ts
---

# ACLManager

**Module:** `src/managers/ACLManager.ts`
**Extends:** [BaseManager](BaseManager.md)
**Complete Guide:** [ACLManager-Complete-Guide.md](ACLManager-Complete-Guide.md)

---

## Overview

ACLManager handles Access Control Lists and context-aware permissions. It implements JSPWiki-style ACL markup parsing with extensions for policy-based and context-aware access control.

## Key Features

- JSPWiki-style ACL markup: `[{ALLOW view Admin}]`
- Integration with [PolicyEvaluator](PolicyEvaluator.md) for global policies
- Context-aware restrictions (maintenance mode, business hours, holidays)
- Audit logging of access decisions via [NotificationManager](NotificationManager.md)

## Quick Example

```javascript
const aclManager = engine.getManager('ACLManager');

// Check permission using WikiContext (recommended)
const canEdit = await aclManager.checkPagePermissionWithContext(wikiContext, 'edit');

// Parse ACL from page content
const acl = aclManager.parsePageACL('[{ALLOW view All}] [{ALLOW edit Admin}]');
// acl.get('view') => Set(['All'])
// acl.get('edit') => Set(['Admin'])
```

## Supported Actions

| Action | Maps To | Description |
| -------- | --------- | ------------- |
| `view` | `page:read` | Read page content |
| `edit` | `page:edit` | Modify page content |
| `delete` | `page:delete` | Delete the page |
| `create` | `page:create` | Create new pages |
| `rename` | `page:rename` | Rename the page |
| `upload` | `attachment:upload` | Upload attachments |

## Permission Evaluation Order

1. **Global Policies** - PolicyEvaluator decides first
2. **Page-Level ACLs** - If no global policy matched
3. **Default Deny** - If nothing allows the action

## Related Managers

- [PolicyEvaluator](PolicyEvaluator.md) - Evaluates global access policies
- [PolicyManager](PolicyManager.md) - Manages policy definitions
- [UserManager](UserManager.md) - User role management
- [NotificationManager](NotificationManager.md) - Audit alerts

## Developer Documentation

For complete API reference, configuration options, and implementation details, see:

- [ACLManager-Complete-Guide.md](ACLManager-Complete-Guide.md)
- [Generated API Docs](../api/generated/src/managers/ACLManager/README.md)
