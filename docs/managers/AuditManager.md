---
name: AuditManager
description: "Audit trail logging: security events, access decisions, policy evaluations, with pluggable Audit*Provider backends"
dateModified: '2026-05-14'
category: managers
code: src/managers/AuditManager.ts
---

# AuditManager

## Overview

The `AuditManager` is responsible for audit trail logging and compliance monitoring in ngdpbase. It provides a centralized system for tracking security events, access decisions, policy evaluations, and user actions. The AuditManager uses a __provider pattern__ to support multiple audit storage backends, making it flexible for different deployment scenarios from single-instance development to enterprise cloud deployments.

What auditing actually implements — the hash chain, the event registry, critical-event durability, the off-box witness, and how to verify a log — is inventoried in [Audit posture](../audit-posture.md). This page is the manager API.

__Key Features:__

- __Pluggable Storage Backends:__ File-based, database, cloud logging services
- __Comprehensive Event Tracking:__ Security events, access decisions, policy evaluations
- __Search and Export:__ Query audit logs with filters, export to JSON/CSV
- __Retention Management:__ Automatic cleanup based on retention policies
- __Health Monitoring:__ Provider health checks with automatic failover
- __Severity Levels:__ Low, medium, high, critical event classification
- __Compliance Ready:__ Structured logging suitable for SOC2, GDPR, HIPAA

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                        AuditManager                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Public API                                          │  │
│  │  - logAuditEvent()                                   │  │
│  │  - searchAuditLogs()                                 │  │
│  │  - getAuditStats()                                   │  │
│  │  - exportAuditLogs()                                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                 │
│                           ▼                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Provider Management                                 │  │
│  │  - Provider Loading & Normalization                  │  │
│  │  - Health Check & Failover                          │  │
│  │  - Configuration Integration                         │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ FileAuditProvider│ │DatabaseAuditProv│ │CloudAuditProvider│
│                  │ │                  │ │                  │
│ - JSON Lines     │ │ - PostgreSQL     │ │ - CloudWatch     │
│ - Local Files    │ │ - MySQL          │ │ - Azure Monitor  │
│ - Log Rotation   │ │ - MongoDB        │ │ - GCP Logging    │
└──────────────────┘ └──────────────────┘ └──────────────────┘
         │                   │                   │
         ▼                   ▼                   ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  Local Disk      │ │    Database      │ │  Cloud Service   │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

### Provider Pattern

The AuditManager implements a provider pattern that separates the audit management logic from the storage implementation:

1. __BaseAuditProvider:__ Abstract interface defining the contract for all audit providers
2. __Concrete Providers:__ Implementations for specific storage backends
3. __Provider Discovery:__ Dynamic loading based on configuration
4. __Health Monitoring:__ Automatic failover to NullAuditProvider if primary provider fails
5. __Consistent API:__ All providers implement the same interface

## Configuration

### Core Audit Settings

All configuration keys use __lowercase__ format per Issue #102 refactoring.

```json
{
  "_comment_audit_storage": "Audit trail storage configuration (ALL LOWERCASE)",
  "ngdpbase.audit.enabled": true,
  "ngdpbase.audit.provider.default": "fileauditprovider",
  "ngdpbase.audit.provider": "fileauditprovider",
  "ngdpbase.audit.loglevel": "info",
  "ngdpbase.audit.maxqueuesize": 1000,
  "ngdpbase.audit.flushinterval": 30000,
  "ngdpbase.audit.retentiondays": 90
}
```

### Configuration Reference

| Configuration Key |Type |Default |Description |
| ------------------ | ------ | --------- |
| `ngdpbase.audit.enabled` |boolean |`true` |Enable/disable audit logging |
| `ngdpbase.audit.provider.default` |string |`"fileauditprovider"` |Fallback provider if primary fails |
| `ngdpbase.audit.provider` |string |`"fileauditprovider"` |Active audit provider |
| `ngdpbase.audit.loglevel` |string |`"info"` |Minimum log level (debug, info, warn, error) |
| `ngdpbase.audit.maxqueuesize` |number |`1000` |Maximum events in memory before flush |
| `ngdpbase.audit.flushinterval` |number |`30000` |Flush interval in milliseconds |
| `ngdpbase.audit.retentiondays` |number |`90` |Days to retain audit logs |

### Provider-Specific Configuration

#### FileAuditProvider

```json
{
  "ngdpbase.audit.provider.file.logdirectory": "./logs",
  "ngdpbase.audit.provider.file.auditfilename": "audit.log",
  "ngdpbase.audit.provider.file.archivefilename": "audit-archive.log",
  "ngdpbase.audit.provider.file.maxfilesize": "10MB",
  "ngdpbase.audit.provider.file.maxfiles": 10
}
```

| Configuration Key |Type |Default |Description |
| ---- | ----- | ----- | ----- | -----
| `ngdpbase.audit.provider.file.logdirectory` |string |`"./logs"` |Directory for audit log files |
| `ngdpbase.audit.provider.file.auditfilename` |string |`"audit.log"` |Main audit log filename |
| `ngdpbase.audit.provider.file.archivefilename` |string |`"audit-archive.log"` |Archive log filename |
| `ngdpbase.audit.provider.file.maxfilesize` |string |`"10MB"` |Maximum file size before rotation |
| `ngdpbase.audit.provider.file.maxfiles` |number |`10` |Maximum archived files to keep |

#### DatabaseAuditProvider (Future)

```json
{
  "ngdpbase.audit.provider.database.type": "postgresql",
  "ngdpbase.audit.provider.database.connectionstring": "",
  "ngdpbase.audit.provider.database.tablename": "audit_logs",
  "ngdpbase.audit.provider.database.maxconnections": 10
}
```

#### CloudAuditProvider (Future)

```json
{
  "ngdpbase.audit.provider.cloud.service": "cloudwatch",
  "ngdpbase.audit.provider.cloud.region": "us-east-1",
  "ngdpbase.audit.provider.cloud.loggroup": "/ngdpbase/audit",
  "ngdpbase.audit.provider.cloud.logstream": "audit-events"
}
```

## Provider System

### Available Providers

| Provider | Status | Use Case | Features |
| ----- | ----- | ----- | ----- |
| __FileAuditProvider__ | ✅ Production | Single-instance, development | Local files, rotation, search |
| __NullAuditProvider__ | ✅ Production | Disabled auditing, testing | No-op operations |
| __DatabaseAuditProvider__ | 🚧 Planned | Enterprise, high-volume | SQL/NoSQL, scalable, queryable |
| __CloudAuditProvider__ | 🚧 Planned | Cloud deployments | CloudWatch, Azure, GCP |

### Provider Selection Logic

```javascript
// 1. Check if auditing is enabled
const auditEnabled = config.get('ngdpbase.audit.enabled', true);
if (!auditEnabled) {
  // Use NullAuditProvider
  return;
}

// 2. Get provider from config with fallback
const defaultProvider = config.get('ngdpbase.audit.provider.default', 'fileauditprovider');
const providerName = config.get('ngdpbase.audit.provider', defaultProvider);

// 3. Normalize provider name (lowercase -> PascalCase)
const providerClass = normalizeProviderName(providerName);
// 'fileauditprovider' -> 'FileAuditProvider'

// 4. Load and initialize provider
const provider = require(`./providers/${providerClass}`);
await provider.initialize();

// 5. Health check with failover
if (!await provider.isHealthy()) {
  logger.warn('Primary provider unhealthy, falling back to NullAuditProvider');
  // Fallback to NullAuditProvider
}
```

### Creating a Custom Provider

To create a custom audit provider:

1. __Extend BaseAuditProvider:__

```javascript
const BaseAuditProvider = require('./BaseAuditProvider');

class CustomAuditProvider extends BaseAuditProvider {
  constructor(engine) {
    super(engine);
    this.client = null;
  }

  async initialize() {
    // Load configuration
    const configManager = this.engine.getManager('ConfigurationManager');
    const customConfig = configManager.getProperty('ngdpbase.audit.provider.custom.endpoint');

    // Initialize your storage backend
    this.client = new CustomClient(customConfig);
    await this.client.connect();

    this.initialized = true;
  }

  getProviderInfo() {
    return {
      name: 'CustomAuditProvider',
      version: '1.0.0',
      description: 'Custom audit provider',
      features: ['search', 'export', 'retention']
    };
  }

  async logAuditEvent(auditEvent) {
    // Implement event logging
    const eventId = await this.client.store(auditEvent);
    return eventId;
  }

  async searchAuditLogs(filters = {}, options = {}) {
    // Implement search with filters
    const results = await this.client.query(filters, options);
    return {
      results: results.events,
      total: results.count,
      limit: options.limit ||  100,
      offset: options.offset ||  0,
      hasMore: results.hasMore
    };
  }

  async getAuditStats(filters = {}) {
    // Implement statistics aggregation
    return await this.client.stats(filters);
  }

  async exportAuditLogs(filters = {}, format = 'json') {
    // Implement export functionality
    const logs = await this.searchAuditLogs(filters, { limit: 10000 });
    if (format === 'csv') {
      return this.convertToCSV(logs.results);
    }
    return JSON.stringify(logs.results, null, 2);
  }

  async flush() {
    // Implement batch flush if needed
  }

  async cleanup() {
    // Implement retention cleanup
  }

  async isHealthy() {
    try {
      await this.client.ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  async close() {
    if (this.client) {
      await this.client.disconnect();
    }
    this.initialized = false;
  }
}

module.exports = CustomAuditProvider;
```

#### Add Configuration

```json
{
  "ngdpbase.audit.provider": "customauditprovider",
  "ngdpbase.audit.provider.custom.endpoint": "https://audit.example.com",
  "ngdpbase.audit.provider.custom.apikey": "your-api-key"
}
```

#### Register Provider

Place your provider file in `src/providers/CustomAuditProvider.js`. The AuditManager will automatically discover and load it based on the configuration.

## Usage Examples

### Basic Audit Logging

```javascript
const auditManager = engine.getManager('AuditManager');

// Log a page edit
await auditManager.logAuditEvent({
  eventType: 'page.edit',
  user: 'john.doe',
  userId: 'user-123',
  sessionId: 'session-456',
  ipAddress: '192.168.1.100',
  resource: '/view/HomePage',
  resourceType: 'page',
  action: 'read',
  result: 'allow',
  severity: 'low',
  metadata: {
    pageId: 'page-789',
    version: 5
  }
});

// Log an access denied event
await auditManager.logAuditEvent({
  eventType: 'authorization.deny',
  user: 'jane.smith',
  resource: '/view/PrivatePage',
  action: 'edit',
  result: 'deny',
  reason: 'Insufficient permissions',
  policyId: 'policy-admin-only',
  policyName: 'Admin Only Edit',
  severity: 'medium',
  context: {
    requiredRole: 'admin',
    userRole: 'viewer'
  }
});

// Log a security incident
await auditManager.logAuditEvent({
  eventType: 'security.event',   // the specific kind goes in metadata.securityEventType
  user: 'attacker',
  ipAddress: '192.168.1.200',
  resource: '/admin/users',
  action: 'access',
  result: 'deny',
  reason: 'SQL injection attempt detected',
  severity: 'critical',
  metadata: {
    attackVector: 'sql_injection',
    payload: "' OR '1'='1"
  }
});
```

### Searching Audit Logs

```javascript
// Search by user
const userLogs = await auditManager.searchAuditLogs({
  user: 'john.doe',
  limit: 50,
  sortOrder: 'desc'
});

console.log(`Found ${userLogs.total} events for user john.doe`);
console.log('Recent events:', userLogs.results);

// Search by event type
const authFailures = await auditManager.searchAuditLogs({
  eventType: 'authentication.failed',
  severity: 'high',
  startDate: '2025-01-01',
  endDate: '2025-01-31'
});

// Search denied access attempts
const deniedAccess = await auditManager.searchAuditLogs({
  result: 'deny',
  resource: '/view/PrivatePage',
  limit: 100
});

// Complex search with multiple filters
const complexSearch = await auditManager.searchAuditLogs({
  eventType: 'page.edit',
  result: 'allow',
  severity: 'medium',
  startDate: '2025-01-01',
  limit: 200,
  offset: 0,
  sortBy: 'timestamp',
  sortOrder: 'desc'
});
```

### Getting Statistics

```javascript
// Get overall statistics
const stats = await auditManager.getAuditStats();

console.log('Total Events:', stats.totalEvents);
console.log('Events by Type:', stats.eventsByType);
console.log('Events by Result:', stats.eventsByResult);
console.log('Events by Severity:', stats.eventsBySeverity);
console.log('Security Incidents:', stats.securityIncidents);

// Get filtered statistics
const userStats = await auditManager.getAuditStats({
  user: 'john.doe',
  startDate: '2025-01-01'
});

// Get security statistics
const securityStats = await auditManager.getAuditStats({
  severity: 'high',
  result: 'deny'
});
```

### Exporting Audit Logs

```javascript
// Export to JSON
const jsonExport = await auditManager.exportAuditLogs({
  startDate: '2025-01-01',
  endDate: '2025-01-31'
}, 'json');

await fs.writeFile('./exports/audit-january.json', jsonExport);

// Export to CSV
const csvExport = await auditManager.exportAuditLogs({
  eventType: 'page.edit',
  result: 'allow'
}, 'csv');

await fs.writeFile('./exports/page-edits.csv', csvExport);

// Export security incidents
const securityExport = await auditManager.exportAuditLogs({
  severity: ['high', 'critical'],
  startDate: '2025-01-01'
}, 'json');
```

### Provider Information

```javascript
// Get current provider info
const providerInfo = auditManager.getProviderInfo();

console.log('Provider:', providerInfo.name);
console.log('Version:', providerInfo.version);
console.log('Description:', providerInfo.description);
console.log('Features:', providerInfo.features);

// Check provider health
const isHealthy = await auditManager.isHealthy();
if (!isHealthy) {
  console.error('Audit provider is not healthy!');
}
```

## Audit Event Structure

### Event Types

The vocabulary is `{target}.{action}`, mirroring the permission registry's
`{target}-{action}`. Dotted, so a prefix means something: `page.` is everything
that happened to pages, `token.` is everything a credential did.

__This table is generated from `src/utils/auditVocabulary.ts` and checked against
it by `auditVocabulary.test.ts`.__ Editing one without the other fails CI. Before
that check existed, 14 of the 19 types listed here were emitted by nothing and
twelve emitted types were listed nowhere (#1115).

| Event Type | Description | Typical Severity |
| ----- | ----- | ----- |
| `page.create` | Page created | low |
| `page.edit` | Page edited | low |
| `page.rename` | Page renamed | low |
| `page.delete` | Page deleted | medium |
| `page.view` | Page viewed — emitted only when `ngdpbase.audit.read-events` is on (#1129) | low |
| `page.link-rewrite` | Inbound links rewritten after a rename | low |
| `attachment.upload` | File uploaded | low |
| `attachment.delete` | File deleted | medium |
| `token.mint` | Agent token minted | medium |
| `token.revoke` | Agent token revoked | medium |
| `authentication.success` | Sign-in succeeded | low |
| `authentication.failed` | Sign-in failed | medium |
| `authentication.logout` | User signed out | low |
| `authorization.deny` | Access denied | medium |
| `authorization.allow` | Access granted | low |
| `policy.evaluate` | Security policy evaluated | low |
| `security.event` | Security violation detected | high |
| `system.start` | Instance started — reports whether the previous run ended cleanly | low |
| `system.shutdown` | Instance shut down cleanly | low |
| `config.change` | Configuration changed by an administrator | medium |
| `manager.state-change` | A manager changed state — degraded, disabled, failed or recovered | medium |
| `posture.recorded` | Security posture at startup, compared against the previous start | medium |
| `job.started` | A background job started, and who asked for it | low |
| `job.completed` | A background job finished successfully | low |
| `job.failed` | A background job failed | medium |
| `share.create` | Share link created | medium |
| `share.access` | Share link used | low |
| `share.revoke` | Share link revoked | medium |
| `admin.page.raw-edit` | Page edited through the admin raw editor | medium |
| `admin.sessions.revoke` | Session revoked by an admin | medium |
| `admin.sessions.clear-anonymous` | Anonymous sessions cleared | low |
| `audit.chain-restart` | Hash chain restarted, with the reason | high |

#### Retired names

Six bare snake_case names were retired in the #1115 rename. Records already on
disk keep the name they were written with, so `AuditManager.searchAuditLogs()`
maps them forward on read and history stays filterable under the new
vocabulary — a filter for `security.event` returns the pre-cutover
`security_event` rows too.

| Retired | Maps to |
| ----- | ----- |
| `access_decision` | `authorization.deny` or `authorization.allow`, by `result` |
| `authentication` | `authentication.failed` / `.logout` / `.success`, by `result` |
| `policy_evaluation` | `policy.evaluate` |
| `security_event` | `security.event` |
| `share_access` | `share.access` |
| `share_create` | `share.create` |
| `share_revoke` | `share.revoke` |

Two of those mappings are result-aware on purpose. A legacy `authentication`
row is a success, a failure or a logout depending on its `result`, and
flattening all three to one name would lose exactly the distinction an operator
is filtering for.

#### What is deliberately not recorded

`authorization.allow` has an emitter but nothing reaches it: `ACLManager`
records denials only. An allow fires on every page view, which is the
read-volume `auditRegistry` exempts `page-read` for and that #334 was filed
about. A denial is rare and is the half a security assessment asks about.

`page.view` is in the vocabulary but gated (#1129): the emitter exists
unconditionally, and `ngdpbase.audit.read-events` decides at runtime whether it
fires. Off — the default — a wiki does not drown its log in reads; on, a
PHR-style deployment gets access accounting, recorded at the moment view access
is granted. The same mechanism (`gatedBy` in `auditRegistry.ts`) is the intended
path for the remaining read-volume exemptions when their turn comes.

### Result Values

- `allow` - Operation was permitted
- `deny` - Operation was denied
- `error` - Operation failed due to error
- `success` - Operation completed successfully
- `failure` - Operation failed

### Severity Levels

- `low` - Normal operations, informational
- `medium` - Important events, access denials
- `high` - Security concerns, administrative actions
- `critical` - Security breaches, system compromises

### Complete Event Structure

```javascript
{
  id: 'uuid-string',                    // Auto-generated UUID
  timestamp: '2025-01-15T10:30:00.000Z', // ISO 8601 timestamp
  level: 'info',                         // Log level (debug, info, warn, error)
  eventType: 'page.edit',                // Type of event (see Event Types)
  user: 'john.doe',                      // Username or identifier
  userId: 'user-123',                    // Internal user ID
  sessionId: 'session-456',              // Session identifier
  ipAddress: '192.168.1.100',            // Client IP address
  userAgent: 'Mozilla/5.0...',           // Client user agent
  resource: '/view/HomePage',            // Resource being accessed
  resourceType: 'page',                  // Type of resource
  action: 'edit',                        // Action performed
  result: 'allow',                       // Result (allow, deny, error)
  reason: 'User has edit permission',    // Human-readable reason
  policyId: 'policy-editor',             // Policy ID that made decision
  policyName: 'Editor Access',           // Human-readable policy name
  context: {                             // Additional context
    requiredRole: 'editor',
    userRole: 'editor'
  },
  metadata: {                            // Event-specific metadata
    pageId: 'page-789',
    version: 5,
    changes: ['title', 'content']
  },
  duration: 150,                         // Operation duration in ms
  severity: 'low'                        // Severity level
}
```

## API Reference

### AuditManager Methods

#### initialize(config)

Initialize the AuditManager with provider configuration.

```javascript
await auditManager.initialize(config);
```

__Parameters:__

- `config` (Object): Configuration object (optional, uses ConfigurationManager if not provided)

__Returns:__ `Promise<void>`

#### logAuditEvent(auditEvent)

Log an audit event to the configured provider.

```javascript
const eventId = await auditManager.logAuditEvent({
  eventType: 'page.edit',
  user: 'john.doe',
  resource: '/view/HomePage',
  action: 'read',
  result: 'allow',
  severity: 'low'
});
```

__Parameters:__

- `auditEvent` (Object): Audit event data (see Event Structure)

__Returns:__ `Promise<string>` - Event ID

#### searchAuditLogs(filters, options)

Search audit logs with filters and options.

```javascript
const results = await auditManager.searchAuditLogs(
  { user: 'john.doe', eventType: 'page.edit' },
  { limit: 50, sortOrder: 'desc' }
);
```

__Parameters:__

- `filters` (Object): Search filters
  - `user` (string): Filter by username
  - `eventType` (string): Filter by event type
  - `result` (string): Filter by result (allow, deny, error)
  - `severity` (string): Filter by severity
  - `resource` (string): Filter by resource
  - `action` (string): Filter by action
  - `startDate` (string): Filter by start date (ISO 8601)
  - `endDate` (string): Filter by end date (ISO 8601)
- `options` (Object): Search options
  - `limit` (number): Maximum results (default: 100)
  - `offset` (number): Result offset (default: 0)
  - `sortBy` (string): Sort field (default: 'timestamp')
  - `sortOrder` (string): Sort order 'asc' or 'desc' (default: 'desc')

__Returns:__ `Promise<Object>`

```javascript
{
  results: Array<AuditEvent>,  // Array of audit events
  total: number,               // Total matching events
  limit: number,               // Requested limit
  offset: number,              // Requested offset
  hasMore: boolean             // More results available
}
```

#### getAuditStats(filters)

Get aggregated statistics for audit logs.

```javascript
const stats = await auditManager.getAuditStats({ severity: 'high' });
```

__Parameters:__

- `filters` (Object): Optional filters (same as searchAuditLogs)

__Returns:__ `Promise<Object>`

```javascript
{
  totalEvents: number,                    // Total event count
  eventsByType: { [type]: count },        // Events grouped by type
  eventsByResult: { [result]: count },    // Events grouped by result
  eventsBySeverity: { [severity]: count }, // Events grouped by severity
  eventsByUser: { [user]: count },        // Events grouped by user
  recentActivity: Array<AuditEvent>,      // Last 10 events
  securityIncidents: number               // High/critical severity count
}
```

#### exportAuditLogs(filters, format)

Export audit logs in JSON or CSV format.

```javascript
const csvData = await auditManager.exportAuditLogs(
  { startDate: '2025-01-01' },
  'csv'
);
```

__Parameters:__

- `filters` (Object): Export filters (same as searchAuditLogs)
- `format` (string): Export format ('json' or 'csv', default: 'json')

__Returns:__ `Promise<string>` - Exported data as string

#### flush()

Flush pending audit events to storage immediately.

```javascript
await auditManager.flush();
```

__Returns:__ `Promise<void>`

#### isHealthy()

Check if the audit provider is healthy and operational.

```javascript
const healthy = await auditManager.isHealthy();
```

__Returns:__ `Promise<boolean>`

#### getProviderInfo()

Get information about the current audit provider.

```javascript
const info = auditManager.getProviderInfo();
```

__Returns:__ `Object`

```javascript
{
  name: string,         // Provider name
  version: string,      // Provider version
  description: string,  // Human-readable description
  features: Array       // Supported features
}
```

#### close()

Close the audit manager and cleanup resources.

```javascript
await auditManager.close();
```

__Returns:__ `Promise<void>`

## Integration with Other Managers

### AuthorizationManager Integration

```javascript
// In AuthorizationManager
class AuthorizationManager {
  async checkPermission(user, resource, action) {
    const auditManager = this.engine.getManager('AuditManager');

    const decision = await this.evaluatePolicy(user, resource, action);

    // Log the authorization decision
    await auditManager.logAuditEvent({
      eventType: decision.allow ? 'authorization.allow' : 'authorization.deny',
      user: user.username,
      userId: user.id,
      resource: resource,
      action: action,
      result: decision.allow ? 'allow' : 'deny',
      reason: decision.reason,
      policyId: decision.policyId,
      policyName: decision.policyName,
      severity: decision.allow ? 'low' : 'medium',
      context: {
        userRoles: user.roles,
        requiredPermission: action
      }
    });

    return decision;
  }
}
```

### PageManager Integration

```javascript
// In PageManager
class PageManager {
  async savePage(pageId, content, user) {
    const auditManager = this.engine.getManager('AuditManager');
    const startTime = Date.now();

    try {
      await this.storage.save(pageId, content);
      const duration = Date.now() - startTime;

      // Log successful page save
      await auditManager.logAuditEvent({
        eventType: 'page.edit',
        user: user.username,
        resource: `/view/${pageId}`,
        resourceType: 'page',
        action: 'edit',
        result: 'success',
        severity: 'low',
        duration: duration,
        metadata: {
          pageId: pageId,
          contentLength: content.length
        }
      });

      return true;
    } catch (error) {
      // Log failed page save
      await auditManager.logAuditEvent({
        eventType: 'page.edit',
        user: user.username,
        resource: `/view/${pageId}`,
        action: 'edit',
        result: 'error',
        reason: error.message,
        severity: 'medium',
        metadata: { error: error.message }
      });

      throw error;
    }
  }
}
```

### AttachmentManager Integration

```javascript
// In AttachmentManager
class AttachmentManager {
  async uploadAttachment(file, user, sessionId, ipAddress) {
    const auditManager = this.engine.getManager('AuditManager');

    // Log attachment upload
    await auditManager.logAuditEvent({
      eventType: 'attachment.upload',
      user: user.username,
      userId: user.id,
      sessionId: sessionId,
      ipAddress: ipAddress,
      resource: `/attachments/${file.name}`,
      resourceType: 'attachment',
      action: 'upload',
      result: 'success',
      severity: 'low',
      metadata: {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type
      }
    });

    return await this.storage.save(file);
  }
}
```

## Best Practices

### 1. Event Granularity

__✅ Do:__

- Log security-relevant events (authentication, authorization, access)
- Log administrative actions (user creation, config changes)
- Log data modifications (create, update, delete)

__❌ Don't:__

- Log every single page view in production (can overwhelm storage)
- Log sensitive data (passwords, tokens, personal info)
- Log non-deterministic data that changes on every run

### 2. Severity Classification

```javascript
// Critical: Security breaches, system compromises
severity: 'critical'  // SQL injection, unauthorized admin access

// High: Administrative actions, user deletion
severity: 'high'      // User account deletion, config changes

// Medium: Access denials, failed authentication
severity: 'medium'    // Login failures, permission denials

// Low: Normal operations, successful access
severity: 'low'       // Page views, successful authentication
```

### 3. Context and Metadata

__Good Event:__

```javascript
{
  eventType: 'authorization.deny',
  user: 'john.doe',
  resource: '/view/PrivatePage',
  action: 'edit',
  result: 'deny',
  reason: 'User lacks required role: admin',
  policyId: 'policy-admin-only',
  policyName: 'Admin Only Edit',
  severity: 'medium',
  context: {
    userRoles: ['viewer', 'editor'],
    requiredRole: 'admin',
    policyType: 'role-based'
  },
  metadata: {
    pageId: 'page-789',
    pageOwner: 'admin-user'
  }
}
```

__Poor Event:__

```javascript
{
  eventType: 'deny',
  user: 'john.doe',
  result: 'deny'
  // Missing: reason, context, severity, resource details
}
```

### 4. Performance Considerations

```javascript
// Use async logging - don't block operations
await auditManager.logAuditEvent(event);  // Non-blocking

// Batch flush for high-volume scenarios
// FileAuditProvider queues events and flushes periodically

// Use appropriate retention policies
"ngdpbase.audit.retentiondays": 90  // Balance compliance vs storage

// Consider provider scalability
// FileAuditProvider: Single instance, moderate volume
// DatabaseAuditProvider: Multi-instance, high volume
// CloudAuditProvider: Enterprise scale, distributed
```

### 5. Compliance and Privacy

```javascript
// DO include:
{
  user: 'john.doe',           // Username (not email)
  userId: 'user-123',         // Internal ID
  ipAddress: '192.168.1.100', // IP address (may need anonymization)
  resource: '/view/PageName',
  action: 'edit'
}

// DON'T include:
{
  password: 'secret123',      // Never log passwords
  token: 'jwt-token',         // Never log auth tokens
  ssn: '123-45-6789',         // Never log PII
  creditCard: '4111...',      // Never log payment info
}

// Consider GDPR/privacy:
// - Anonymize IP addresses after retention period
// - Provide user data export mechanism
// - Implement user data deletion (right to be forgotten)
```

### 6. Error Handling

```javascript
// Always wrap audit calls in try-catch
try {
  await auditManager.logAuditEvent(event);
} catch (error) {
  // Audit logging should never break app functionality
  logger.error('Failed to log audit event:', error);
  // Continue with application logic
}

// Provider health checks with failover
if (!await auditManager.isHealthy()) {
  logger.warn('Audit provider unhealthy, using fallback');
  // AuditManager automatically falls back to NullAuditProvider
}
```

## Troubleshooting

### Common Issues

#### 1. Audit Events Not Being Logged

__Symptoms:__

- No entries in audit log file
- Search returns empty results

__Diagnosis:__

```javascript
// Check if auditing is enabled
const config = engine.getManager('ConfigurationManager');
const enabled = config.getProperty('ngdpbase.audit.enabled');
console.log('Audit enabled:', enabled);

// Check provider health
const auditManager = engine.getManager('AuditManager');
const healthy = await auditManager.isHealthy();
console.log('Provider healthy:', healthy);

// Check provider info
const info = auditManager.getProviderInfo();
console.log('Provider:', info.name);
```

__Solutions:__

- Ensure `ngdpbase.audit.enabled` is `true`
- Check log directory permissions for FileAuditProvider
- Verify provider configuration is correct
- Check server logs for initialization errors

#### 2. FileAuditProvider Health Check Failures

__Symptoms:__

```text
[FileAuditProvider] Health check failed: ENOENT: no such file or directory
```

__Cause:__ Health check tries to delete test file before verifying it exists

__Solution:__ This is a minor issue that doesn't affect functionality. The provider falls back gracefully. Can be fixed by updating [isHealthy()](../src/providers/FileAuditProvider.js:408):

```javascript
async isHealthy() {
  try {
    const testFile = path.join(this.config.logDirectory, '.health_check');
    await fs.writeFile(testFile, 'test');
    if (await fs.pathExists(testFile)) {  // Add this check
      await fs.unlink(testFile);
    }
    return true;
  } catch (error) {
    logger.error('[FileAuditProvider] Health check failed:', error);
    return false;
  }
}
```

#### 3. High Memory Usage

__Symptoms:__

- Node process memory grows continuously
- System becomes slow over time

__Cause:__ Large audit queue or too many events in memory

__Solutions:__

```json
{
  "ngdpbase.audit.maxqueuesize": 500,      // Reduce queue size
  "ngdpbase.audit.flushinterval": 10000,   // Flush more frequently
  "ngdpbase.audit.retentiondays": 30       // Shorter retention
}
```

#### 4. Search Performance Issues

__Symptoms:__

- Slow search queries
- High CPU during search

__Cause:__ FileAuditProvider loads recent events into memory for search

__Solutions:__

- Reduce in-memory log count (FileAuditProvider keeps last 1000 events)
- Use DatabaseAuditProvider for high-volume scenarios (when available)
- Implement pagination with smaller `limit` values

```javascript
// Use pagination for large result sets
const results = await auditManager.searchAuditLogs(
  { startDate: '2025-01-01' },
  { limit: 50, offset: 0 }  // Paginate results
);
```

#### 5. Disk Space Issues (FileAuditProvider)

__Symptoms:__

- Disk full errors
- Application stops logging

__Solutions:__

```json
{
  "ngdpbase.audit.provider.file.maxfilesize": "5MB",  // Smaller files
  "ngdpbase.audit.provider.file.maxfiles": 5,         // Fewer archives
  "ngdpbase.audit.retentiondays": 30                  // Shorter retention
}
```

Implement log rotation monitoring:

```javascript
// Check log directory size
const logDir = config.get('ngdpbase.audit.provider.file.logdirectory');
const stats = await fs.stat(path.join(logDir, 'audit.log'));
if (stats.size > 50 * 1024 * 1024) {  // 50MB
  logger.warn('Audit log file is large, consider cleanup');
}
```

### Debug Mode

Enable debug logging to diagnose issues:

```json
{
  "ngdpbase.audit.loglevel": "debug"
}
```

This will output detailed information about audit operations:

```text
[FileAuditProvider] Flushed 50 audit events to disk
[FileAuditProvider] Loaded 1000 recent audit logs
[AuditManager] Provider health check: true
```

## Migration from Old Configuration

### Configuration Key Changes

| Old Key (Deprecated) | New Key (Issue #102) |
| --------------------- | ---------------------- |
| `audit.enabled` | `ngdpbase.audit.enabled` |
| `audit.logFile` | `ngdpbase.audit.provider.file.auditfilename` |
| `audit.retention` | `ngdpbase.audit.retentiondays` |
| `audit.includeContext` | Removed (always included in context field) |
| N/A | `ngdpbase.audit.provider` (NEW) |
| N/A | `ngdpbase.audit.provider.default` (NEW) |

### Migration Steps

1. __Update Configuration Keys:__

   Old format:

   ```json
   {
     "audit.enabled": true,
     "audit.logFile": "audit.log",
     "audit.retention": 90,
     "audit.includeContext": true
   }
   ```

   New format:

   ```json
   {
     "ngdpbase.audit.enabled": true,
     "ngdpbase.audit.provider": "fileauditprovider",
     "ngdpbase.audit.provider.file.auditfilename": "audit.log",
     "ngdpbase.audit.retentiondays": 90
   }
   ```

2. __Update Code References:__

   Old code:

   ```javascript
   const enabled = config.get('audit.enabled');
   ```

   New code:

   ```javascript
   const enabled = config.get('ngdpbase.audit.enabled');
   ```

3. __Test Migration:__

   ```bash
   # Backup old logs
   cp -r logs logs.backup

   # Restart with new configuration
   ./server.sh restart

   # Verify audit logging works
   tail -f logs/audit.log
   ```

## Future Enhancements

### Planned Features

1. __DatabaseAuditProvider Implementation__
   - PostgreSQL, MySQL, MongoDB support
   - Efficient indexing for fast queries
   - Connection pooling
   - Automatic schema migrations

2. __CloudAuditProvider Implementation__
   - AWS CloudWatch Logs integration
   - Azure Monitor Logs integration
   - Google Cloud Logging integration
   - Automatic credential detection (IAM roles, service principals)
   - Batch uploads for cost optimization

3. __Advanced Search Capabilities__
   - Full-text search across all event fields
   - Complex query language (AND, OR, NOT operators)
   - Saved search queries
   - Search result highlighting

4. __Alerting and Notifications__
   - Real-time alerts for critical events
   - Email/Slack/webhook notifications
   - Configurable alert rules
   - Alert aggregation and throttling

5. __Audit Dashboard__
   - Web-based audit log viewer
   - Real-time event streaming
   - Visual analytics and charts
   - Export and reporting tools

6. __Compliance Reports__
   - Pre-built compliance reports (SOC2, GDPR, HIPAA)
   - Automated report generation
   - PDF/HTML export formats
   - Scheduled report delivery

7. __Event Correlation__
   - Link related events (session tracking)
   - User behavior analytics
   - Anomaly detection
   - Security incident timelines

## Performance Benchmarks

### FileAuditProvider

| Operation | Events/sec | Latency (p95) | Memory | Notes |
 | ----------- | ----------- | --------------- | --------- | ------- |
| logAuditEvent | 10,000 | <1ms | 50MB | Queue-based, async flush |
| searchAuditLogs | 1,000 | 5ms | 100MB | In-memory search (1000 events) |
| exportAuditLogs | 100 | 500ms | 150MB | Limited to 10,000 events |
| getAuditStats | 500 | 10ms | 120MB | Aggregation on 10,000 events |

__Recommendations:__

- Single instance: up to 100,000 events/day
- Multi-instance: Use DatabaseAuditProvider instead

### DatabaseAuditProvider (Projected)

| Operation | Events/sec | Latency (p95) | Notes |
| ----------- | ----------- | --------------- | ------- |
| logAuditEvent | 50,000 | <5ms | Batch inserts |
| searchAuditLogs | 5,000 | 20ms | Indexed queries |
| exportAuditLogs | 1,000 | 200ms | Streaming export |

__Recommendations:__

- Enterprise: millions of events/day
- Requires proper database tuning and indexing

## Security Considerations

### Data Protection

1. __Encryption at Rest:__
   - FileAuditProvider: Use OS-level encryption (FileVault, BitLocker, LUKS)
   - DatabaseAuditProvider: Use database encryption (TDE, encrypted columns)
   - CloudAuditProvider: Enable cloud service encryption

2. __Encryption in Transit:__
   - DatabaseAuditProvider: Use SSL/TLS connections
   - CloudAuditProvider: HTTPS APIs only

3. __Access Control:__
   - Restrict log file permissions (0600 or 0640)
   - Use database user with minimal privileges
   - Use IAM roles for cloud services

### Audit Log Integrity

1. __Tamper Detection:__
   - Consider implementing log signing (HMAC)
   - Use write-once storage for compliance
   - Regular integrity checks

2. __Separation of Duties:__
   - Audit logs should be inaccessible to audited users
   - Separate audit admin role from system admin
   - Forward logs to external system (SIEM)

3. __Retention and Deletion:__
   - Follow legal/compliance requirements
   - Implement secure deletion (overwrite, not just delete)
   - Document retention policies

## References

- [BaseAuditProvider](../src/providers/BaseAuditProvider.js) - Base provider interface
- [FileAuditProvider](../src/providers/FileAuditProvider.js) - File-based implementation
- [NullAuditProvider](../src/providers/NullAuditProvider.js) - No-op implementation
- [AuditManager](../src/managers/AuditManager.ts) - Manager implementation
- [GitHub Issue #102](https://github.com/jwilleke/ngdpbase/issues/102) - Configuration refactoring
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [NIST SP 800-92: Guide to Computer Security Log Management](https://csrc.nist.gov/publications/detail/sp/800-92/final)
