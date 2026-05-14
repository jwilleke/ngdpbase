---
name: PolicyEvaluator
description: Tier-2 of ACLManager — evaluates role/permission policies against principals and resources
dateModified: '2026-05-14'
category: managers
code: src/managers/PolicyEvaluator.ts
---

# PolicyEvaluator Documentation

**Version:** 1.3.2
**Last Updated:** 2025-10-11
**Manager Path:** [src/managers/PolicyEvaluator.ts](../../src/managers/PolicyEvaluator.ts)

---

## Overview

The **PolicyEvaluator** evaluates access control policies against a given context to make access decisions. It mimics how JSPWiki uses Java's built-in security framework (`java.security`) to load and evaluate security policies.

### Key Features

- ✅ **Context-Based Evaluation:** Makes decisions based on user, resource, and action
- ✅ **Priority-Ordered:** Evaluates policies in priority order (first match wins)
- ✅ **Role Matching:** Supports role-based access control with built-in roles
- ✅ **Pattern Matching:** Uses glob patterns for resource matching (micromatch)
- ✅ **Detailed Logging:** Logs every evaluation for debugging
- ✅ **Fast Performance:** Stops at first matching policy

---

## Purpose

PolicyEvaluator is the **decision engine** in ngdpbase's access control system. It:

1. **Receives** access requests (who wants to do what to which resource)
2. **Retrieves** all policies from PolicyManager
3. **Evaluates** each policy in priority order
4. **Returns** the first matching policy's decision (allow/deny)

---

## Architecture

### Evaluation Flow

```
┌─────────────────────────────────────────────────────────┐
│ 1. Access Request                                       │
│    - User: "john"                                       │
│    - Roles: ["editor", "Authenticated", "All"]          │
│    - Page: "ProjectDocs"                                │
│    - Action: "page:edit"                                │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 2. PolicyEvaluator.evaluateAccess(context)              │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Get Policies from PolicyManager                      │
│    - Returns policies sorted by priority (descending)   │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Evaluate Each Policy (in order)                      │
│                                                          │
│    Policy 1 (priority: 100):                            │
│    ├─ Subject Match? NO (requires "admin")              │
│    └─ Skip                                              │
│                                                          │
│    Policy 2 (priority: 80):                             │
│    ├─ Subject Match? YES ("editor" in user roles)       │
│    ├─ Resource Match? YES ("*" matches "ProjectDocs")   │
│    ├─ Action Match? YES ("page:edit" in actions)        │
│    └─ ✓ MATCH FOUND → Effect: "allow"                   │
│                                                          │
│    (Stop evaluation - first match wins)                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 5. Return Decision                                      │
│    {                                                    │
│      hasDecision: true,                                 │
│      allowed: true,                                     │
│      reason: "Policy match: editor-permissions",        │
│      policyName: "editor-permissions"                   │
│    }                                                    │
└─────────────────────────────────────────────────────────┘
```

### Integration Diagram

```
┌─────────────┐
│ UserManager │
│ - hasPermission()
└──────┬──────┘
       │
       │ Calls with userContext
       ▼
┌──────────────────┐      ┌────────────────┐
│ PolicyEvaluator  │◄─────┤ PolicyManager  │
│ - evaluateAccess()│      │ - getAllPolicies()
└──────┬───────────┘      └────────────────┘
       │
       │ Returns allow/deny
       ▼
┌─────────────┐
│ UserManager │
│ - Returns true/false
└─────────────┘
```

---

## Key Methods

### `evaluateAccess(context)`

Evaluates all relevant policies to make an access decision.

**Parameters:**

- `context` (object):
  - `pageName` (string) - Name of the page/resource being accessed
  - `action` (string) - Action being performed (e.g., 'page:edit', 'admin:users')
  - `userContext` (object) - User context including roles
    - `username` (string) - Username
    - `roles` (Array<string>) - User's roles (including built-in roles)
    - `isAuthenticated` (boolean) - Authentication status

**Returns:** `Promise<object>`

```javascript
{
  hasDecision: boolean,    // true if a policy matched
  allowed: boolean,        // true if access is allowed
  reason: string,          // Reason for the decision
  policyName: string|null  // ID of the matching policy (or null)
}
```

**Example:**

```javascript
const policyEvaluator = engine.getManager('PolicyEvaluator');

const result = await policyEvaluator.evaluateAccess({
  pageName: 'ProjectDocs',
  action: 'page:edit',
  userContext: {
    username: 'john',
    roles: ['editor', 'Authenticated', 'All'],
    isAuthenticated: true
  }
});

if (result.allowed) {
  console.log(`Access granted via ${result.policyName}`);
} else {
  console.log(`Access denied: ${result.reason}`);
}
```

**Evaluation Process:**

1. Gets all policies from PolicyManager (sorted by priority)
2. For each policy (in order):
   - Check if policy matches context using `matches()`
   - If match found:
     - Return `{ hasDecision: true, allowed: policy.effect === 'allow' }`
     - Stop evaluation (first match wins)
3. If no match found:
   - Return `{ hasDecision: false, allowed: false }`

**Logging:**

```
[POLICY] Evaluate page=ProjectDocs action=page:edit user=john roles=editor|Authenticated|All
[POLICY] Check policy=admin-full-access effect=allow match=false
[POLICY] Check policy=editor-permissions effect=allow match=true
```

---

### `matches(policy, context)`

Checks if a single policy matches the given context.

**Parameters:**

- `policy` (object) - Policy to check
- `context` (object) - Access request context

**Returns:** `boolean` - True if policy matches, false otherwise

**Matching Logic:**

```javascript
return subjectMatch && resourceMatch && actionMatch;
```

All three conditions must be true for a policy to match.

**Example:**

```javascript
const policy = {
  id: 'editor-permissions',
  subjects: [{ type: 'role', value: 'editor' }],
  resources: [{ type: 'page', pattern: '*' }],
  actions: ['page:read', 'page:edit', 'page:create']
};

const context = {
  pageName: 'ProjectDocs',
  action: 'page:edit',
  userContext: {
    username: 'john',
    roles: ['editor', 'Authenticated', 'All']
  }
};

const isMatch = policyEvaluator.matches(policy, context);
console.log(isMatch); // true
```

---

### `matchesSubject(policySubjects, userContext)`

Checks if the user's roles match the policy's subject requirements.

**Parameters:**

- `policySubjects` (Array<object>) - Policy subjects
- `userContext` (object) - User context with roles

**Returns:** `boolean` - True if user matches

**Matching Rules:**

1. **No subjects specified** → Matches everyone

   ```javascript
   policySubjects = []
   return true; // Applies to all users
   ```

2. **"All" role** → Matches everyone (including anonymous)

   ```javascript
   policySubjects = [{ type: 'role', value: 'All' }]
   return true; // Universal match
   ```

3. **Specific roles** → User must have at least one matching role

   ```javascript
   policySubjects = [
     { type: 'role', value: 'editor' },
     { type: 'role', value: 'admin' }
   ]
   userContext.roles = ['editor', 'Authenticated', 'All']
   return true; // User has 'editor' role
   ```

4. **No roles** → No match for role-based policies

   ```javascript
   userContext.roles = []
   return false; // Cannot match role-based policies
   ```

**Example:**

```javascript
const policySubjects = [
  { type: 'role', value: 'editor' },
  { type: 'role', value: 'admin' }
];

const userContext = {
  username: 'john',
  roles: ['editor', 'Authenticated', 'All']
};

const matches = policyEvaluator.matchesSubject(policySubjects, userContext);
console.log(matches); // true (user has 'editor' role)
```

---

### `matchesResource(resources, pageName)`

Checks if the resource matches the policy's resource patterns.

**Parameters:**

- `resources` (Array<object>) - Policy resources
- `pageName` (string) - Page name to check

**Returns:** `boolean` - True if resource matches

**Matching Rules:**

1. **No resources specified** → Matches all resources

   ```javascript
   resources = []
   return true; // Applies to all resources
   ```

2. **Glob pattern matching** → Uses micromatch

   ```javascript
   resources = [{ type: 'page', pattern: 'Project*' }]
   pageName = 'ProjectDocs'
   return true; // Matches pattern
   ```

3. **Wildcard pattern** → Matches everything

   ```javascript
   resources = [{ type: 'page', pattern: '*' }]
   return true; // Universal resource match
   ```

**Pattern Examples:**

| Pattern | Matches | Doesn't Match |
| --------- | --------- | --------------- |
| `*` | Everything | - |
| `Project*` | `ProjectDocs`, `ProjectPlan` | `UserGuide` |
| `Admin/*` | `Admin/Users`, `Admin/Config` | `Users` |
| `*Docs` | `ProjectDocs`, `UserDocs` | `Project` |

**Example:**

```javascript
const resources = [
  { type: 'page', pattern: 'Project*' }
];

console.log(policyEvaluator.matchesResource(resources, 'ProjectDocs')); // true
console.log(policyEvaluator.matchesResource(resources, 'UserGuide'));   // false
```

---

### `matchesAction(actions, action)`

Checks if the action matches the policy's action list.

**Parameters:**

- `actions` (Array<string>) - Policy actions
- `action` (string) - Action to check

**Returns:** `boolean` - True if action matches

**Matching Rules:**

1. **No actions specified** → Matches all actions

   ```javascript
   actions = []
   return true; // Applies to all actions
   ```

2. **Exact match** → Action is in the list

   ```javascript
   actions = ['page:read', 'page:edit', 'page:create']
   action = 'page:edit'
   return true; // Exact match
   ```

3. **Wildcard action** → Matches everything

   ```javascript
   actions = ['*']
   return true; // Universal action match
   ```

**Example:**

```javascript
const actions = ['page:read', 'page:edit', 'page:create'];

console.log(policyEvaluator.matchesAction(actions, 'page:edit'));   // true
console.log(policyEvaluator.matchesAction(actions, 'page:delete')); // false
console.log(policyEvaluator.matchesAction(['*'], 'anything'));      // true
```

---

## Built-in Roles

PolicyEvaluator recognizes special built-in roles:

| Role | Added By | Purpose | Matching |
| ------ | ---------- | --------- | ---------- |
| `All` | UserManager | Universal role for everyone | Matches all users including anonymous |
| `Authenticated` | UserManager | Role for logged-in users | Matches all authenticated users |
| `Anonymous` | UserManager | Role for non-logged-in users | Matches unauthenticated users |

**Example Policy Using Built-in Roles:**

```json
{
  "id": "all-users-view",
  "subjects": [{ "type": "role", "value": "All" }],
  "resources": [{ "type": "page", "pattern": "*" }],
  "actions": ["page:read"]
}
```

This policy allows **everyone** (logged-in or not) to read all pages.

---

## Decision Logic

### First Match Wins

PolicyEvaluator uses **first match wins** logic:

1. Policies are evaluated in **priority order** (highest first)
2. **First policy that matches** determines the decision
3. Remaining policies are **not evaluated**

**Example:**

```javascript
// Policy 1 (priority: 100)
{
  "id": "admin-access",
  "priority": 100,
  "effect": "allow",
  "subjects": [{ "type": "role", "value": "admin" }],
  "resources": [{ "type": "page", "pattern": "*" }],
  "actions": ["*"]
}

// Policy 2 (priority: 50)
{
  "id": "deny-sensitive",
  "priority": 50,
  "effect": "deny",
  "subjects": [{ "type": "role", "value": "All" }],
  "resources": [{ "type": "page", "pattern": "SensitiveDocs" }],
  "actions": ["*"]
}
```

**Scenario:** Admin user tries to access "SensitiveDocs"

1. Check Policy 1 (priority 100):
   - Subject: ✓ (user is admin)
   - Resource: ✓ (matches `*`)
   - Action: ✓ (matches `*`)
   - **MATCH!** → Effect: "allow"
   - Stop evaluation

2. Policy 2 is **never checked** (admin already allowed by Policy 1)

**Result:** Admin can access "SensitiveDocs" (Policy 1 wins due to higher priority)

---

### No Match = Deny

If no policy matches, access is **denied by default**:

```javascript
return {
  hasDecision: false,
  allowed: false,
  reason: 'No matching policy',
  policyName: null
};
```

---

## Usage Patterns

### Pattern 1: Check User Permission

```javascript
// In UserManager.hasPermission()
async hasPermission(username, action) {
  const policyEvaluator = this.engine?.getManager('PolicyEvaluator');

  if (!policyEvaluator) {
    console.warn('[UserManager] PolicyEvaluator not available, denying permission');
    return false;
  }

  // Build user context
  const user = this.users.get(username);
  const userContext = {
    username: user.username,
    roles: [...(user.roles || []), 'Authenticated', 'All'],
    isAuthenticated: true
  };

  // Evaluate using policies
  const result = await policyEvaluator.evaluateAccess({
    pageName: '*',  // Generic permission check
    action: action,
    userContext: userContext
  });

  return result.allowed;
}
```

### Pattern 2: Check Page Access

```javascript
// In PageManager or Middleware
async function checkPageAccess(req, res, next) {
  const policyEvaluator = engine.getManager('PolicyEvaluator');
  const userManager = engine.getManager('UserManager');

  const user = await userManager.getCurrentUser(req);
  const pageName = req.params.page;
  const action = getActionFromRequest(req); // 'page:read', 'page:edit', etc.

  const result = await policyEvaluator.evaluateAccess({
    pageName: pageName,
    action: action,
    userContext: user
  });

  if (!result.allowed) {
    return res.status(403).json({
      error: 'Access denied',
      reason: result.reason
    });
  }

  next();
}
```

### Pattern 3: Debug Policy Evaluation

```javascript
// Debug helper
async function debugPolicyEvaluation(username, pageName, action) {
  const policyEvaluator = engine.getManager('PolicyEvaluator');
  const userManager = engine.getManager('UserManager');

  const user = userManager.getUser(username);
  const userContext = {
    username: user.username,
    roles: [...user.roles, 'Authenticated', 'All'],
    isAuthenticated: true
  };

  console.log('=== Policy Evaluation Debug ===');
  console.log('User:', username);
  console.log('Roles:', userContext.roles);
  console.log('Page:', pageName);
  console.log('Action:', action);

  const result = await policyEvaluator.evaluateAccess({
    pageName,
    action,
    userContext
  });

  console.log('Result:', result);
  console.log('===============================');

  return result;
}

// Usage
await debugPolicyEvaluation('john', 'ProjectDocs', 'page:edit');
```

---

## Logging

PolicyEvaluator provides detailed logging for debugging:

### Info Level Logs

```
[POLICY] Evaluate page=ProjectDocs action=page:edit user=john roles=editor|Authenticated|All
[POLICY] Check policy=admin-full-access effect=allow match=false
[POLICY] Check policy=editor-permissions effect=allow match=true
```

### No Match Logs

```
[POLICY] Evaluate page=SecretPage action=page:edit user=guest roles=reader|Authenticated|All
[POLICY] Check policy=admin-full-access effect=allow match=false
[POLICY] Check policy=editor-permissions effect=allow match=false
[POLICY] Check policy=contributor-permissions effect=allow match=false
[POLICY] Check policy=reader-permissions effect=allow match=false
[POLICY] No matching policy
```

---

## Performance Considerations

### Optimization Strategies

1. **First Match Wins** - Stops at first matching policy
2. **Priority Sorting** - Most specific policies evaluated first
3. **Early Exit** - Skips remaining policies after match
4. **In-Memory Storage** - Policies cached in PolicyManager

### Time Complexity

- **Best Case:** O(1) - First policy matches
- **Worst Case:** O(n) - No policy matches, check all n policies
- **Average Case:** O(log n) - Match found in middle of list

### Recommendations

1. **Put most common policies first** (higher priority)
2. **Use specific patterns** to reduce false matches
3. **Avoid wildcard-only policies** unless intentional
4. **Cache evaluation results** if same check repeated

---

## Error Handling

### Missing PolicyManager

```javascript
this.policyManager = this.engine.getManager('PolicyManager');
if (!this.policyManager) {
  throw new Error('PolicyEvaluator requires PolicyManager to be initialized.');
}
```

---

### Invalid Context

```javascript
const { pageName, action, userContext } = context || {};

// Handles undefined/null context gracefully
const roles = (userContext?.roles || []).join('|');
```

---

## Best Practices

### 1. Always Include Built-in Roles

✅ **Do:**

```javascript
const userContext = {
  username: user.username,
  roles: [...user.roles, 'Authenticated', 'All'], // Include built-in roles
  isAuthenticated: true
};
```

❌ **Don't:**

```javascript
const userContext = {
  username: user.username,
  roles: user.roles, // Missing built-in roles!
  isAuthenticated: true
};
```

### 2. Use Specific Actions

✅ **Do:**

```javascript
await policyEvaluator.evaluateAccess({
  pageName: 'ProjectDocs',
  action: 'page:edit', // Specific action
  userContext: user
});
```

❌ **Don't:**

```javascript
await policyEvaluator.evaluateAccess({
  pageName: 'ProjectDocs',
  action: '*', // Too broad
  userContext: user
});
```

### 3. Check hasDecision Flag

✅ **Do:**

```javascript
const result = await policyEvaluator.evaluateAccess(context);

if (!result.hasDecision) {
  console.log('No policy matched - denied by default');
}
```

---

## Related Documentation

- [PolicyManager Documentation](./PolicyManager-Documentation.md)
- [PolicyValidator Documentation](./PolicyValidator-Documentation.md)
- [UserManager Documentation](./UserManager-Documentation.md)
- [Policies, Roles & Permissions](../architecture/Policies-Roles-Permissions.md)

---

## Changelog

### v1.3.2 (2025-10-11)

- ✅ Initial documentation
- ✅ Context-based policy evaluation
- ✅ Role matching with built-in roles support
- ✅ Pattern matching using micromatch
- ✅ First-match-wins evaluation logic

---

**Maintained By:** Development Team
**Status:** Active Development
