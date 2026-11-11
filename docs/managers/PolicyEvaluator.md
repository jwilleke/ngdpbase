---
name: PolicyEvaluator
description: Tier-2 of PolicyInformationPoint — evaluates role/permission policies against principals and resources
dateModified: '2026-05-14'
category: managers
code: src/managers/PolicyEvaluator.ts
---

# PolicyEvaluator Documentation

__Version:__ 1.3.2
__Last Updated:__ 2025-10-11
__Manager Path:__ [src/managers/PolicyEvaluator.ts](../../src/managers/PolicyEvaluator.ts)

---

## Overview

The __PolicyEvaluator__ evaluates access control policies against a given context to make access decisions. It mimics how JSPWiki uses Java's built-in security framework (`java.security`) to load and evaluate security policies.

### Key Features

- ✅ __Context-Based Evaluation:__ Makes decisions based on user, resource, and action
- ✅ __Deny-Overrides:__ Combines every matching policy: any matching deny wins, otherwise any matching allow permits
- ✅ __Role Matching:__ Supports role-based access control with built-in roles
- ✅ __Pattern Matching:__ Uses glob patterns for resource matching (micromatch)
- ✅ __Detailed Logging:__ Logs every evaluation for debugging
- ✅ __Order-Independent:__ The decision does not depend on the order of the policies

---

## Purpose

PolicyEvaluator is the __decision engine__ in ngdpbase's access control system. It:

1. __Receives__ access requests (who wants to do what to which resource)
2. __Retrieves__ all policies from PolicyManager
3. __Evaluates__ every policy against the request
4. __Returns__ the combined decision under `deny-overrides` (allow/deny)

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
│    - Returns policies in configuration order            │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Evaluate Every Policy                                │
│                                                          │
│    Policy 1 (admin-full-access):                        │
│    ├─ Subject Match? NO (requires "admin")              │
│    └─ Skip                                              │
│                                                          │
│    Policy 2 (editor-permissions):                       │
│    ├─ Subject Match? YES ("editor" in user roles)       │
│    ├─ Resource Match? YES ("*" matches "ProjectDocs")   │
│    ├─ Action Match? YES ("page:edit" in actions)        │
│    └─ ✓ MATCH FOUND → Effect: "allow"                   │
│                                                          │
│    (Keep checking: any matching deny would win)         │
│    No matching deny → matching allow permits            │
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

### `compile(userContext, action)`

`evaluateAccess` with the subject and action fixed ([#1219](https://github.com/jwilleke/ngdpbase/issues/1219)). Drops the policies that cannot match this subject or action once, and returns `(pageName) => EvaluationResult` that matches resources only, in the same first-match-wins order, with no log line per call. `PolicyInformationPoint.filterAccessiblePages` uses it to decide tier 2 for every page in a listing.

### `evaluateAccess(context)`

Evaluates all relevant policies to make an access decision.

__Parameters:__

- `context` (object):
  - `pageName` (string) - Name of the page/resource being accessed
  - `action` (string) - Action being performed (e.g., 'page:edit', 'admin:users')
  - `userContext` (object) - User context including roles
    - `username` (string) - Username
    - `roles` (`Array<string>`) - User's roles (including built-in roles)
    - `isAuthenticated` (boolean) - Authentication status

__Returns:__ `Promise<object>`

```javascript
{
  hasDecision: boolean,    // true if a policy matched
  allowed: boolean,        // true if access is allowed
  reason: string,          // Reason for the decision
  policyName: string|null  // ID of the matching policy (or null)
}
```

__Example:__

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

__Evaluation Process:__

1. Gets all policies from PolicyManager (in configuration order)
2. For each policy:
   - Check if policy matches context using `matches()`
   - Note whether a matching policy is a deny or an allow
3. If any matching policy is a deny:
   - Return `{ hasDecision: true, allowed: false }`
4. Otherwise, if any matching policy is an allow:
   - Return `{ hasDecision: true, allowed: true }`
5. If no match found:
   - Return `{ hasDecision: false, allowed: false }`

__Logging:__

```
[POLICY] Evaluate page=ProjectDocs action=page:edit user=john roles=editor|Authenticated|All
[POLICY] Check policy=admin-full-access effect=allow match=false
[POLICY] Check policy=editor-permissions effect=allow match=true
```

---

### `matches(policy, context)`

Checks if a single policy matches the given context.

__Parameters:__

- `policy` (object) - Policy to check
- `context` (object) - Access request context

__Returns:__ `boolean` - True if policy matches, false otherwise

__Matching Logic:__

```javascript
return subjectMatch && resourceMatch && actionMatch;
```

All three conditions must be true for a policy to match.

__Example:__

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

__Parameters:__

- `policySubjects` (`Array<object>`) - Policy subjects
- `userContext` (object) - User context with roles

__Returns:__ `boolean` - True if user matches

__Matching Rules:__

1. __No subjects specified__ → Matches everyone

   ```javascript
   policySubjects = []
   return true; // Applies to all users
   ```

2. __"All" role__ → Matches everyone (including anonymous)

   ```javascript
   policySubjects = [{ type: 'role', value: 'All' }]
   return true; // Universal match
   ```

3. __Specific roles__ → User must have at least one matching role

   ```javascript
   policySubjects = [
     { type: 'role', value: 'editor' },
     { type: 'role', value: 'admin' }
   ]
   userContext.roles = ['editor', 'Authenticated', 'All']
   return true; // User has 'editor' role
   ```

4. __No roles__ → No match for role-based policies

   ```javascript
   userContext.roles = []
   return false; // Cannot match role-based policies
   ```

__Example:__

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

__Parameters:__

- `resources` (`Array<object>`) - Policy resources
- `pageName` (string) - Page name to check

__Returns:__ `boolean` - True if resource matches

__Matching Rules:__

1. __No resources specified__ → Matches all resources

   ```javascript
   resources = []
   return true; // Applies to all resources
   ```

2. __Glob pattern matching__ → Uses micromatch

   ```javascript
   resources = [{ type: 'page', pattern: 'Project*' }]
   pageName = 'ProjectDocs'
   return true; // Matches pattern
   ```

3. __Wildcard pattern__ → Matches everything

   ```javascript
   resources = [{ type: 'page', pattern: '*' }]
   return true; // Universal resource match
   ```

__Pattern Examples:__

| Pattern | Matches | Doesn't Match |
| --------- | --------- | --------------- |
| `*` | Everything | - |
| `Project*` | `ProjectDocs`, `ProjectPlan` | `UserGuide` |
| `Admin/*` | `Admin/Users`, `Admin/Config` | `Users` |
| `*Docs` | `ProjectDocs`, `UserDocs` | `Project` |

__Example:__

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

__Parameters:__

- `actions` (`Array<string>`) - Policy actions
- `action` (string) - Action to check

__Returns:__ `boolean` - True if action matches

__Matching Rules:__

1. __No actions specified__ → Matches all actions

   ```javascript
   actions = []
   return true; // Applies to all actions
   ```

2. __Exact match__ → Action is in the list

   ```javascript
   actions = ['page:read', 'page:edit', 'page:create']
   action = 'page:edit'
   return true; // Exact match
   ```

3. __Wildcard action__ → Matches everything

   ```javascript
   actions = ['*']
   return true; // Universal action match
   ```

__Example:__

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

__Example Policy Using Built-in Roles:__

```json
{
  "id": "all-users-view",
  "subjects": [{ "type": "role", "value": "All" }],
  "resources": [{ "type": "page", "pattern": "*" }],
  "actions": ["page:read"]
}
```

This policy allows __everyone__ (logged-in or not) to read all pages.

---

## Decision Logic

### Deny-Overrides

PolicyEvaluator uses the XACML rule-combining algorithm `deny-overrides` (config key `ngdpbase.access.rule-combining-algorithm`, the only accepted value):

1. __Every policy__ is checked against the request
2. __Any matching deny wins__, whatever the order of the policies
3. With no matching deny, __any matching allow__ permits
4. Order does not matter, and policies have no priority

__Example:__

```javascript
// Policy 1
{
  "id": "admin-access",
  "effect": "allow",
  "subjects": [{ "type": "role", "value": "admin" }],
  "resources": [{ "type": "page", "pattern": "*" }],
  "actions": ["*"]
}

// Policy 2
{
  "id": "deny-sensitive",
  "effect": "deny",
  "subjects": [{ "type": "role", "value": "All" }],
  "resources": [{ "type": "page", "pattern": "SensitiveDocs" }],
  "actions": ["*"]
}
```

__Scenario:__ Admin user tries to access "SensitiveDocs"

1. Check Policy 1:
   - Subject: ✓ (user is admin)
   - Resource: ✓ (matches `*`)
   - Action: ✓ (matches `*`)
   - __MATCH__ → Effect: "allow"

2. Check Policy 2:
   - Subject: ✓ (`All` matches everyone)
   - Resource: ✓ (matches `SensitiveDocs`)
   - Action: ✓ (matches `*`)
   - __MATCH__ → Effect: "deny"

__Result:__ Admin is __denied__ "SensitiveDocs" (the matching deny overrides the matching allow, in either order)

---

### No Match = Deny

If no policy matches, access is __denied by default__:

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

The only caller for a capability is the PDP ([#1431](https://github.com/jwilleke/ngdpbase/issues/1431) step 14). `PolicyDecisionPoint.permits(subject, action)` runs the agent-token and share ceilings, then:

```javascript
const result = await policyEvaluator.evaluateAccess({
  pageName: '*',  // capability form: the question is about the subject
  action,
  userContext     // the subject's username, roles and isAuthenticated
});
return result.allowed;
```

Application code asks a context (`ctx.hasPermission(action)`), never the evaluator.

### Pattern 2: Check Page Access

```javascript
// In PageManager or Middleware
async function checkPageAccess(req, res, next) {
  const policyEvaluator = engine.getManager('PolicyEvaluator');
  const pip = engine.getManager('PolicyInformationPoint');

  const user = await pip.currentSubject(req);
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

1. __Single Pass__ - Each policy is checked once per request
2. __Cheap Checks First__ - Subject, resource and action matching are plain comparisons and globs
3. __In-Memory Storage__ - Policies cached in PolicyManager

### Time Complexity

- __Every Case:__ O(n) - All n policies are checked, because a later deny can still override an earlier allow

### Recommendations

1. __Use specific patterns__ to reduce false matches
2. __Avoid wildcard-only policies__ unless intentional
3. __Cache evaluation results__ if same check repeated

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

✅ __Do:__

```javascript
const userContext = {
  username: user.username,
  roles: [...user.roles, 'Authenticated', 'All'], // Include built-in roles
  isAuthenticated: true
};
```

❌ __Don't:__

```javascript
const userContext = {
  username: user.username,
  roles: user.roles, // Missing built-in roles!
  isAuthenticated: true
};
```

### 2. Use Specific Actions

✅ __Do:__

```javascript
await policyEvaluator.evaluateAccess({
  pageName: 'ProjectDocs',
  action: 'page:edit', // Specific action
  userContext: user
});
```

❌ __Don't:__

```javascript
await policyEvaluator.evaluateAccess({
  pageName: 'ProjectDocs',
  action: '*', // Too broad
  userContext: user
});
```

### 3. Check hasDecision Flag

✅ __Do:__

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
- ✅ Deny-overrides evaluation logic

---

__Maintained By:__ Development Team
__Status:__ Active Development

## Marking a deny as checked

The dashboard item "Access policies need review" reports every deny rule, because a deny beats every allow. For a deny that is meant, the administrator presses __Mark 'X' as checked__ on the item ([#2355](https://github.com/jwilleke/ngdpbase/issues/2355)).

- The button posts to `POST /admin/access-policies/deny-checked` with the rule's id and its fingerprint as the page showed it. The route asks `config-manage`, the permission that edits the policies, with the fresh sign-in a configuration write asks; the CSRF token is the app-wide check.
- `PolicyEvaluator.markDenyChecked` refuses a rule that is not a deny (`missing`) or whose content is no longer the one shown (`changed`). Otherwise it saves the id and the fingerprint in `ngdpbase.access.checked-denies` through `ConfigurationManager.setProperty` with the person's context, which records the `config-change` audit event, and works the item out again, so it goes without a restart.
- The fingerprint (`policyFingerprint` in `src/utils/pageWritePolicies.ts`) is a SHA-256 of the whole rule, keys in order, id included. At each start a deny whose stored fingerprint equals its current one is left out of the item (the log notes it at info level); an edited rule, or a new deny, is shown again. A rule with the same content under another id is a different rule.
- The mark hides the item and nothing else. Nothing that decides access reads `ngdpbase.access.checked-denies`; a marked deny still denies.

Known gap: a mark for a rule that is later removed stays in the list; it is never read again.
