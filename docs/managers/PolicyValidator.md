---
name: PolicyValidator
description: Schema validation for policy definitions; runs at startup to refuse malformed policies
dateModified: '2026-05-14'
category: managers
code: src/managers/PolicyValidator.ts
---

# PolicyValidator Documentation

__Version:__ 1.3.2
__Last Updated:__ 2025-10-11
__Manager Path:__ [src/managers/PolicyValidator.ts](../../src/managers/PolicyValidator.ts)

---

## Overview

The __PolicyValidator__ validates policy schemas, detects conflicts between policies, and ensures policy integrity before they are used by PolicyEvaluator. It uses JSON Schema (Ajv) for structural validation and custom logic for semantic validation.

### Key Features

- ✅ __Schema Validation:__ Uses JSON Schema (Ajv) to validate policy structure
- ✅ __Business Logic Validation:__ Checks for duplicates, invalid ranges
- ✅ __Semantic Validation:__ Detects logical inconsistencies
- ✅ __Conflict Detection:__ Identifies overlapping or conflicting policies
- ✅ __Priority Analysis:__ Finds policies that override each other
- ✅ __Warning Generation:__ Provides warnings for potential issues
- ✅ __Validation Caching:__ Caches validation results for performance

---

## Purpose

PolicyValidator serves as the __quality assurance system__ for policies. It ensures:

1. __Structural Integrity__ - Policies have required fields and correct types
2. __Logical Consistency__ - Policies don't have contradictory conditions
3. __No Conflicts__ - Policies don't unexpectedly override each other
4. __Best Practices__ - Policies follow recommended patterns

---

## Architecture

### Validation Flow

```
┌─────────────────────────────────────────────────────────┐
│ 1. Policy Input                                         │
│    {                                                    │
│      id: "editor-permissions",                          │
│      name: "Editor Permissions",                        │
│      effect: "allow",                                   │
│      subjects: [...],                                   │
│      resources: [...],                                  │
│      actions: [...]                                     │
│    }                                                    │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Schema Validation (Ajv)                              │
│    - Check required fields                              │
│    - Validate field types                               │
│    - Check enums and patterns                           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Business Logic Validation                            │
│    - Check for duplicate subjects/resources/actions     │
│    - Validate priority range (0-1000)                   │
│    - Ensure no conflicting data                         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Semantic Validation                                  │
│    - Check time-range has both start and end            │
│    - Check ip-range has ranges defined                  │
│    - Check attribute conditions have key/operator/value │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 5. Generate Warnings                                    │
│    - Very high/low priority                             │
│    - Overly broad patterns                              │
│    - Missing conditions                                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 6. Return Validation Result                             │
│    {                                                    │
│      isValid: true/false,                               │
│      errors: [...],                                     │
│      warnings: [...]                                    │
│    }                                                    │
└─────────────────────────────────────────────────────────┘
```

### Integration Diagram

```
┌────────────────┐
│ Admin UI       │
│ Policy Editor  │
└───────┬────────┘
        │
        │ validates before save
        ▼
┌─────────────────────┐      ┌──────────────────┐
│ PolicyValidator     │◄─────┤ PolicyManager    │
│ - validatePolicy()  │      │ - getAllPolicies()│
│ - detectConflicts() │      └──────────────────┘
└────────┬────────────┘
         │
         │ returns validation result
         ▼
┌────────────────┐
│ Admin UI       │
│ Show errors    │
└────────────────┘
```

---

## Key Methods

### `validatePolicy(policy)`

Validates a single policy for structural, business logic, and semantic correctness.

__Parameters:__

- `policy` (object) - Policy to validate

__Returns:__ `object`

```javascript
{
  isValid: boolean,       // true if no errors
  errors: Array<object>,  // List of validation errors
  warnings: Array<object> // List of warnings
}
```

__Example:__

```javascript
const policyValidator = engine.getManager('PolicyValidator');

const policy = {
  id: 'editor-permissions',
  name: 'Editor Permissions',
  priority: 80,
  effect: 'allow',
  subjects: [{ type: 'role', value: 'editor' }],
  resources: [{ type: 'page', pattern: '*' }],
  actions: ['page:read', 'page:edit', 'page:create']
};

const result = policyValidator.validatePolicy(policy);

if (!result.isValid) {
  console.error('Validation errors:', result.errors);
}

if (result.warnings.length > 0) {
  console.warn('Warnings:', result.warnings);
}
```

__Validation Layers:__

1. __Schema Validation__ - Uses JSON Schema (Ajv)
2. __Business Logic__ - Custom validation rules
3. __Semantic Check__ - Logical consistency checks
4. __Warning Generation__ - Best practice recommendations

---

### `validateAllPolicies(policies)`

Validates all policies and detects conflicts between them.

__Parameters:__

- `policies` (`Array<object>`, optional) - Policies to validate (default: get from PolicyManager)

__Returns:__ `object`

```javascript
{
  isValid: boolean,       // true if no errors
  errors: Array<object>,  // All validation errors
  warnings: Array<object>,// All warnings
  summary: {
    totalPolicies: number,
    validPolicies: number,
    conflicts: number
  }
}
```

__Example:__

```javascript
const policyValidator = engine.getManager('PolicyValidator');
const result = policyValidator.validateAllPolicies();

console.log(`Total policies: ${result.summary.totalPolicies}`);
console.log(`Valid policies: ${result.summary.validPolicies}`);
console.log(`Conflicts found: ${result.summary.conflicts}`);

if (!result.isValid) {
  result.errors.forEach(error => {
    console.error(`[${error.type}] ${error.message}`);
  });
}
```

__Checks:__

1. Validates each policy individually
2. Checks for duplicate policy IDs
3. Detects conflicting policies (same subjects/resources but different effects)
4. Identifies priority conflicts

---

### `detectPolicyConflicts(policies)`

Detects conflicting policies that might override each other.

__Parameters:__

- `policies` (`Array<object>`) - Policies to check

__Returns:__ `object`

```javascript
{
  errors: Array<object>,   // Critical conflicts
  warnings: Array<object>  // Potential override warnings
}
```

__Conflict Types:__

1. __Same Priority Conflict__ (ERROR)
   - Multiple policies with same highest priority
   - Evaluation order becomes unpredictable

2. __Override Warning__ (WARNING)
   - Higher priority policy overrides lower priority
   - Expected behavior but worth noting

__Example:__

```javascript
const conflicts = policyValidator.detectPolicyConflicts(policies);

// ERROR: Multiple policies with same priority
if (conflicts.errors.length > 0) {
  conflicts.errors.forEach(error => {
    console.error(`Conflict: ${error.message}`);
    console.error(`Policies: ${error.details.policies.join(', ')}`);
  });
}

// WARNING: Policy override
if (conflicts.warnings.length > 0) {
  conflicts.warnings.forEach(warning => {
    console.warn(`Warning: ${warning.message}`);
    console.warn(`Winner: ${warning.details.winner}`);
    console.warn(`Losers: ${warning.details.losers.join(', ')}`);
  });
}
```

---

### `validateAndSavePolicy(policy)`

Validates a policy and saves it (if valid) to PolicyManager.

__Parameters:__

- `policy` (object) - Policy to validate and save

__Returns:__ `Promise<object>`

```javascript
{
  success: boolean,
  policy: object,
  validation: object,
  conflicts: Array<object>
}
```

__Example:__

```javascript
try {
  const result = await policyValidator.validateAndSavePolicy(newPolicy);

  console.log('Policy saved successfully');
  console.log('Conflicts:', result.conflicts);
} catch (error) {
  console.error('Validation failed:', error.message);
}
```

__Process:__

1. Validates policy structure
2. Checks for conflicts with existing policies
3. Saves policy via PolicyManager (if valid)
4. Clears validation cache

---

## Validation Types

### 1. Schema Validation

Uses JSON Schema to validate structure and types.

__Checks:__

- Required fields present
- Correct data types
- Enum value validation
- Pattern matching
- Array constraints

__Example Errors:__

```javascript
{
  type: 'schema',
  field: '/priority',
  message: 'must be number',
  details: { /* Ajv error details */ }
}
```

__Policy Schema:__

```javascript
{
  type: 'object',
  required: ['id', 'name', 'effect', 'subjects', 'resources', 'actions'],
  properties: {
    id: {
      type: 'string',
      pattern: '^[a-zA-Z0-9_-]+$',
      minLength: 1,
      maxLength: 100
    },
    priority: {
      type: 'number',
      minimum: 0,
      maximum: 1000
    },
    effect: {
      type: 'string',
      enum: ['allow', 'deny']
    }
    // ... more fields
  }
}
```

---

### 2. Business Logic Validation

Custom validation rules for business constraints.

__Checks:__

- No duplicate subjects
- No duplicate resources
- No duplicate actions
- Priority in valid range (0-1000)

__Example Errors:__

```javascript
{
  type: 'business',
  field: 'subjects[1]',
  message: 'Duplicate subject criteria found'
}

{
  type: 'business',
  field: 'priority',
  message: 'Priority must be between 0 and 1000'
}
```

---

### 3. Semantic Validation

Checks for logical consistency and completeness.

__Checks:__

- Time-range conditions have both start and end times
- IP-range conditions have ranges defined
- Attribute conditions have key, operator, and value
- Deny policies don't include admin actions (anti-pattern)

__Example Errors:__

```javascript
{
  type: 'semantic',
  field: 'conditions[0]',
  message: 'Time range condition must have both startTime and endTime'
}

{
  type: 'semantic',
  field: 'effect',
  message: 'Deny policies should not include admin actions'
}
```

---

### 4. Warning Generation

Generates warnings for potential issues (non-critical).

__Warning Types:__

1. __Priority Warnings__

   ```javascript
   {
     type: 'priority',
     message: 'Very high priority may override important security policies'
   }
   ```

2. __Scope Warnings__

   ```javascript
   {
     type: 'scope',
     field: 'resources[0]',
     message: 'Very broad resource pattern may grant excessive permissions'
   }
   ```

3. __Condition Warnings__

   ```javascript
   {
     type: 'conditions',
     message: 'Policy has no conditions - consider adding time or context restrictions'
   }
   ```

---

## Conflict Detection

### Overlap Detection

Policies are considered __overlapping__ if they have:

1. Matching subjects (same roles/users)
2. Matching resources (same pages/patterns)
3. Matching actions

__Example Overlap:__

```javascript
// Policy A
{
  subjects: [{ type: 'role', value: 'editor' }],
  resources: [{ type: 'page', pattern: 'Project*' }],
  actions: ['page:edit']
}

// Policy B (overlaps with A)
{
  subjects: [{ type: 'role', value: 'editor' }],
  resources: [{ type: 'page', pattern: 'Project*' }],
  actions: ['page:edit', 'page:delete']
}
```

### Conflict Resolution

When overlapping policies have different effects:

1. __Higher Priority Wins__ (if priorities differ)

   ```
   Policy A: priority 80, effect: allow
   Policy B: priority 60, effect: deny
   Result: WARNING (A overrides B)
   ```

2. __Unpredictable Order__ (if priorities are equal)

   ```
   Policy A: priority 50, effect: allow
   Policy B: priority 50, effect: deny
   Result: ERROR (conflict - cannot determine winner)
   ```

---

## Validation Cache

### Purpose

Caches validation results to avoid re-validating unchanged policies.

### Cache Key

```javascript
const cacheKey = `policy_${policy.id}`;
```

### Cache Operations

__Check Cache:__

```javascript
if (this.validationCache.has(cacheKey)) {
  return this.validationCache.get(cacheKey);
}
```

__Store Result:__

```javascript
this.validationCache.set(cacheKey, result);
```

__Clear Cache:__

```javascript
this.validationCache.clear();
```

__When to Clear:__

- After saving a policy
- After updating policies
- When policy definitions change

---

## Policy Schema Definition

### Complete Schema

```javascript
{
  type: 'object',
  required: ['id', 'name', 'effect', 'subjects', 'resources', 'actions'],
  properties: {
    // Identification
    id: {
      type: 'string',
      pattern: '^[a-zA-Z0-9_-]+$',
      minLength: 1,
      maxLength: 100
    },
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 200
    },
    description: {
      type: 'string',
      maxLength: 1000
    },

    // Priority
    priority: {
      type: 'number',
      minimum: 0,
      maximum: 1000,
      default: 50
    },

    // Effect
    effect: {
      type: 'string',
      enum: ['allow', 'deny']
    },

    // Subjects
    subjects: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['type'],
        properties: {
          type: {
            type: 'string',
            enum: ['user', 'role', 'group', 'attribute', 'authenticated', 'anonymous', 'admin']
          },
          value: {
            type: ['string', 'number', 'boolean']
          }
        }
      }
    },

    // Resources
    resources: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['type'],
        properties: {
          type: {
            type: 'string',
            enum: ['page', 'attachment', 'category', 'tag', 'resource-type', 'path']
          },
          pattern: {
            type: 'string'
          }
        }
      }
    },

    // Actions
    actions: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'string',
        enum: ['view', 'edit', 'delete', 'upload', 'download', 'admin', 'create', 'update']
      }
    },

    // Conditions (optional)
    conditions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type'],
        properties: {
          type: {
            type: 'string',
            enum: ['time-range', 'ip-range', 'user-attribute', 'context-attribute']
          }
        }
      }
    }
  }
}
```

---

## Usage Patterns

### Pattern 1: Validate Before Saving

```javascript
// In Admin UI - Policy Editor
async function savePolicyFromUI(policyData) {
  const policyValidator = engine.getManager('PolicyValidator');

  // Validate first
  const validation = policyValidator.validatePolicy(policyData);

  if (!validation.isValid) {
    // Show errors to user
    validation.errors.forEach(error => {
      showError(`[${error.field}] ${error.message}`);
    });
    return;
  }

  // Show warnings (optional)
  if (validation.warnings.length > 0) {
    validation.warnings.forEach(warning => {
      showWarning(warning.message);
    });
  }

  // Save policy
  try {
    await policyValidator.validateAndSavePolicy(policyData);
    showSuccess('Policy saved successfully');
  } catch (error) {
    showError(`Failed to save: ${error.message}`);
  }
}
```

### Pattern 2: Validate All Policies on Startup

```javascript
// In WikiEngine initialization
async function validatePoliciesOnStartup() {
  const policyValidator = engine.getManager('PolicyValidator');
  const result = policyValidator.validateAllPolicies();

  if (!result.isValid) {
    console.error('❌ Policy validation failed on startup');
    result.errors.forEach(error => {
      console.error(`  - ${error.message}`);
    });
    throw new Error('Invalid policy configuration');
  }

  if (result.warnings.length > 0) {
    console.warn('⚠️  Policy warnings:');
    result.warnings.forEach(warning => {
      console.warn(`  - ${warning.message}`);
    });
  }

  console.log(`✅ All ${result.summary.totalPolicies} policies validated successfully`);
}
```

### Pattern 3: Detect Conflicts Before Deployment

```javascript
// Before deploying new policies
async function checkPolicyConflicts() {
  const policyManager = engine.getManager('PolicyManager');
  const policyValidator = engine.getManager('PolicyValidator');

  const policies = policyManager.getAllPolicies();
  const conflicts = policyValidator.detectPolicyConflicts(policies);

  if (conflicts.errors.length > 0) {
    console.error('❌ Critical conflicts found:');
    conflicts.errors.forEach(error => {
      console.error(`  ${error.message}`);
      console.error(`  Policies: ${error.details.policies.join(', ')}`);
    });
    throw new Error('Cannot deploy - resolve conflicts first');
  }

  if (conflicts.warnings.length > 0) {
    console.warn('⚠️  Policy overrides:');
    conflicts.warnings.forEach(warning => {
      console.warn(`  ${warning.message}`);
    });
  }
}
```

---

## Best Practices

### 1. Always Validate Before Saving

✅ __Do:__

```javascript
const validation = policyValidator.validatePolicy(newPolicy);
if (validation.isValid) {
  await savePolicyToConfig(newPolicy);
}
```

❌ __Don't:__

```javascript
await savePolicyToConfig(newPolicy); // No validation!
```

### 2. Handle Warnings Appropriately

✅ __Do:__

```javascript
if (result.warnings.length > 0) {
  console.warn('Warnings found:', result.warnings);
  // Show to user, log for review, etc.
}
```

### 3. Use Unique Priority Values

✅ __Do:__

```json
[
  { "id": "policy-a", "priority": 100 },
  { "id": "policy-b", "priority": 80 },
  { "id": "policy-c", "priority": 60 }
]
```

❌ __Don't:__

```json
[
  { "id": "policy-a", "priority": 50 },
  { "id": "policy-b", "priority": 50 }
]
```

### 4. Clear Cache After Updates

✅ __Do:__

```javascript
await policyManager.savePolicy(updatedPolicy);
policyValidator.clearCache(); // Clear validation cache
```

---

## Error Types Reference

### Schema Errors

| Field | Message | Cause |
| ------- | --------- | ------- |
| `/id` | must be string | ID is not a string |
| `/priority` | must be number | Priority is not a number |
| `/effect` | must be equal to one of the allowed values | Effect is not "allow" or "deny" |
| `/subjects` | must be array | Subjects is not an array |

### Business Errors

| Field | Message | Cause |
| ------- | --------- | ------- |
| `subjects[n]` | Duplicate subject criteria found | Same subject appears twice |
| `priority` | Priority must be between 0 and 1000 | Priority out of range |
| `actions` | Duplicate actions found | Same action appears twice |

### Semantic Errors

| Field | Message | Cause |
| ------- | --------- | ------- |
| `conditions[n]` | Time range condition must have both startTime and endTime | Missing time |
| `effect` | Deny policies should not include admin actions | Anti-pattern |

---

## Related Documentation

- [PolicyManager Documentation](./PolicyManager-Documentation.md)
- [PolicyEvaluator Documentation](./PolicyEvaluator-Documentation.md)
- [UserManager Documentation](./UserManager-Documentation.md)
- [Policies, Roles & Permissions](../architecture/Policies-Roles-Permissions.md)

---

## Changelog

### v1.3.2 (2025-10-11)

- ✅ Initial documentation
- ✅ JSON Schema validation using Ajv
- ✅ Business logic validation
- ✅ Semantic validation
- ✅ Conflict detection
- ✅ Validation caching

---

__Maintained By:__ Development Team
__Status:__ Active Development
