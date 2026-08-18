# Policy Schema Documentation

## Overview

This document provides comprehensive documentation for the ngdpbase Policy-Based Access Control (PBAC) JSON schema. Understanding the schema structure is essential for creating effective policies and integrating with external systems.

## Schema Structure

### Core Policy Schema

Every policy must conform to the following JSON schema:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "Unique identifier for the policy",
      "pattern": "^[a-zA-Z0-9_-]+$"
    },
    "name": {
      "type": "string",
      "description": "Human-readable policy name",
      "minLength": 1,
      "maxLength": 100
    },
    "description": {
      "type": "string",
      "description": "Detailed description of the policy",
      "maxLength": 500
    },
    "priority": {
      "type": "integer",
      "description": "Policy priority (higher numbers override lower ones)",
      "minimum": 0,
      "maximum": 1000,
      "default": 50
    },
    "effect": {
      "type": "string",
      "enum": ["allow", "deny"],
      "description": "Whether the policy allows or denies access"
    },
    "subjects": {
      "type": "array",
      "description": "Who the policy applies to",
      "items": { "$ref": "#/definitions/subject" },
      "minItems": 1
    },
    "resources": {
      "type": "array",
      "description": "What resources the policy controls",
      "items": { "$ref": "#/definitions/resource" },
      "minItems": 1
    },
    "actions": {
      "type": "array",
      "description": "What operations are allowed/denied",
      "items": { "type": "string", "enum": ["view", "edit", "delete", "create", "upload", "download", "admin"] },
      "minItems": 1
    },
    "conditions": {
      "type": "array",
      "description": "Additional constraints on the policy",
      "items": { "$ref": "#/definitions/condition" }
    },
    "metadata": {
      "type": "object",
      "description": "Additional metadata for the policy",
      "properties": {
        "created": { "type": "string", "format": "date-time" },
        "modified": { "type": "string", "format": "date-time" },
        "author": { "type": "string" },
        "tags": { "type": "array", "items": { "type": "string" } }
      }
    }
  },
  "required": ["id", "name", "effect", "subjects", "resources", "actions"],
  "definitions": {
    "subject": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": ["user", "role", "group", "attribute", "authenticated", "anonymous", "admin"]
        },
        "value": { "type": "string" },
        "key": { "type": "string" }
      },
      "required": ["type"],
      "oneOf": [
        {
          "properties": { "type": { "enum": ["user", "role", "group"] } },
          "required": ["value"]
        },
        {
          "properties": { "type": { "enum": ["attribute"] } },
          "required": ["key", "value"]
        },
        {
          "properties": { "type": { "enum": ["authenticated", "anonymous", "admin"] } }
        }
      ]
    },
    "resource": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": ["page", "attachment", "category", "tag", "resource-type", "path"]
        },
        "value": { "type": "string" },
        "pattern": { "type": "string" }
      },
      "required": ["type"],
      "oneOf": [
        { "required": ["value"] },
        { "required": ["pattern"] }
      ]
    },
    "condition": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": ["time-range", "ip-range", "user-attribute", "context-attribute", "environment", "session-attribute"]
        }
      },
      "required": ["type"],
      "allOf": [
        {
          "if": { "properties": { "type": { "const": "time-range" } } },
          "then": {
            "properties": {
              "startTime": { "type": "string", "pattern": "^([01]?[0-9]|2[0-3]):[0-5][0-9]$" },
              "endTime": { "type": "string", "pattern": "^([01]?[0-9]|2[0-3]):[0-5][0-9]$" }
            },
            "required": ["startTime", "endTime"]
          }
        },
        {
          "if": { "properties": { "type": { "const": "ip-range" } } },
          "then": {
            "properties": {
              "ranges": {
                "type": "array",
                "items": { "type": "string", "format": "ipv4" }
              }
            },
            "required": ["ranges"]
          }
        },
        {
          "if": { "properties": { "type": { "const": "user-attribute" } } },
          "then": {
            "properties": {
              "key": { "type": "string" },
              "value": { "type": "string" },
              "operator": { "type": "string", "enum": ["equals", "contains", "startsWith", "endsWith"] }
            },
            "required": ["key", "value"]
          }
        }
      ]
    }
  }
}
```

## Subject Types

### User Subject

Targets a specific user by username:

```json
{
  "type": "user",
  "value": "john.doe"
}
```

__Use Cases:__

- Grant specific access to individual users
- Override general policies for specific users
- Temporary access for contractors

### Role Subject

Targets users with a specific role:

```json
{
  "type": "role",
  "value": "editor"
}
```

__Available Roles:__

- `admin`: System administrators
- `editor`: Content editors
- `viewer`: Read-only users
- `contributor`: Can create but limited editing
- Custom roles defined in your system

### Group Subject

Targets users belonging to a specific group:

```json
{
  "type": "group",
  "value": "marketing"
}
```

__Use Cases:__

- Department-based access control
- Project team permissions
- Organizational unit restrictions

### Attribute Subject

Targets users with specific attribute values:

```json
{
  "type": "attribute",
  "key": "department",
  "value": "IT"
}
```

__Common Attributes:__

- `department`: IT, HR, Marketing, Sales
- `clearance`: public, internal, confidential, secret
- `location`: office location or region
- `employment-type`: full-time, contractor, intern

### Authenticated Subject

Targets any logged-in user:

```json
{
  "type": "authenticated"
}
```

__Use Cases:__

- General authenticated user policies
- Override anonymous restrictions
- Base level for role-based policies

### Anonymous Subject

Targets non-logged-in users:

```json
{
  "type": "anonymous"
}
```

__Use Cases:__

- Public access policies
- Guest user permissions
- Default deny for sensitive content

### Admin Subject

Targets users with administrative privileges:

```json
{
  "type": "admin"
}
```

__Use Cases:__

- Administrative override policies
- System management access
- Emergency access controls

## Resource Types

### Page Resource

Controls access to wiki pages:

```json
{
  "type": "page",
  "pattern": "*"
}
```

__Pattern Examples:__

- `"*"`: All pages
- `"Admin*"`: Pages starting with "Admin"
- `"Project-*`: Project-related pages
- `"Home"`: Specific page

### Attachment Resource

Controls access to file attachments:

```json
{
  "type": "attachment",
  "pattern": "*.pdf"
}
```

__Pattern Examples:__

- `"*.pdf"`: PDF files only
- `"*.doc*"`: Word documents
- `"confidential-*"`: Files with specific naming
- `"*"`: All attachments

### Category Resource

Controls access to pages in specific categories:

```json
{
  "type": "category",
  "value": "System"
}
```

__Use Cases:__

- Category-based content organization
- Department-specific categories
- Security classification categories

### Tag Resource

Controls access to pages with specific tags:

```json
{
  "type": "tag",
  "value": "confidential"
}
```

__Use Cases:__

- Content classification by tags
- Security labeling
- Workflow state management

### Resource Type Resource

Controls access to specific resource types:

```json
{
  "type": "resource-type",
  "value": "page"
}
```

__Available Types:__

- `page`: Wiki pages
- `attachment`: File attachments
- `category`: Category pages
- `search`: Search functionality

### Path Resource

Controls access to URL paths:

```json
{
  "type": "path",
  "pattern": "/api/*"
}
```

__Pattern Examples:__

- `"/api/*"`: All API endpoints
- `"/admin/*"`: Admin interface
- `"/public/*"`: Public content
- `"/private/*"`: Private content

## Condition Types

### Time Range Condition

Restricts access to specific time periods:

```json
{
  "type": "time-range",
  "startTime": "09:00",
  "endTime": "17:00"
}
```

__Configuration:__

- `startTime`: Start time in HH:MM format (24-hour)
- `endTime`: End time in HH:MM format (24-hour)
- Supports cross-midnight ranges (e.g., 18:00 to 06:00)

### IP Range Condition

Restricts access based on IP addresses:

```json
{
  "type": "ip-range",
  "ranges": ["192.168.1.0/24", "10.0.0.0/8"]
}
```

__Configuration:__

- `ranges`: Array of IP ranges in CIDR notation
- Supports both IPv4 and IPv6
- Useful for office network restrictions

### User Attribute Condition

Checks user attributes for additional constraints:

```json
{
  "type": "user-attribute",
  "key": "department",
  "value": "IT",
  "operator": "equals"
}
```

__Operators:__

- `equals`: Exact match
- `contains`: String contains value
- `startsWith`: String starts with value
- `endsWith`: String ends with value

### Context Attribute Condition

Checks request context attributes:

```json
{
  "type": "context-attribute",
  "key": "emergencyMode",
  "value": true
}
```

__Common Context Attributes:__

- `emergencyMode`: Emergency access flag
- `maintenanceMode`: System maintenance flag
- `userAgent`: Browser/client information
- `referrer`: Referring page

### Environment Condition

Checks system environment:

```json
{
  "type": "environment",
  "key": "NODE_ENV",
  "value": "production"
}
```

__Use Cases:__

- Development vs production policies
- Staging environment restrictions
- Environment-specific access rules

### Session Attribute Condition

Checks user session attributes:

```json
{
  "type": "session-attribute",
  "key": "loginMethod",
  "value": "sso"
}
```

__Common Session Attributes:__

- `loginMethod`: Authentication method used
- `sessionAge`: How long session has been active
- `deviceType`: Mobile, desktop, tablet
- `geoLocation`: Geographic location

## Complete Policy Examples

### 1. Basic Role-Based Access

```json
{
  "id": "editor-basic-access",
  "name": "Editor Basic Access",
  "description": "Allows editors to view and edit all pages",
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
  "actions": ["view", "edit"],
  "metadata": {
    "created": "2024-01-15T10:00:00Z",
    "author": "admin",
    "tags": ["basic", "editor"]
  }
}
```

### 2. Time-Restricted Access

```json
{
  "id": "business-hours-edit",
  "name": "Business Hours Edit Access",
  "description": "Allows editing only during business hours",
  "priority": 200,
  "effect": "allow",
  "subjects": [
    {
      "type": "authenticated"
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

### 3. IP-Based Security

```json
{
  "id": "office-network-only",
  "name": "Office Network Only",
  "description": "Restricts confidential content to office network",
  "priority": 300,
  "effect": "deny",
  "subjects": [
    {
      "type": "anonymous"
    }
  ],
  "resources": [
    {
      "type": "category",
      "value": "Confidential"
    }
  ],
  "actions": ["view"],
  "conditions": [
    {
      "type": "ip-range",
      "ranges": ["192.168.0.0/16", "10.0.0.0/8"]
    }
  ]
}
```

### 4. Multi-Attribute Policy

```json
{
  "id": "senior-developer-full-access",
  "name": "Senior Developer Full Access",
  "description": "Full access for senior developers in IT department",
  "priority": 250,
  "effect": "allow",
  "subjects": [
    {
      "type": "attribute",
      "key": "department",
      "value": "IT"
    },
    {
      "type": "attribute",
      "key": "level",
      "value": "senior"
    }
  ],
  "resources": [
    {
      "type": "page",
      "pattern": "*"
    },
    {
      "type": "attachment",
      "pattern": "*"
    }
  ],
  "actions": ["view", "edit", "delete", "create", "upload", "download"],
  "conditions": [
    {
      "type": "user-attribute",
      "key": "clearance",
      "value": "confidential",
      "operator": "equals"
    }
  ]
}
```

### 5. Emergency Access Override

```json
{
  "id": "emergency-admin-override",
  "name": "Emergency Admin Override",
  "description": "Emergency access for administrators during critical situations",
  "priority": 1000,
  "effect": "allow",
  "subjects": [
    {
      "type": "admin"
    }
  ],
  "resources": [
    {
      "type": "page",
      "pattern": "*"
    },
    {
      "type": "attachment",
      "pattern": "*"
    }
  ],
  "actions": ["view", "edit", "delete", "create", "upload", "download", "admin"],
  "conditions": [
    {
      "type": "context-attribute",
      "key": "emergencyMode",
      "value": true
    }
  ],
  "metadata": {
    "tags": ["emergency", "override", "critical"]
  }
}
```

## Best Practices

### Policy Design Principles

1. __Principle of Least Privilege__
   - Grant only necessary permissions
   - Use deny policies for exceptions
   - Regularly review and revoke unnecessary access

2. __Clear Naming Conventions__
   - Use descriptive, searchable names
   - Include context in policy names
   - Use consistent naming patterns

3. __Priority Management__
   - Reserve high priorities (900-1000) for emergencies
   - Use ranges for different policy types
   - Document priority schemes

4. __Modular Policy Design__
   - Create focused, single-purpose policies
   - Avoid overly complex policies
   - Use conditions for additional constraints

### Schema Compliance

1. __Validation__
   - Always validate policies against the schema
   - Use schema validation tools during development
   - Test policies in staging before production

2. __Version Control__
   - Track policy changes in version control
   - Include policies in deployment processes
   - Maintain audit trails for policy modifications

3. __Documentation__
   - Document the purpose of each policy
   - Include examples and use cases
   - Maintain policy catalogs

### Performance Considerations

1. __Efficient Patterns__
   - Use specific patterns over wildcards when possible
   - Minimize the number of conditions
   - Cache frequently evaluated policies

2. __Resource Optimization__
   - Group similar policies
   - Use appropriate priority levels
   - Monitor policy evaluation performance

## Integration Examples

### Programmatic Policy Creation

```javascript
const newPolicy = {
  id: 'api-access-' + Date.now(),
  name: 'API Access Policy',
  description: 'Generated policy for API access',
  priority: 150,
  effect: 'allow',
  subjects: [{
    type: 'role',
    value: 'api-user'
  }],
  resources: [{
    type: 'path',
    pattern: '/api/v1/*'
  }],
  actions: ['view'],
  metadata: {
    created: new Date().toISOString(),
    author: 'system'
  }
};
```

### Bulk Policy Import

```javascript
const policies = [
  // Array of policy objects
];

policies.forEach(policy => {
  // Validate against schema
  const isValid = validatePolicy(policy);
  if (isValid) {
    // Import policy
    policyManager.createPolicy(policy);
  }
});
```

### Policy Templates

```javascript
const policyTemplates = {
  'read-only': {
    actions: ['view'],
    priority: 50
  },
  'contributor': {
    actions: ['view', 'edit', 'create'],
    priority: 100
  },
  'admin': {
    actions: ['view', 'edit', 'delete', 'create', 'upload', 'download', 'admin'],
    priority: 500
  }
};
```

## Troubleshooting

### Common Schema Errors

1. __Missing Required Fields__
   - Ensure `id`, `name`, `effect`, `subjects`, `resources`, `actions` are present
   - Check for typos in field names

2. __Invalid Subject Configuration__
   - User/role/group subjects need `value`
   - Attribute subjects need both `key` and `value`
   - Authenticated/anonymous/admin subjects need no additional fields

3. __Resource Pattern Issues__
   - Use either `value` or `pattern`, not both
   - Ensure patterns are valid glob patterns
   - Check for special character escaping

4. __Condition Validation__
   - Time ranges must be in HH:MM format
   - IP ranges must be valid CIDR notation
   - Attribute conditions need proper operators

### Validation Tools

Use these tools to validate your policies:

```bash
# JSON Schema validation
npm install -g ajv-cli
ajv validate -s policy-schema.json -d my-policy.json

# Online validators
# - JSON Schema Validator (https://www.jsonschemavalidator.net/)
# - JSONLint with schema support
```

### Debugging Tips

1. __Start Simple__: Create basic policies first
2. __Test Incrementally__: Add complexity gradually
3. __Use Logging__: Enable policy evaluation logging
4. __Monitor Performance__: Watch for slow policy evaluations

---

*This schema documentation covers ngdpbase Policy-Based Access Control version 1.0. For the latest schema updates and additional examples, check the official documentation.*
