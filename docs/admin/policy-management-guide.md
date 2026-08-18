# Policy-Based Access Control Administration Guide

## Overview

ngdpbase's Policy-Based Access Control (PBAC) system provides flexible, JSON-based access control policies that allow administrators to define sophisticated permission rules beyond traditional role-based access control.

### Key Features

- __JSON Schema Validation__: Ensures policy integrity and prevents configuration errors
- __Flexible Subject Matching__: Support for users, roles, groups, attributes, and authentication status
- __Advanced Conditions__: Time ranges, IP restrictions, user attributes, and custom conditions
- __Priority System__: Higher-priority policies override lower ones
- __Performance Caching__: Optimized for repeated evaluations
- __Audit Integration__: Full logging of policy decisions

## Accessing Policy Management

### Web Interface

1. Log in to ngdpbase as an administrator
2. Navigate to `/admin/policies` or click "Policy Management" from the admin dashboard
3. The policy management interface will display:
   - Policy statistics overview
   - List of existing policies
   - Create/Edit/Delete controls

### API Access

The policy system also provides RESTful API endpoints:

```http
GET    /admin/policies          # List all policies
POST   /admin/policies          # Create new policy
GET    /admin/policies/:id      # Get specific policy
PUT    /admin/policies/:id      # Update policy
DELETE /admin/policies/:id      # Delete policy
```

## Understanding Policy Components

### Policy Structure

Every policy consists of the following components:

```json
{
  "id": "unique-policy-identifier",
  "name": "Human-readable policy name",
  "description": "Detailed description of the policy",
  "priority": 50,
  "effect": "allow|deny",
  "subjects": [...],
  "resources": [...],
  "actions": [...],
  "conditions": [...],
  "metadata": {...}
}
```

### Subjects (Who)

Subjects define who the policy applies to. Supported types:

- __user__: Specific username (`"value": "john.doe"`)
- __role__: Users with specific role (`"value": "editor"`)
- __group__: Users in specific group (`"value": "marketing"`)
- __attribute__: Users with specific attribute (`"key": "department", "value": "IT"`)
- __authenticated__: Any authenticated user
- __anonymous__: Non-authenticated users
- __admin__: Users with admin privileges

### Resources (What)

Resources define what the policy applies to. Supported types:

- __page__: Wiki pages (`"pattern": "*"`, `"pattern": "Admin*"`)
- __attachment__: File attachments (`"pattern": "*.pdf"`)
- __category__: Pages in specific category (`"value": "System"`)
- __tag__: Pages with specific tag (`"value": "confidential"`)
- __resource-type__: Specific resource types (`"value": "page"`)
- __path__: URL path patterns (`"pattern": "/api/*"`)

### Actions (How)

Actions define what operations are allowed/denied:

- __view__: Read/view content
- __edit__: Modify content
- __delete__: Remove content
- __create__: Create new content
- __upload__: Upload files
- __download__: Download files
- __admin__: Administrative operations

### Conditions (When)

Conditions add additional constraints. Supported types:

- __time-range__: Time-based restrictions
- __ip-range__: IP address restrictions
- __user-attribute__: User attribute checks
- __context-attribute__: Request context checks
- __environment__: Environment-specific rules
- __session-attribute__: Session-based conditions

## Creating Policies

### Using the Web Interface

1. Click "Create Policy" button
2. Fill in basic information:
   - __Policy Name__: Descriptive name
   - __Priority__: Number (higher = more important)
   - __Effect__: Allow or Deny
   - __Description__: Optional details

3. Define __Subjects__ (Who):
   - Click "Add Subject"
   - Choose subject type
   - Enter value/pattern

4. Define __Resources__ (What):
   - Click "Add Resource"
   - Choose resource type
   - Enter value/pattern

5. Select __Actions__ (How):
   - Check applicable actions

6. Add __Conditions__ (When - optional):
   - Click "Add Condition"
   - Choose condition type
   - Configure parameters

7. Click "Create Policy"

### Using JSON (Advanced)

For complex policies, you can edit the JSON directly:

```json
{
  "id": "business-hours-edit",
  "name": "Business Hours Edit Access",
  "description": "Allow editing only during business hours",
  "priority": 100,
  "effect": "allow",
  "subjects": [
    {
      "type": "role",
      "value": "editor"
    }
  ],
  "resources": [
    {
      "type": "page",
      "pattern": "*"
    }
  ],
  "actions": ["edit"],
  "conditions": [
    {
      "type": "time-range",
      "startTime": "09:00",
      "endTime": "17:00"
    }
  ]
}
```

## Common Policy Examples

### 1. Role-Based Access

__Allow editors to edit all pages:__

```json
{
  "id": "editor-full-edit",
  "name": "Editor Full Edit Access",
  "priority": 50,
  "effect": "allow",
  "subjects": [{"type": "role", "value": "editor"}],
  "resources": [{"type": "page", "pattern": "*"}],
  "actions": ["view", "edit", "create"]
}
```

### 2. Time-Based Restrictions

__Restrict admin access to business hours:__

```json
{
  "id": "admin-business-hours",
  "name": "Admin Business Hours Only",
  "priority": 200,
  "effect": "deny",
  "subjects": [{"type": "role", "value": "admin"}],
  "resources": [{"type": "page", "pattern": "*"}],
  "actions": ["edit", "delete"],
  "conditions": [
    {
      "type": "time-range",
      "startTime": "18:00",
      "endTime": "08:00"
    }
  ]
}
```

### 3. IP-Based Security

__Restrict sensitive content to internal network:__

```json
{
  "id": "internal-network-only",
  "name": "Internal Network Only",
  "priority": 150,
  "effect": "deny",
  "subjects": [{"type": "anonymous"}],
  "resources": [{"type": "category", "value": "Confidential"}],
  "actions": ["view"],
  "conditions": [
    {
      "type": "ip-range",
      "ranges": ["192.168.0.0/16", "10.0.0.0/8"]
    }
  ]
}
```

### 4. Department-Based Access

__Allow IT department full access to system pages:__

```json
{
  "id": "it-system-access",
  "name": "IT System Access",
  "priority": 100,
  "effect": "allow",
  "subjects": [
    {
      "type": "attribute",
      "key": "department",
      "value": "IT"
    }
  ],
  "resources": [{"type": "category", "value": "System"}],
  "actions": ["view", "edit", "delete", "admin"]
}
```

### 5. Emergency Access Override

__Allow emergency access during critical situations:__

```json
{
  "id": "emergency-access",
  "name": "Emergency Access Override",
  "priority": 1000,
  "effect": "allow",
  "subjects": [{"type": "role", "value": "emergency"}],
  "resources": [{"type": "page", "pattern": "*"}],
  "actions": ["view", "edit", "delete"],
  "conditions": [
    {
      "type": "context-attribute",
      "key": "emergencyMode",
      "value": true
    }
  ]
}
```

## Policy Priority and Conflicts

### Understanding Priority

- __Higher numbers = Higher priority__
- Policies are evaluated in priority order (highest first)
- Conflicting policies are resolved by priority
- Default priority is 50

### Conflict Resolution

When multiple policies apply to the same request:

1. __Same Effect__: All matching policies are considered
2. __Different Effects__: Highest priority policy wins
3. __Equal Priority__: First matching policy wins (deterministic but not recommended)

### Best Practices

- Use priority ranges:
  - 1-99: General policies
  - 100-499: Department/role specific
  - 500-899: Security policies
  - 900-999: Emergency/override policies
- Avoid equal priorities for conflicting policies
- Document priority schemes in your organization

## Managing Existing Policies

### Viewing Policies

- __Dashboard__: Overview of all policies with statistics
- __List View__: Detailed list with quick actions
- __JSON View__: Raw policy structure for advanced users

### Editing Policies

1. Click the "Edit" button next to any policy
2. Modify the policy structure
3. Save changes (validation runs automatically)
4. Review conflicts and warnings

### Deleting Policies

1. Click the "Delete" button
2. Confirm deletion
3. System validates no critical dependencies

### Policy Validation

The system automatically validates policies for:

- __Schema Compliance__: JSON structure correctness
- __Business Logic__: Duplicate entries, invalid combinations
- __Semantic Issues__: Logical inconsistencies
- __Conflicts__: Overlapping policies with different effects

## Monitoring and Auditing

### Policy Statistics

The dashboard shows:

- Total number of policies
- Allow vs Deny policy counts
- Average priority
- Cache performance metrics

### Audit Logs

Policy decisions are logged with:

- User information
- Resource accessed
- Action attempted
- Policy that granted/denied access
- Timestamp and context

### Performance Monitoring

Monitor:

- Policy evaluation times
- Cache hit rates
- Most frequently evaluated policies
- Policy conflicts and warnings

## Troubleshooting

### Common Issues

#### Policy Not Taking Effect

__Symptoms__: Expected access behavior not occurring

__Solutions__:

1. Check policy priority vs conflicting policies
2. Verify subject/resource/action matching
3. Review condition requirements
4. Check for syntax errors in JSON

#### Unexpected Access Denied

__Symptoms__: Users can't access resources they should

__Solutions__:

1. Look for higher-priority deny policies
2. Check condition evaluation
3. Verify user attributes/roles
4. Review audit logs for decision details

#### Performance Issues

__Symptoms__: Slow page loads, high CPU usage

__Solutions__:

1. Review cache hit rates
2. Optimize policy conditions
3. Reduce number of policies
4. Check for inefficient patterns

#### Validation Errors

__Symptoms__: Policies can't be saved due to validation errors

__Solutions__:

1. Review error messages carefully
2. Check JSON syntax
3. Verify required fields are present
4. Ensure values match expected formats

### Debug Tools

#### Policy Testing

Use the web interface to test policies:

1. Create test scenarios
2. Simulate user contexts
3. Verify expected outcomes

#### Audit Log Analysis

Review audit logs for:

- Policy decision patterns
- Common access issues
- Performance bottlenecks
- Security incidents

#### Cache Statistics

Monitor cache performance:

- Hit/miss ratios
- Cache size vs max size
- Evaluation times
- Memory usage

## Best Practices

### Policy Design

1. __Start Simple__: Begin with basic role-based policies
2. __Use Descriptive Names__: Clear, searchable policy names
3. __Document Everything__: Detailed descriptions and comments
4. __Test Thoroughly__: Validate policies in staging environment
5. __Plan for Growth__: Design for future requirements

### Security Considerations

1. __Defense in Depth__: Multiple layers of access control
2. __Least Privilege__: Grant minimum required access
3. __Regular Reviews__: Audit policies periodically
4. __Emergency Access__: Plan for override scenarios
5. __Monitoring__: Log and monitor all access decisions

### Performance Optimization

1. __Efficient Patterns__: Use specific patterns over wildcards
2. __Minimize Conditions__: Only add necessary conditions
3. __Cache-Friendly__: Design for cache effectiveness
4. __Regular Cleanup__: Remove obsolete policies

### Maintenance

1. __Version Control__: Track policy changes
2. __Backup Regularly__: Maintain policy backups
3. __Change Management__: Document policy modifications
4. __User Communication__: Notify users of policy changes

## Advanced Topics

### Custom Conditions

For complex requirements, you can implement custom condition types:

```javascript
// Example custom condition implementation
{
  "type": "custom",
  "name": "department-budget-check",
  "parameters": {
    "department": "IT",
    "budgetLimit": 50000
  }
}
```

### Policy Templates

Create reusable policy templates for common scenarios:

- __Read-Only Access__: Basic viewing permissions
- __Contributor Access__: View + edit permissions
- __Moderator Access__: Contributor + delete permissions
- __Admin Access__: Full permissions

### Integration with External Systems

The policy system can integrate with:

- LDAP/Active Directory for user attributes
- External authorization services
- Custom user attribute providers
- Third-party security systems

## Support and Resources

### Getting Help

1. __Documentation__: This guide and inline help
2. __Logs__: Check application logs for errors
3. __Audit Trail__: Review access decision logs
4. __Community__: Check for similar issues/solutions

### Configuration Files

Key configuration files:

- `config/app-default-config.json`: Policy storage (key: `ngdpbase.access.policies`)
- `config/policy-schemas.json`: Schema definitions
- ~~`config/access-policies.json`~~: __DEPRECATED__ - Policies now in app-default-config.json

### API Reference

Complete API documentation available at `/admin/policies/api-docs`

---

*This guide covers ngdpbase Policy-Based Access Control version 1.0. For the latest updates and additional features, check the official documentation.*
