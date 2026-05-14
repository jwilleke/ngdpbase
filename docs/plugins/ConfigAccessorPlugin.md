---
name: ConfigAccessorPlugin
description: The ConfigAccessorPlugin provides access to system configuration values including roles, features, manager settings, and any configuration property. This plugin is useful for displaying configurati…
dateModified: '2026-05-14'
category: plugins
code: src/plugins/ConfigAccessorPlugin.ts
---

# ConfigAccessorPlugin

The ConfigAccessorPlugin provides access to system configuration values including roles, features, manager settings, and any configuration property. This plugin is useful for displaying configuration information on wiki pages or embedding config values inline in text.

**Version:** 2.2.0

## Usage

### Get Configuration Value (Inline)

```wiki
[{ConfigAccessor key='ngdpbase.server.port' valueonly='true'}]
```

Returns just the value `3000` for inline use in text.

### Display Configuration Value (Formatted)

```wiki
[{ConfigAccessor key='ngdpbase.server.port'}]
```

Displays a formatted card showing the key and value.

### Get Multiple Values with Wildcard (Inline)

```wiki
[{ConfigAccessor key='ngdpbase.server.*' valueonly='true'}]
```

Returns matching values, one per line.

### Display Multiple Values with Wildcard (Formatted)

```wiki
[{ConfigAccessor key='ngdpbase.server.*'}]
```

Displays a formatted table showing all matching keys and values.

### Display All Roles

```wiki
[{ConfigAccessor type='roles'}]
```

Displays all system and custom roles in a formatted table.

### Display Security Policy Summary

```wiki
[{ConfigAccessor type='permissions'}]
```

Displays the Security Policy Summary - a permissions matrix showing which roles have which permissions. Shows green checkmarks for granted permissions and gray X marks for denied permissions.

Alternative syntax:

```wiki
[{ConfigAccessor type='policy-summary'}]
```

### Display Current User Summary

```wiki
[{ConfigAccessor type='user-summary'}]
```

Displays the current user's information, roles, and permissions from WikiContext. Shows:

- User information (username, display name, email)
- Assigned roles with descriptions
- All permissions granted by those roles
- Which role(s) grant each permission

If the user is not logged in, displays a friendly message with a login link.

### Display Manager Configuration

```wiki
[{ConfigAccessor type='manager' manager='UserManager'}]
```

Shows all configuration properties for a specific manager.

### Display Feature Configuration

```wiki
[{ConfigAccessor type='feature' feature='search'}]
```

Shows all configuration properties for a specific feature.

## Parameters

| Parameter | Values | Default | Required | Description |
| ----------- | -------- | --------- | ---------- | ------------- |
| `key` | Config key with optional wildcards (*) | *(none)* | Yes (if no `type`) | Configuration key in dot-notation, supports wildcards |
| `type` | `roles`, `permissions`, `policy-summary`, `user-summary`, `manager`, `feature` | *(none)* | Yes (if no `key`) | What type of configuration to display |
| `valueonly` | `true`, `false` | `false` | No | Return only value(s) without HTML formatting |
| `before` | Any string | `''` (empty) | No | String to prepend before each value (only with `valueonly`) |
| `after` | Any string | *Smart default* | No | String to append after each value (only with `valueonly`) |
| `manager` | Manager name | *(none)* | Yes (if `type='manager'`) | Manager name |
| `feature` | Feature name | *(none)* | Yes (if `type='feature'`) | Feature name |

**Important:** You must specify either `key` or `type` parameter. The plugin will return an error if neither is provided.

**Note:** The `before` and `after` parameters only work when `valueonly='true'`. They are ignored in formatted display mode.

**Smart Default for `after`:**

- **Single value** (no wildcard): `''` (empty string) - Perfect for inline use
- **Multiple values** (wildcard): `'\n'` (newline) - One value per line by default

## Examples

### Example 1: Inline Value in Text (Smart Default)

```wiki
The server is running on port [{ConfigAccessor key='ngdpbase.server.port' valueonly='true'}].
```

**Output:** The server is running on port 3000.

**Note:** Single values have no trailing newline by default (smart default), perfect for inline use. No need to specify `after=''`!

### Example 2: Display Single Config Value (Formatted)

```wiki
[{ConfigAccessor key='ngdpbase.server.port'}]
```

**Output:** Formatted card showing:

- **Key:** `ngdpbase.server.port`
- **Value:** `3000`

### Example 3: Get All Server Config (Inline, Default Newlines)

```wiki
[{ConfigAccessor key='ngdpbase.server.*' valueonly='true'}]
```

**Output:** Plain text, one value per line:

``` text
3000
localhost
```

**Note:** By default, each value ends with `\n` (newline).

### Example 4: Display All Server Config (Formatted)

```wiki
[{ConfigAccessor key='ngdpbase.server.*'}]
```

**Output:** Formatted table showing all keys matching `ngdpbase.server.*`:

- `ngdpbase.server.port` → `3000`
- `ngdpbase.server.host` → `localhost`

### Example 5: Embed Application Name in Text

```wiki
Welcome to [{ConfigAccessor key='ngdpbase.application-name' valueonly='true'}]!
```

**Output:** Welcome to ngdpbase!

### Example 6: Display All Roles

```wiki
[{ConfigAccessor type='roles'}]
```

**Output:** Formatted table with all available roles:

- Role name (code format)
- Display name (colored)
- Description
- Type badge (System/Custom)
- Icon with color

Includes roles like Admin, Editor, Contributor, Reader, and Anonymous.

### Example 6a: Display Security Policy Summary

```wiki
[{ConfigAccessor type='permissions'}]
```

**Output:** Formatted permissions matrix table showing:

- Permission list (e.g., `page:read`, `admin:system`)
- Permission descriptions
- Checkmarks (✓) for roles that have each permission
- X marks (✗) for roles that don't have each permission
- Footer with total counts

This creates the same Security Policy Summary table as seen on the `/admin/roles` page.

### Example 6b: Display Current User Summary

```wiki
[{ConfigAccessor type='user-summary'}]
```

**Output:** Formatted card showing:

- User information (username, display name, email)
- All roles assigned to the current user with descriptions and icons
- Permissions table showing:
  - Permission code (e.g., `page:edit`)
  - Permission description
  - Which role(s) grant that permission
- Footer with totals (roles and permissions)

**Note:** If the user is not logged in, displays a friendly message: "Not logged in. Please login to see your user summary."

### Example 7: Display Manager Configuration

```wiki
[{ConfigAccessor type='manager' manager='UserManager'}]
```

**Output:** Formatted table with all UserManager configuration properties such as:

- Session timeout
- Password policies
- Authentication settings
- User profile options

### Example 8: Display Feature Configuration

```wiki
[{ConfigAccessor type='feature' feature='search'}]
```

**Output:** Formatted table with search feature configuration:

- Search index location
- Indexing options
- Search result limits
- Fuzzy search settings

### Example 9: Get Multiple Role Names (Inline)

```wiki
[{ConfigAccessor key='ngdpbase.roles.definitions.*.name' valueonly='true'}]
```

**Output:** Plain text, one role name per line:

``` text
admin
editor
contributor
reader
anonymous
```

### Example 10: Create Bulleted List with before/after

```wiki
## Server Configuration

[{ConfigAccessor key='ngdpbase.server.*' valueonly='true' before='* ' after='\n'}]
```

**Output:**

```text
## Server Configuration

* 3000
* localhost
```

### Example 11: Inline Comma-Separated List

```wiki
Available roles: [{ConfigAccessor key='ngdpbase.roles.definitions.*.name' valueonly='true' before='' after=', '}]
```

**Output:** Available roles: admin, editor, contributor, reader, anonymous,

**Note:** You may want to trim the trailing comma manually or use other formatting.

### Example 12: Custom Formatting with HTML

```wiki
<ul>
[{ConfigAccessor key='ngdpbase.server.*' valueonly='true' before='<li>' after='</li>\n'}]
</ul>
```

**Output:**

```html
<ul>
<li>3000</li>
<li>localhost</li>
</ul>
```

## Wildcard Support

The `key` parameter supports wildcards using the `*` character for flexible pattern matching:

### Single Wildcard

```wiki
[{ConfigAccessor key='ngdpbase.server.*'}]
```

Matches: `ngdpbase.server.port`, `ngdpbase.server.host`, etc.

### Multiple Levels

```wiki
[{ConfigAccessor key='ngdpbase.*.port'}]
```

Matches: `ngdpbase.server.port`, `ngdpbase.database.port`, etc.

### Nested Wildcards

```wiki
[{ConfigAccessor key='ngdpbase.roles.definitions.*.name'}]
```

Matches all role names in the role definitions.

### Full Wildcard

```wiki
[{ConfigAccessor key='ngdpbase.*'}]
```

Matches all configuration keys starting with `ngdpbase.`

## Value-Only Mode

When `valueonly='true'` is specified:

### Behavior

- Returns **plain text only** (no HTML formatting)
- Single value: returns the value with optional `before` and `after` strings
- Multiple values (wildcard): returns each value with `before` and `after` strings
- Objects: returns JSON string representation
- Empty/not found: returns empty string
- Default `before`: `''` (empty string)
- Default `after`: **Smart default** - `''` (empty) for single values, `'\n'` (newline) for multiple values

### Smart Defaults

The `after` parameter has intelligent defaults based on usage:

- **Single value** (e.g., `key='ngdpbase.server.port'`): Default `after=''` - No trailing newline, perfect for inline use
- **Multiple values** (e.g., `key='ngdpbase.server.*'`): Default `after='\n'` - One value per line, perfect for lists

This means you don't need to specify `after=''` for inline single values - it just works!

### Format Control with before/after

- `before`: String prepended before each value
- `after`: String appended after each value (overrides smart default when specified)
- Both parameters work together to format output
- Use `after='\n'` to add a trailing newline to single values if needed
- Use `before='* '` for bulleted lists (works with default `after='\n'` for wildcards)
- Use `before='<li>'` with `after='</li>\n'` for HTML lists

### Use Cases

- Embedding config values inline in sentences
- Creating dynamic bulleted or numbered lists
- Creating HTML lists with custom formatting
- Building comma-separated or custom-delimited lists
- Using config values in calculations or comparisons
- Building dynamic URLs or paths

### Example Usage in Text

```wiki
## Server Information

- **Application:** [{ConfigAccessor key='ngdpbase.application-name' valueonly='true'}]
- **Port:** [{ConfigAccessor key='ngdpbase.server.port' valueonly='true'}]
- **Environment:** [{ConfigAccessor key='ngdpbase.environment' valueonly='true'}]

The system is running version [{ConfigAccessor key='ngdpbase.version' valueonly='true'}]
and has been up for [{$uptime}].
```

## Configuration Access Methods

The plugin uses these ConfigurationManager methods internally:

### getAllProperties()

Gets all configuration properties as an object. Used for wildcard matching.

```javascript
returns: { 'ngdpbase.server.port': 3000, 'ngdpbase.server.host': 'localhost', ... }
```

### getProperty(key, defaultValue)

Gets a single configuration property by dot-notation key.

```javascript
key: 'ngdpbase.server.port'
returns: 3000
```

### getManagerConfig(managerName)

Gets all configuration for a specific manager.

```javascript
managerName: 'UserManager'
returns: { sessionTimeout: 3600, ... }
```

### getFeatureConfig(featureName)

Gets all configuration for a specific feature.

```javascript
featureName: 'search'
returns: { indexPath: './index', ... }
```

## Common Configuration Keys

### Server Configuration

- `ngdpbase.server.port` - Server port number
- `ngdpbase.server.host` - Server hostname
- `ngdpbase.application.base-url` - Base URL for the wiki

### Application Configuration

- `ngdpbase.application-name` - Application display name
- `ngdpbase.version` - Current version
- `ngdpbase.environment` - Environment (development/production)

### Roles Configuration

- `ngdpbase.roles.definitions` - All role definitions
- `ngdpbase.access.policies` - Access control policies

### Feature Flags

- `ngdpbase.features.search` - Search feature config
- `ngdpbase.features.versioning` - Version control config
- `ngdpbase.features.attachments` - Attachment handling config

### Manager Configuration

- `ngdpbase.managers.plugin-manager.search-paths` - Plugin directories
- `ngdpbase.managers.userManager.*` - User management settings
- `ngdpbase.managers.pageManager.*` - Page management settings

## Role Information

When displaying roles (`type='roles'`), each role includes:

| Field | Description |
| ------- | ------------- |
| `name` | Internal role identifier (e.g., `admin`, `editor`) |
| `displayname` | Human-readable name (e.g., "Administrator") |
| `description` | Role purpose and permissions |
| `issystem` | Boolean - true for built-in roles |
| `icon` | FontAwesome icon name |
| `color` | HTML color code for visual identification |

### System Roles

Built-in roles defined in configuration:

1. **admin** - Full system access to all features
2. **editor** - Can edit and manage content
3. **contributor** - Can create and edit own content
4. **reader** - Read-only access to content
5. **anonymous** - Unauthenticated user access

## Output Format

### Roles Display

- Responsive table with sorting (system roles first)
- Color-coded role names
- Type badges (System/Custom)
- Icons with role colors
- Footer with statistics

### Config Value Display

- Card layout with key-value display
- JSON formatting for objects/arrays
- Simple value display for primitives
- Code formatting for readability

### Manager/Feature Config Display

- Table format with property-value pairs
- Automatic JSON formatting for complex values
- Alphabetical property ordering
- Clear section headers

## Case-Insensitive Usage

Plugin names are case-insensitive in ngdpbase:

```wiki
[{ConfigAccessor}]           ✓ Works
[{configaccessor}]           ✓ Works
[{CONFIGACCESSOR}]           ✓ Works
[{ConfigAccessor}]           ✓ Works (recommended)
```

All variations invoke the same plugin.

## Error Handling

### Missing Required Parameters (No key or type)

```wiki
[{ConfigAccessor}]
```

Returns: `Missing required parameter: must specify either 'key' or 'type'`

### Missing Key Parameter

```wiki
[{ConfigAccessor valueonly='true'}]
```

Returns: `Missing required parameter: must specify either 'key' or 'type'`

### Invalid Configuration Key (Formatted Mode)

```wiki
[{ConfigAccessor key='invalid.key'}]
```

Returns: `Config key 'invalid.key' not found`

### Invalid Configuration Key (Value-Only Mode)

```wiki
[{ConfigAccessor key='invalid.key' valueonly='true'}]
```

Returns: Empty string (nothing displayed)

### No Wildcard Matches (Formatted Mode)

```wiki
[{ConfigAccessor key='nonexistent.*'}]
```

Returns: `No config keys match pattern: nonexistent.*`

### No Wildcard Matches (Value-Only Mode)

```wiki
[{ConfigAccessor key='nonexistent.*' valueonly='true'}]
```

Returns: Empty string (nothing displayed)

### Manager Not Found

```wiki
[{ConfigAccessor type='manager' manager='NonexistentManager'}]
```

Returns: `No configuration found for manager: NonexistentManager`

### Feature Not Found

```wiki
[{ConfigAccessor type='feature' feature='nonexistent'}]
```

Returns: `No configuration found for feature: nonexistent`

## Security Considerations

- Configuration values are displayed as-is
- Sensitive values (passwords, API keys) in config will be visible
- Consider access control on pages using this plugin
- Use with caution in public-facing pages

## Use Cases

### 1. Inline Value Embedding

Embed configuration values directly in page text:

```wiki
## Welcome

Welcome to [{ConfigAccessor key='ngdpbase.application-name' valueonly='true'}]!

The server is running on port [{ConfigAccessor key='ngdpbase.server.port' valueonly='true'}]
and currently has [{$totalpages}] pages.

System version: [{ConfigAccessor key='ngdpbase.version' valueonly='true'}]
```

### 2. System Information Pages

Display current configuration on admin/status pages:

```wiki
## Server Configuration

**Port:** [{ConfigAccessor key='ngdpbase.server.port' valueonly='true'}]
**Host:** [{ConfigAccessor key='ngdpbase.server.host' valueonly='true'}]
**Environment:** [{ConfigAccessor key='ngdpbase.environment' valueonly='true'}]

### All Server Settings

[{ConfigAccessor key='ngdpbase.server.*'}]
```

### 3. Role Documentation

Document available roles for users:

```wiki
## Available User Roles

[{ConfigAccessor type='roles'}]
```

### 3a. Security Policy Documentation

Display the complete security policy showing which roles have which permissions:

```wiki
## Security Policy Matrix

The following table shows which permissions are granted to each role:

[{ConfigAccessor type='permissions'}]

For more information about managing roles and permissions, visit the [Admin Dashboard](/admin/roles).
```

### 3b. User Profile/Dashboard Pages

Show users their own roles and permissions:

```wiki
## My Access Rights

This page shows your current roles and permissions in the system.

[{ConfigAccessor type='user-summary'}]

If you believe you need additional permissions, please contact your system administrator.
```

**Great for:**

- User profile pages
- Personal dashboard
- Help/FAQ pages explaining what users can do
- Transparency about user access rights

### 4. Dynamic Lists

Create dynamic lists from configuration:

```wiki
## System Roles

Available roles in the system:
- Admin
- Editor
- Contributor
- Reader
- Anonymous

Role count: [{ConfigAccessor key='ngdpbase.roles.definitions.*' valueonly='true'}] (returns count via wildcard)
```

### 5. Feature Documentation

Show current feature configuration:

```wiki
## Search Configuration

[{ConfigAccessor type='feature' feature='search'}]
```

### 6. Manager Settings

Display manager configuration for troubleshooting:

```wiki
## PageManager Settings

[{ConfigAccessor type='manager' manager='PageManager'}]
```

### 7. Wildcard Pattern Matching

Find all related configuration values:

```wiki
## Database Configuration

All database settings:

[{ConfigAccessor key='ngdpbase.database.*'}]
```

## See Also

- [ConfigurationManager Documentation](../managers/ConfigurationManager.md)
- [UserManager Documentation](../managers/UserManager.md)
- [VariablesPlugin](VariablesPlugin.md) - For system variables
- [System Variables Page](/wiki/System%20Variables)

## Version History

- **2.7.0** (2025-10-20) - User Summary release
  - **NEW:** Added `type='user-summary'` to display current user's information
  - Shows user's username, display name, and email
  - Displays all roles assigned to the user with descriptions
  - Shows all permissions granted by those roles
  - Includes which role(s) grant each permission
  - Friendly message for anonymous/not logged in users
  - Perfect for user profile pages and access transparency

- **2.6.0** (2025-10-20) - Security Policy Summary release
  - **NEW:** Added `type='permissions'` to display Security Policy Summary
  - **NEW:** Added `type='policy-summary'` as alias for permissions
  - Displays permissions matrix showing which roles have which permissions
  - Shows checkmarks (✓) for granted permissions, X marks (✗) for denied
  - Includes permission descriptions and statistics
  - Perfect for documentation and transparency of security policies

- **2.2.0** (2025-10-17) - Smart defaults release
  - **IMPROVED:** Smart default for `after` parameter based on usage
    - Single values: default `after=''` (no trailing newline) for perfect inline use
    - Multiple values (wildcard): default `after='\n'` (newline) for list formatting
  - No longer need to specify `after=''` for inline single values!
  - Better user experience with intelligent defaults

- **2.1.0** (2025-10-17) - Formatting enhancement release
  - Added `before` and `after` parameters for flexible output formatting
  - Fixed manager/feature config error handling (better null checking)
  - Default `after` value is now `'\n'` (previously joined without control)
  - Enhanced valueonly mode with customizable delimiters
  - Support for bulleted lists, HTML lists, and custom formatting

- **2.0.0** (2025-10-17) - Major enhancement release
  - **BREAKING:** Now requires either `key` or `type` parameter (no default behavior)
  - Added `valueonly` parameter for inline value embedding
  - Added wildcard support for `key` parameter (e.g., `ngdpbase.server.*`)
  - Multiple value display when wildcards match multiple keys
  - Plain text output mode for easy inline usage
  - Enhanced error handling for edge cases

- **1.0.0** (2025-10-17) - Initial release
  - Roles display
  - Configuration property access
  - Manager configuration display
  - Feature configuration display
  - Case-insensitive plugin invocation
