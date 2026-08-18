# Policy-Based Access Control Troubleshooting Guide

## Overview

This guide provides comprehensive troubleshooting information for the ngdpbase Policy-Based Access Control (PBAC) system. It covers common issues, diagnostic procedures, and resolution steps to help administrators maintain a healthy policy environment.

## Quick Diagnosis Checklist

Before diving into specific issues, use this checklist for rapid diagnosis:

### 1. Policy Configuration

- [ ] Policies are syntactically valid JSON
- [ ] Required fields are present (`id`, `name`, `effect`, `subjects`, `resources`, `actions`)
- [ ] Subject, resource, and action values are correct
- [ ] Priority levels are appropriate
- [ ] No conflicting policies with same priority

### 2. System Integration

- [ ] PolicyManager is properly initialized
- [ ] ACLManager integration is working
- [ ] User context is correctly passed
- [ ] Cache is functioning (if enabled)

### 3. User Experience

- [ ] Users can access expected resources
- [ ] Deny policies are not overly restrictive
- [ ] Allow policies are granting correct access
- [ ] Conditions are evaluating correctly

## Common Issues and Solutions

### Issue 1: Users Cannot Access Expected Resources

__Symptoms:__

- Users report "Access Denied" for resources they should access
- Policy evaluation returns unexpected results
- Audit logs show policy denials

__Possible Causes:__

1. Higher-priority deny policy is blocking access
2. Subject matching is incorrect
3. Resource patterns don't match
4. Conditions are not met

__Diagnostic Steps:__

1. __Check Policy Priority__

   ```bash
   # List policies by priority
   grep -r "priority" /path/to/policies/
   ```

   Look for policies with higher priority that might conflict.

2. __Verify Subject Matching__
   - Check user's roles and attributes
   - Ensure subject values match exactly
   - Verify case sensitivity

3. __Test Resource Patterns__

   ```javascript
   // Test pattern matching
   const pattern = "Admin*";
   const testResource = "AdminUsers";
   console.log(testResource.match(pattern.replace(/\*/g, '.*')));
   ```

4. __Review Conditions__
   - Check time ranges for current time
   - Verify IP ranges include user's IP
   - Test user attributes match condition requirements

__Resolution Steps:__

1. __Adjust Policy Priority__

   ```json
   {
     "id": "fix-access-issue",
     "name": "Fix Access Issue",
     "priority": 200,
     "effect": "allow",
     "subjects": [{"type": "role", "value": "user"}],
     "resources": [{"type": "page", "pattern": "*"}],
     "actions": ["view", "edit"]
   }
   ```

2. __Create Override Policy__

   ```json
   {
     "id": "emergency-override",
     "name": "Emergency Access Override",
     "priority": 1000,
     "effect": "allow",
     "subjects": [{"type": "user", "value": "affected-user"}],
     "resources": [{"type": "page", "pattern": "*"}],
     "actions": ["view", "edit"]
   }
   ```

3. __Fix Subject Configuration__

   ```json
   // Before (incorrect)
   {"type": "role", "value": "Editor"}

   // After (correct)
   {"type": "role", "value": "editor"}
   ```

### Issue 2: Policies Not Taking Effect

__Symptoms:__

- Policy changes don't appear to work
- Old behavior persists after policy updates
- Cache-related issues

__Possible Causes:__

1. Policy cache not cleared
2. Policy file not saved correctly
3. Server restart required
4. Policy validation errors

__Diagnostic Steps:__

1. __Check Policy File__

   ```bash
   # Verify policy file exists and is readable
   ls -la /path/to/policies/
   cat /path/to/policies/active-policies.json
   ```

2. __Validate JSON Syntax__

   ```bash
   # Use jq to validate JSON
   jq . /path/to/policies/active-policies.json

   # Or use python
   python -m json.tool /path/to/policies/active-policies.json
   ```

3. __Check Cache Status__

   ```javascript
   // Check if cache is enabled and current
   const policyManager = engine.getManager('PolicyManager');
   console.log('Cache enabled:', policyManager.cacheEnabled);
   console.log('Cache size:', policyManager.cache.size);
   ```

4. __Review Server Logs__

   ```bash
   # Check for policy loading errors
   grep -i "policy" /var/log/ngdpbase/app.log
   grep -i "error" /var/log/ngdpbase/app.log
   ```

__Resolution Steps:__

1. __Clear Policy Cache__

   ```javascript
   // Clear cache programmatically
   const policyManager = engine.getManager('PolicyManager');
   policyManager.clearCache();
   ```

2. __Restart Services__

   ```bash
   # Restart the wiki service
   sudo systemctl restart ngdpbase
   # or
   pm2 restart ngdpbase
   ```

3. __Reload Policies__

   ```javascript
   // Force policy reload
   const policyManager = engine.getManager('PolicyManager');
   await policyManager.loadPolicies();
   ```

4. __Validate and Save__

   ```bash
   # Backup current policies
   cp /path/to/policies/active-policies.json /path/to/policies/backup.json

   # Edit and validate
   nano /path/to/policies/active-policies.json
   jq . /path/to/policies/active-policies.json > /dev/null && echo "Valid JSON"
   ```

### Issue 3: Performance Degradation

__Symptoms:__

- Slow page loads
- High CPU usage during policy evaluation
- Timeout errors
- Memory usage spikes

__Possible Causes:__

1. Too many policies
2. Inefficient policy patterns
3. Cache misses
4. Complex conditions

__Diagnostic Steps:__

1. __Monitor Policy Evaluation__

   ```javascript
   // Add timing to policy evaluation
   const startTime = Date.now();
   const result = await policyManager.evaluatePolicies(context);
   const duration = Date.now() - startTime;
   console.log(`Policy evaluation took ${duration}ms`);
   ```

2. __Check Policy Count__

   ```bash
   # Count active policies
   jq '. | length' /path/to/policies/active-policies.json
   ```

3. __Analyze Cache Performance__

   ```javascript
   // Check cache hit rate
   const stats = policyManager.getCacheStats();
   console.log('Hit rate:', stats.hits / (stats.hits + stats.misses));
   ```

4. __Profile Resource Patterns__

   ```javascript
   // Test pattern performance
   const patterns = ['*', 'Admin*', 'Project-*', 'Home'];
   const testResource = 'AdminUsers';

   patterns.forEach(pattern => {
     const start = Date.now();
     for (let i = 0; i < 1000; i++) {
       testResource.match(pattern.replace(/\*/g, '.*'));
     }
     console.log(`${pattern}: ${Date.now() - start}ms`);
   });
   ```

__Resolution Steps:__

1. __Optimize Patterns__

   ```json
   // Before (inefficient)
   {"type": "page", "pattern": "*"}

   // After (specific)
   {"type": "page", "pattern": "Project-*"}
   ```

2. __Implement Caching Strategy__

   ```javascript
   // Enable result caching
   policyManager.enableCache({
     maxSize: 1000,
     ttl: 300000 // 5 minutes
   });
   ```

3. __Consolidate Policies__

   ```json
   // Combine similar policies
   {
     "id": "consolidated-editor-access",
     "name": "Consolidated Editor Access",
     "subjects": [
       {"type": "role", "value": "editor"},
       {"type": "role", "value": "senior-editor"}
     ],
     "resources": [
       {"type": "page", "pattern": "*"},
       {"type": "attachment", "pattern": "*.doc*"}
     ],
     "actions": ["view", "edit", "create"]
   }
   ```

4. __Add Performance Monitoring__

   ```javascript
   // Monitor policy evaluation performance
   const slowThreshold = 100; // ms
   if (duration > slowThreshold) {
     console.warn(`Slow policy evaluation: ${duration}ms`);
     // Log context for analysis
   }
   ```

### Issue 4: Unexpected Access Granted

__Symptoms:__

- Users can access resources they shouldn't
- Security violations
- Audit logs show unauthorized access

__Possible Causes:__

1. Overly permissive policies
2. Incorrect allow policies
3. Missing deny policies
4. Subject matching too broad

__Diagnostic Steps:__

1. __Review Allow Policies__

   ```bash
   # Find overly permissive policies
   jq '.[] | select(.effect == "allow") | select(.resources[].pattern == "*")' /path/to/policies/active-policies.json
   ```

2. __Check Subject Scope__

   ```javascript
   // Analyze subject breadth
   const policy = getPolicyById('problematic-policy');
   const subjectTypes = policy.subjects.map(s => s.type);
   console.log('Subject types:', subjectTypes);
   ```

3. __Audit Access Patterns__

   ```bash
   # Check recent access logs
   grep "ALLOW" /var/log/ngdpbase/access.log | tail -20
   ```

4. __Test Policy Logic__

   ```javascript
   // Simulate access request
   const testContext = {
     user: { username: 'test-user', roles: ['user'] },
     resource: 'sensitive-page',
     action: 'view'
   };

   const result = await policyManager.evaluatePolicies(testContext);
   console.log('Access result:', result);
   ```

__Resolution Steps:__

1. __Add Deny Policies__

   ```json
   {
     "id": "restrict-sensitive-content",
     "name": "Restrict Sensitive Content",
     "priority": 300,
     "effect": "deny",
     "subjects": [
       {"type": "role", "value": "user"}
     ],
     "resources": [
       {"type": "category", "value": "Confidential"}
     ],
     "actions": ["view"]
   }
   ```

2. __Refine Subject Matching__

   ```json
   // Before (too broad)
   {"type": "authenticated"}

   // After (specific)
   {"type": "role", "value": "approved-user"}
   ```

3. __Implement Defense in Depth__

   ```json
   // Multiple layers of protection
   [
     {
       "id": "base-deny",
       "priority": 50,
       "effect": "deny",
       "subjects": [{"type": "anonymous"}],
       "resources": [{"type": "page", "pattern": "*"}],
       "actions": ["view", "edit"]
     },
     {
       "id": "selective-allow",
       "priority": 100,
       "effect": "allow",
       "subjects": [{"type": "role", "value": "trusted-user"}],
       "resources": [{"type": "page", "pattern": "public-*"}],
       "actions": ["view"]
     }
   ]
   ```

### Issue 5: Policy Validation Errors

__Symptoms:__

- Policies cannot be saved
- Schema validation failures
- Import errors

__Possible Causes:__

1. JSON syntax errors
2. Missing required fields
3. Invalid values
4. Schema version mismatch

__Diagnostic Steps:__

1. __Validate JSON Syntax__

   ```bash
   # Check for syntax errors
   python -c "import json; json.load(open('policy.json'))"
   ```

2. __Schema Validation__

   ```javascript
   const Ajv = require('ajv');
   const ajv = new Ajv();
   const validate = ajv.compile(schema);
   const valid = validate(policy);

   if (!valid) {
     console.log('Validation errors:', validate.errors);
   }
   ```

3. __Check Required Fields__

   ```javascript
   const requiredFields = ['id', 'name', 'effect', 'subjects', 'resources', 'actions'];
   const missingFields = requiredFields.filter(field => !policy.hasOwnProperty(field));
   console.log('Missing fields:', missingFields);
   ```

4. __Verify Field Values__

   ```javascript
   // Check enum values
   const validEffects = ['allow', 'deny'];
   const validActions = ['view', 'edit', 'delete', 'create', 'upload', 'download', 'admin'];

   if (!validEffects.includes(policy.effect)) {
     console.error('Invalid effect:', policy.effect);
   }
   ```

__Resolution Steps:__

1. __Fix JSON Syntax__

   ```json
   // Before (invalid)
   {
     "id": "test-policy",
     "name": "Test Policy",
     "effect": "allow",
     "subjects": [{"type": "user", "value": "test"}],
     "resources": [{"type": "page", "pattern": "*"}],
     "actions": ["view", "edit"],
   }

   // After (valid)
   {
     "id": "test-policy",
     "name": "Test Policy",
     "effect": "allow",
     "subjects": [{"type": "user", "value": "test"}],
     "resources": [{"type": "page", "pattern": "*"}],
     "actions": ["view", "edit"]
   }
   ```

2. __Add Missing Fields__

   ```json
   {
     "id": "complete-policy",
     "name": "Complete Policy",
     "description": "A properly formed policy",
     "priority": 100,
     "effect": "allow",
     "subjects": [{"type": "role", "value": "user"}],
     "resources": [{"type": "page", "pattern": "*"}],
     "actions": ["view", "edit"]
   }
   ```

3. __Correct Invalid Values__

   ```json
   // Before (invalid action)
   {"actions": ["read", "write"]}

   // After (valid actions)
   {"actions": ["view", "edit"]}
   ```

## Advanced Troubleshooting

### Policy Conflict Analysis

__Identify Conflicting Policies:__

```javascript
function findConflicts(policies) {
  const conflicts = [];

  for (let i = 0; i < policies.length; i++) {
    for (let j = i + 1; j < policies.length; j++) {
      const policy1 = policies[i];
      const policy2 = policies[j];

      if (policiesConflict(policy1, policy2)) {
        conflicts.push({
          policy1: policy1.id,
          policy2: policy2.id,
          reason: getConflictReason(policy1, policy2)
        });
      }
    }
  }

  return conflicts;
}
```

__Resolve Conflicts:__

1. Adjust priority levels
2. Refine subject/resource scope
3. Combine overlapping policies
4. Create explicit override policies

### Performance Profiling

__Profile Policy Evaluation:__

```javascript
class PolicyProfiler {
  constructor() {
    this.metrics = {
      evaluationCount: 0,
      totalTime: 0,
      slowestEvaluation: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  recordEvaluation(duration, cached = false) {
    this.metrics.evaluationCount++;
    this.metrics.totalTime += duration;

    if (duration > this.metrics.slowestEvaluation) {
      this.metrics.slowestEvaluation = duration;
    }

    if (cached) {
      this.metrics.cacheHits++;
    } else {
      this.metrics.cacheMisses++;
    }
  }

  getReport() {
    return {
      ...this.metrics,
      averageTime: this.metrics.totalTime / this.metrics.evaluationCount,
      cacheHitRate: this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)
    };
  }
}
```

### Audit Log Analysis

__Analyze Access Patterns:__

```bash
# Find most accessed resources
grep "ACCESS" /var/log/ngdpbase/audit.log | \
  awk '{print $7}' | \
  sort | \
  uniq -c | \
  sort -nr | \
  head -10

# Find policy denial reasons
grep "DENY" /var/log/ngdpbase/audit.log | \
  awk '{print $8}' | \
  sort | \
  uniq -c | \
  sort -nr

# Monitor policy evaluation performance
grep "POLICY_EVAL" /var/log/ngdpbase/performance.log | \
  awk '{sum += $3; count++} END {print "Average:", sum/count, "ms"}'
```

### Automated Testing

__Policy Test Suite:__

```javascript
const PolicyTester = {
  testBasicAccess: function() {
    const testCases = [
      {
        user: { roles: ['editor'] },
        resource: 'test-page',
        action: 'edit',
        expected: true
      },
      {
        user: { roles: ['viewer'] },
        resource: 'test-page',
        action: 'edit',
        expected: false
      }
    ];

    testCases.forEach((testCase, index) => {
      const result = policyManager.evaluatePolicies(testCase);
      if (result.allowed !== testCase.expected) {
        console.error(`Test ${index} failed:`, testCase, result);
      }
    });
  },

  testConditions: function() {
    // Test time-based conditions
    // Test IP-based conditions
    // Test attribute conditions
  },

  testPerformance: function() {
    const iterations = 1000;
    const startTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      policyManager.evaluatePolicies({
        user: { roles: ['user'] },
        resource: 'test-page',
        action: 'view'
      });
    }

    const avgTime = (Date.now() - startTime) / iterations;
    console.log(`Average evaluation time: ${avgTime}ms`);
  }
};
```

## Emergency Procedures

### Complete Policy System Reset

__When to Use:__

- Corrupted policy configuration
- Multiple conflicting policies
- System-wide access issues

__Procedure:__

```bash
# 1. Backup current policies
cp /path/to/policies/active-policies.json /path/to/backup/emergency-backup.json

# 2. Create minimal allow-all policy
cat > /path/to/policies/active-policies.json << 'EOF'
[
  {
    "id": "emergency-access",
    "name": "Emergency Access",
    "description": "Temporary access during emergency",
    "priority": 1000,
    "effect": "allow",
    "subjects": [{"type": "authenticated"}],
    "resources": [{"type": "page", "pattern": "*"}],
    "actions": ["view", "edit", "create"],
    "metadata": {
      "emergency": true,
      "created": "'$(date -Iseconds)'"
    }
  }
]
EOF

# 3. Restart services
sudo systemctl restart ngdpbase

# 4. Verify access
curl -u admin:password http://localhost:3000/

# 5. Gradually restore policies
# Edit and validate each policy before adding back
```

### Emergency Access Override

__For Immediate Access Issues:__

```json
{
  "id": "emergency-override",
  "name": "Emergency Access Override",
  "description": "Temporary override for critical access",
  "priority": 10000,
  "effect": "allow",
  "subjects": [
    {"type": "user", "value": "emergency-user"},
    {"type": "admin"}
  ],
  "resources": [{"type": "page", "pattern": "*"}],
  "actions": ["view", "edit", "delete", "create", "upload", "download", "admin"],
  "conditions": [
    {
      "type": "context-attribute",
      "key": "emergencyMode",
      "value": true
    }
  ]
}
```

## Monitoring and Maintenance

### Regular Health Checks

__Daily Checks:__

```bash
#!/bin/bash
# Policy system health check script

echo "=== Policy System Health Check ==="

# Check policy file integrity
if jq . /path/to/policies/active-policies.json > /dev/null 2>&1; then
    echo "✓ Policy file is valid JSON"
else
    echo "✗ Policy file has JSON errors"
fi

# Check policy count
policy_count=$(jq '. | length' /path/to/policies/active-policies.json)
echo "Policy count: $policy_count"

# Check for high-priority policies
high_priority=$(jq '.[] | select(.priority > 500) | .id' /path/to/policies/active-policies.json)
if [ -n "$high_priority" ]; then
    echo "⚠ High-priority policies found:"
    echo "$high_priority"
fi

# Check recent errors
error_count=$(grep -c "ERROR.*policy" /var/log/ngdpbase/app.log)
if [ "$error_count" -gt 0 ]; then
    echo "⚠ $error_count policy-related errors in logs"
fi

echo "=== Health Check Complete ==="
```

### Performance Monitoring

__Key Metrics to Monitor:__

- Policy evaluation response time
- Cache hit/miss ratio
- Memory usage
- Error rates
- Policy change frequency

__Alert Thresholds:__

- Evaluation time > 100ms
- Cache hit rate < 80%
- Memory usage > 500MB
- Error rate > 5%

### Backup and Recovery

__Regular Backup Procedure:__

```bash
#!/bin/bash
# Policy backup script

BACKUP_DIR="/path/to/policy-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup current policies
cp /path/to/policies/active-policies.json "$BACKUP_DIR/policies_$TIMESTAMP.json"

# Backup configuration
cp /config/policy-config.json "$BACKUP_DIR/config_$TIMESTAMP.json"

# Compress old backups (older than 30 days)
find "$BACKUP_DIR" -name "*.json" -mtime +30 -exec gzip {} \;

# Keep only last 10 backups
ls -t "$BACKUP_DIR"/policies_*.json | tail -n +11 | xargs rm -f

echo "Policy backup completed: $TIMESTAMP"
```

## Getting Help

### Support Resources

1. __Documentation__
   - Admin User Guide: `/docs/admin/policy-management-guide.md`
   - Schema Documentation: `/docs/admin/policy-schema-documentation.md`
   - API Documentation: `/docs/api/policy-api.md`

2. __Community Support__
   - GitHub Issues: Report bugs and request features
   - Discussion Forums: Ask questions and share solutions
   - Wiki Pages: Community-contributed guides

3. __Professional Services__
   - Enterprise support contracts
   - Custom policy development
   - Security audits and assessments

### Escalation Procedures

__For Critical Issues:__

1. Enable emergency access override
2. Create incident ticket
3. Notify security team
4. Implement temporary workaround
5. Schedule root cause analysis

__Contact Information:__

- Security Team: `security@company.com`
- DevOps Team: `devops@company.com`
- Policy Administrators: `policy-admins@company.com`

---

*This troubleshooting guide covers ngdpbase Policy-Based Access Control version 1.0. For the latest troubleshooting information and additional tools, check the official documentation.*
