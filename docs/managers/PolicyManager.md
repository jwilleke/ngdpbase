---
name: PolicyManager
description: Policy CRUD and lookup — manages the role/permission ruleset that PolicyEvaluator applies
dateModified: '2026-05-14'
category: managers
code: src/managers/PolicyManager.ts
---

# PolicyManager Documentation

__Version:__ 1.3.2
__Last Updated:__ 2025-10-11
__Manager Path:__ [src/managers/PolicyManager.ts](../../src/managers/PolicyManager.ts)

---

## Overview

The __PolicyManager__ manages the lifecycle of access control policies in ngdpbase. It loads policies from ConfigurationManager, stores them in memory, and provides access to all defined policies for evaluation by PolicyEvaluator.

### Key Features

- ✅ __Config-Driven:__ Loads policies from `ngdpbase.access.policies` in configuration
- ✅ __Priority Sorting:__ Automatically sorts policies by priority (descending)
- ✅ __Centralized Storage:__ Single source of truth for all access policies
- ✅ __Fast Retrieval:__ In-memory Map storage for O(1) policy lookup
- ✅ __Dynamic Loading:__ Policies can be updated via config file changes

---

## Purpose

PolicyManager serves as the __policy repository__ in ngdpbase's access control system. It doesn't make access decisions itself—that's the job of PolicyEvaluator. Instead, it:

1. __Loads__ policies from configuration
2. __Stores__ policies in memory for fast access
3. __Provides__ policies to PolicyEvaluator for decision-making
4. __Sorts__ policies by priority for correct evaluation order

---

## Architecture

### Initialization Flow

``` text
┌─────────────────────────────────────────────────────┐
│ PolicyManager.initialize()                          │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ Get ConfigurationManager                            │
│ - Check if policies enabled                         │
│ - Get ngdpbase.access.policies.enabled               │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ Load Policies from Config                           │
│ - Get ngdpbase.access.policies array                 │
│ - Store each policy by ID in Map                    │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ Log Result                                          │
│ - "Loaded N policies from ConfigurationManager"    │
└─────────────────────────────────────────────────────┘
```

### Integration with Other Managers

```text
┌───────────────────────┐
│ ConfigurationManager  │
│ - ngdpbase.access.     │
│   policies            │
└──────────┬────────────┘
           │
           │ loads
           ▼
┌───────────────────────┐
│ PolicyManager         │
│ - Stores policies     │
│ - Provides access     │
└──────────┬────────────┘
           │
           │ provides policies
           ▼
┌───────────────────────┐       ┌─────────────────┐
│ PolicyEvaluator       │◄──────┤ UserManager     │
│ - Evaluates access    │       │ - Checks perms  │
└───────────────────────┘       └─────────────────┘
```

---

## Configuration

### Policy Configuration Location

__File:__ `config/app-default-config.json`

```json
{
  "_comment_access_policies": "Access control policies - Role-based with specific action permissions",
  "ngdpbase.access.policies.default-policy": "deny",
  "ngdpbase.access.policies.enabled": true,
  "ngdpbase.access.policies": [
    {
      "id": "admin-full-access",
      "name": "Administrator Full Access",
      "description": "Full system access for administrators",
      "priority": 100,
      "effect": "allow",
      "subjects": [
        {
          "type": "role",
          "value": "admin"
        }
      ],
      "resources": [
        {
          "type": "page",
          "pattern": "*"
        }
      ],
      "actions": [
        "page:read",
        "page:edit",
        "page:create",
        "page:delete",
        "page:rename",
        "attachment:upload",
        "attachment:delete",
        "export:pages",
        "search:all",
        "search:restricted",
        "admin:users",
        "admin:roles",
        "admin:config",
        "admin:system"
      ]
    }
  ]
}
```

### Custom Policies

Add custom policies in `data/config/app-custom-config.json`:

```json
{
  "ngdpbase.access.policies": [
    {
      "id": "moderator-permissions",
      "name": "Moderator Permissions",
      "priority": 75,
      "effect": "allow",
      "subjects": [
        {
          "type": "role",
          "value": "moderator"
        }
      ],
      "resources": [
        {
          "type": "page",
          "pattern": "*"
        }
      ],
      "actions": [
        "page:read",
        "page:edit",
        "page:delete"
      ]
    }
  ]
}
```

__Note:__ Custom policies are automatically merged with default policies by ConfigurationManager.

---

## Key Methods

### `initialize()`

Initializes PolicyManager by loading policies from ConfigurationManager.

__Returns:__ `Promise<void>`

__Process:__

1. Gets ConfigurationManager instance
2. Checks if policies are enabled via `ngdpbase.access.policies.enabled`
3. Loads policies array from `ngdpbase.access.policies`
4. Validates each policy has an `id` field
5. Stores policies in Map by ID
6. Logs number of policies loaded

__Example Output:__

```text
📋 Loaded 7 policies from ConfigurationManager.
```

__Error Handling:__

- Throws error if ConfigurationManager not available
- Logs warning if policies array is invalid
- Skips policies without `id` field

---

### `getPolicy(id)`

Retrieves a single policy by its unique ID.

__Parameters:__

- `id` (string) - The unique policy ID

__Returns:__ Policy object or `undefined` if not found

__Example:__

```javascript
const policyManager = engine.getManager('PolicyManager');
const policy = policyManager.getPolicy('admin-full-access');

if (policy) {
  console.log(policy.name); // "Administrator Full Access"
  console.log(policy.priority); // 100
  console.log(policy.effect); // "allow"
}
```

__Use Case:__

- Debugging specific policy
- Checking if policy exists
- Retrieving policy details for UI display

---

### `getAllPolicies()`

Returns all loaded policies, __sorted by priority (descending)__.

__Returns:__ `Array<object>` - Array of policy objects sorted by priority

__Example:__

```javascript
const policyManager = engine.getManager('PolicyManager');
const policies = policyManager.getAllPolicies();

console.log(`Total policies: ${policies.length}`);

policies.forEach(policy => {
  console.log(`${policy.id} (priority: ${policy.priority})`);
});

// Output (sorted by priority):
// admin-full-access (priority: 100)
// editor-permissions (priority: 80)
// contributor-permissions (priority: 60)
// reader-permissions (priority: 40)
// anonymous-read-only (priority: 20)
```

__Sorting:__

- Policies with __higher priority__ are evaluated __first__
- Priority range: 0-1000
- Default priority: 50 (if not specified)
- Sorting formula: `(b.priority || 0) - (a.priority || 0)`

__Use Case:__

- __PolicyEvaluator:__ Gets all policies for evaluation
- __UserManager:__ Collects permissions from policies
- __Admin UI:__ Displays all policies to administrators
- __PolicyValidator:__ Validates policy conflicts

---

## Policy Structure

### Policy Object

```javascript
{
  id: "admin-full-access",           // Unique identifier (required)
  name: "Administrator Full Access",  // Human-readable name (required)
  description: "Full system access",  // Description (optional)
  priority: 100,                      // Evaluation priority (0-1000, default: 50)
  effect: "allow",                    // "allow" or "deny" (required)

  subjects: [                         // Who does this apply to? (required)
    {
      type: "role",                   // "role", "user", "group"
      value: "admin"                  // Role name, username, etc.
    }
  ],

  resources: [                        // What does this apply to? (required)
    {
      type: "page",                   // "page", "attachment", "category"
      pattern: "*"                    // Glob pattern or specific resource
    }
  ],

  actions: [                          // What actions are allowed/denied? (required)
    "page:read",
    "page:edit",
    "admin:users"
  ],

  conditions: [                       // Additional conditions (optional)
    {
      type: "time-range",
      startTime: "09:00",
      endTime: "17:00"
    }
  ],

  metadata: {                         // Metadata (optional)
    created: "2025-10-11T12:00:00Z",
    author: "admin",
    version: "1.0"
  }
}
```

---

## Policy Priority System

### How Priority Works

1. __Higher priority = evaluated first__
2. __First matching policy wins__
3. __No fallthrough__ - evaluation stops at first match

### Priority Ranges

| Priority | Use Case | Example |
| ---------- | ---------- | --------- |
| __90-100__ | Critical system policies | Admin full access |
| __70-89__ | High-level role permissions | Editor permissions |
| __50-69__ | Standard role permissions | Contributor permissions |
| __30-49__ | Basic role permissions | Reader permissions |
| __10-29__ | Public access | Anonymous read-only |
| __0-9__ | Catch-all/fallback | Default deny |

### Example Priority Ordering

```javascript
const policies = [
  { id: 'admin', priority: 100 },     // Evaluated 1st
  { id: 'editor', priority: 80 },     // Evaluated 2nd
  { id: 'contributor', priority: 60 }, // Evaluated 3rd
  { id: 'reader', priority: 40 },     // Evaluated 4th
  { id: 'anonymous', priority: 20 }   // Evaluated 5th
];
```

__Scenario:__ User with roles `['editor', 'reader']` tries to edit a page.

1. Check `admin` policy (priority 100) → No match (user not admin)
2. Check `editor` policy (priority 80) → __MATCH!__ → Allow
3. Stop evaluation (first match wins)

---

## Usage Patterns

### Pattern 1: Get All Policies for Evaluation

```javascript
// In PolicyEvaluator
async evaluateAccess(context) {
  const policies = this.policyManager.getAllPolicies();

  for (const policy of policies) {
    if (this.matches(policy, context)) {
      return {
        allowed: policy.effect === 'allow',
        policyName: policy.id
      };
    }
  }

  return { allowed: false, reason: 'No matching policy' };
}
```

### Pattern 2: Get User Permissions

```javascript
// In UserManager
getUserPermissions(username) {
  const policyManager = this.engine.getManager('PolicyManager');
  const policies = policyManager.getAllPolicies();
  const permissions = new Set();

  const userRoles = this.getUserRoles(username);

  for (const policy of policies) {
    if (policy.effect === 'allow') {
      const hasMatchingRole = policy.subjects.some(subject =>
        subject.type === 'role' && userRoles.includes(subject.value)
      );

      if (hasMatchingRole) {
        policy.actions.forEach(action => permissions.add(action));
      }
    }
  }

  return Array.from(permissions);
}
```

### Pattern 3: Check Specific Policy

```javascript
// In Admin UI
function displayPolicyDetails(policyId) {
  const policyManager = engine.getManager('PolicyManager');
  const policy = policyManager.getPolicy(policyId);

  if (!policy) {
    console.error(`Policy ${policyId} not found`);
    return;
  }

  console.log(`Policy: ${policy.name}`);
  console.log(`Effect: ${policy.effect}`);
  console.log(`Priority: ${policy.priority}`);
  console.log(`Actions: ${policy.actions.join(', ')}`);
}
```

---

## Built-in Policies

### Default Policies in ngdpbase

| Policy ID | Priority | Roles | Description |
| ----------- | ---------- | ------- | ------------- |
| `admin-full-access` | 100 | admin | Full system access |
| `editor-permissions` | 80 | editor | Create, edit, delete, rename pages |
| `contributor-permissions` | 60 | contributor | Create and edit pages |
| `reader-permissions` | 40 | reader | Read pages and search |
| `anonymous-read-only` | 20 | anonymous | Read public pages |
| `authenticated-basic` | 30 | Authenticated | Basic access for all logged-in users |
| `all-users-view` | 10 | All | Fallback view access |

---

## Error Handling

### Missing ConfigurationManager

```javascript
const configManager = this.engine.getManager('ConfigurationManager');
if (!configManager) {
  throw new Error('PolicyManager requires ConfigurationManager to be initialized.');
}
```

__Solution:__ Ensure ConfigurationManager is registered before PolicyManager in WikiEngine.

---

### Policies Disabled

```javascript
const policiesEnabled = configManager.getProperty('ngdpbase.access.policies.enabled', false);
if (!policiesEnabled) {
  logger.info('PolicyManager is disabled via configuration.');
  return;
}
```

__Solution:__ Set `ngdpbase.access.policies.enabled: true` in config.

---

### Invalid Policies Array

```javascript
const policies = configManager.getProperty('ngdpbase.access.policies', []);
if (!Array.isArray(policies)) {
  logger.error('Policies configuration (ngdpbase.access.policies) is invalid or not an array.');
  return;
}
```

__Solution:__ Ensure `ngdpbase.access.policies` is an array in config.

---

### Missing Policy ID

```javascript
for (const policy of policies) {
  if (policy && policy.id) {
    this.policies.set(policy.id, policy);
  }
}
```

__Behavior:__ Policies without `id` are silently skipped.

__Solution:__ Ensure all policies have unique `id` fields.

---

## Performance Characteristics

### Storage: Map<string, object>

- __Lookup by ID:__ O(1)
- __Get all policies:__ O(n)
- __Memory:__ O(n) where n = number of policies

### Sorting

- __Sort on retrieval:__ O(n log n)
- __Performed each time__ `getAllPolicies()` is called
- __Optimization:__ Consider caching sorted array if performance critical

---

## Best Practices

### 1. Use Descriptive Policy IDs

❌ __Don't:__

```json
{ "id": "p1", "name": "Policy 1" }
```

✅ __Do:__

```json
{ "id": "editor-page-permissions", "name": "Editor Page Permissions" }
```

### 2. Set Appropriate Priorities

❌ __Don't:__ Use same priority for different policies

```json
[
  { "id": "policy1", "priority": 50 },
  { "id": "policy2", "priority": 50 }
]
```

✅ __Do:__ Use distinct priorities

```json
[
  { "id": "editor-policy", "priority": 80 },
  { "id": "contributor-policy", "priority": 60 }
]
```

### 3. Keep Policies in Config

❌ __Don't:__ Try to programmatically add policies at runtime

✅ __Do:__ Add policies in config files (auto-loaded on restart)

### 4. Validate Policies

✅ __Use PolicyValidator to check policies before deployment:__

```javascript
const validator = engine.getManager('PolicyValidator');
const result = validator.validatePolicy(newPolicy);

if (!result.isValid) {
  console.error('Invalid policy:', result.errors);
}
```

---

## Integration Examples

### With PolicyEvaluator

```javascript
// PolicyEvaluator gets policies from PolicyManager
async evaluateAccess(context) {
  const policies = this.policyManager.getAllPolicies(); // ← Uses PolicyManager

  for (const policy of policies) {
    if (this.matches(policy, context)) {
      return {
        hasDecision: true,
        allowed: policy.effect === 'allow',
        policyName: policy.id
      };
    }
  }

  return { hasDecision: false, allowed: false };
}
```

### With UserManager

```javascript
// UserManager gets permissions via PolicyManager
getUserPermissions(username) {
  const policyManager = this.engine.getManager('PolicyManager');
  const policies = policyManager.getAllPolicies(); // ← Uses PolicyManager

  // Collect permissions from matching policies
  const permissions = new Set();

  for (const policy of policies) {
    if (policy.effect === 'allow' && this.userHasRole(username, policy)) {
      policy.actions.forEach(action => permissions.add(action));
    }
  }

  return Array.from(permissions);
}
```

### With PolicyValidator

```javascript
// PolicyValidator validates policies from PolicyManager
validateAllPolicies() {
  const policies = this.policyManager.getAllPolicies(); // ← Uses PolicyManager
  const conflicts = this.detectPolicyConflicts(policies);

  return {
    isValid: conflicts.errors.length === 0,
    errors: conflicts.errors,
    warnings: conflicts.warnings
  };
}
```

---

## Troubleshooting

### Issue: "PolicyManager requires ConfigurationManager"

__Cause:__ ConfigurationManager not initialized

__Solution:__ Check WikiEngine initialization order

---

### Issue: "Loaded 0 policies from ConfigurationManager"

__Cause:__ No policies in config or policies disabled

__Solution:__

1. Check `ngdpbase.access.policies.enabled: true`
2. Verify `ngdpbase.access.policies` array exists
3. Ensure policies have `id` fields

---

### Issue: Policies not being evaluated in expected order

__Cause:__ Incorrect priority values

__Solution:__ Check policy priorities - higher priority = evaluated first

---

## Related Documentation

- [PolicyEvaluator Documentation](./PolicyEvaluator-Documentation.md)
- [PolicyValidator Documentation](./PolicyValidator-Documentation.md)
- [UserManager Documentation](./UserManager-Documentation.md)
- [ConfigurationManager Documentation](./ConfigurationManager-Documentation.md)
- [Policies, Roles & Permissions](../architecture/Policies-Roles-Permissions.md)

---

## Changelog

### v1.3.2 (2025-10-11)

- ✅ Initial documentation
- ✅ Config-driven policy loading
- ✅ Priority-based sorting
- ✅ Integration with PolicyEvaluator and UserManager

---

__Maintained By:__ Development Team
__Status:__ Active Development
