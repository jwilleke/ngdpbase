---
name: VariableManager
description: "Variable expansion in content — `[{$pagename}]`, `[{$applicationname}]`, custom user variables (JSPWiki-compatible)"
dateModified: '2026-05-14'
category: managers
code: src/managers/VariableManager.ts
---

# VariableManager Documentation

## Overview

The VariableManager is ngdpbase's central system for managing and expanding variables in content, similar to JSPWiki's DefaultVariableManager. It provides a comprehensive variable expansion system that supports both system variables (like `[{$applicationname}]`) and contextual variables (like `[{$username}]`).

## Architecture

The VariableManager follows JSPWiki's design patterns with clean separation between:

- **System Variables**: Configuration and runtime values that don't require context
- **Contextual Variables**: User and page-specific values that require runtime context
- **Variable Registry**: Function-based registry system for dynamic value generation
- **Protection System**: Safeguards escaped variables and code blocks from expansion

## Variable Types

### System Variables (18 total)

These variables provide application and runtime information without requiring user or page context.

#### Application Information

- `[{$applicationname}]` - Application name from configuration
- `[{$baseurl}]` - Base URL for the wiki
- `[{$encoding}]` - Character encoding (UTF-8)
- `[{$frontpage}]` - Front page name from configuration
- `[{$version}]` / `[{$ngdpbaseversion}]` - ngdpbase version number

#### Configuration Variables

- `[{$pageprovider}]` - Page provider implementation name
- `[{$pageproviderdescription}]` - Human-readable provider description
- `[{$requestcontext}]` - Current request context (usually "view")
- `[{$interwikilinks}]` - Number of configured interwiki references
- `[{$inlinedimages}]` - Whether inline images are enabled

#### Runtime Data

- `[{$totalpages}]` - Total number of pages in the wiki
- `[{$uptime}]` - Server uptime in human-readable format
- `[{$timestamp}]` - Current ISO timestamp
- `[{$date}]` - Current date in local format
- `[{$time}]` - Current time in local format
- `[{$year}]` - Current year

#### Plugin Variables

- `[{$sessionsplugin}]` - Session-related plugin information

### Contextual Variables (4 total)

These variables require user session and page context to generate appropriate values.

#### User Context

- `[{$username}]` - Current user's name (or "Anonymous")
- `[{$loginstatus}]` - Authentication status: "Anonymous", "Asserted", or "Authenticated"
- `[{$displayname}]` - User's display name or username

#### Page Context

- `[{$pagename}]` - Current page name

## Usage

### Basic Variable Expansion

Variables use the format `[{$variablename}]` (lowercase only):

```markdown
Welcome to [{$applicationname}] version [{$version}]!

Current user: [{$username}] (Status: [{$loginstatus}])
Total pages: [{$totalpages}]
Server uptime: [{$uptime}]
```

### Escaped Variables

Use double brackets to render variables literally:

```markdown
To display a variable literally: [[{$username}] becomes [{$username}]
```

### Code Block Protection

Variables inside code blocks are automatically protected:

```markdown
Here's how to use variables:
```

Use [{$pagename}] to show the current page name.

```
```

## API Reference

### VariableManager Class

#### Methods

##### `initialize()`

Initializes the VariableManager and registers all default variables.

##### `getVariable(variableName, context = {})`

Gets the value of a single variable.

**Parameters:**

- `variableName` (string): Variable name (lowercase)
- `context` (object): Context object with `userContext` and `pageName`

**Returns:** string - Variable value or error message

##### `hasVariable(variableName)`

Checks if a variable exists in the registry.

**Parameters:**

- `variableName` (string): Variable name to check

**Returns:** boolean

##### `expandVariables(content, context = {})`

Expands all variables in content with protection for escaped variables and code blocks.

**Parameters:**

- `content` (string): Content with `[{$variable}]` patterns
- `context` (object): Context with `userContext` and `pageName`

**Returns:** string - Content with expanded variables

##### `registerVariable(name, valueFunction, isContextual = false)`

Registers a custom variable.

**Parameters:**

- `name` (string): Variable name
- `valueFunction` (function): Function returning variable value
- `isContextual` (boolean): Whether variable requires context

##### `getAvailableVariables()`

Gets array of all available variable names.

**Returns:** Array<string> - Sorted array of variable names

##### `getDebugInfo()`

Gets debugging information about registered variables.

**Returns:** object - Debug information with counts and variable lists

## Integration

### With RenderingManager

The RenderingManager delegates all variable expansion to VariableManager:

```javascript
const variableManager = this.engine.getManager('VariableManager');
const context = { userContext: user, pageName: 'MyPage' };
const expandedContent = variableManager.expandVariables(content, context);
```

### With ConfigurationManager

Variables automatically pull values from ConfigurationManager:

```javascript
// Variables like [{$applicationname}] automatically use:
const configManager = this.engine.getManager('ConfigurationManager');
return configManager.getApplicationName();
```

### Custom Variable Registration

Plugins can register custom variables:

```javascript
const variableManager = engine.getManager('VariableManager');

// System variable (no context needed)
variableManager.registerVariable('mypluginversion', () => {
  return '1.0.0';
});

// Contextual variable (needs user/page context)
variableManager.registerVariable('currentuserrole', (context) => {
  if (!context.userContext) return 'none';
  return context.userContext.roles ? context.userContext.roles[0] : 'user';
}, true); // isContextual = true
```

## Admin Interface

### Variable Management Dashboard

Access the variable management interface at `/admin/variables` with admin privileges.

**Features:**

- **System Variables Tab**: View all system variables with current values
- **Contextual Variables Tab**: View contextual variables with your current values
- **Variable Testing Tab**: Test variable expansion with custom content
- **Custom Variables Tab**: Debug information and custom variable management

### Variable Testing

The testing interface allows real-time testing of variable expansion:

1. Enter content with `[{$variable}]` patterns
2. Optionally specify a test page name
3. Click "Test Variable Expansion"
4. View the expanded result

## Error Handling

### Variable Errors

- **Unknown variables**: `[Unknown: variablename]`
- **Expansion errors**: `[Error: variablename]`
- **Case sensitivity**: `[Error: VARIABLENAME - must be lowercase]`

### Protection System

The VariableManager protects certain content from variable expansion:

- **Escaped variables**: `[[{$variable}]` becomes `[{$variable}]`
- **Code blocks**: Variables in ``` blocks are preserved
- **Inline code**: Variables in ` blocks are preserved

## Performance Considerations

### Caching Strategy

- Variables are computed on-demand, not cached
- System variables use manager lookups for consistency
- Contextual variables are lightweight and fast

### Memory Usage

- Function-based registry is memory efficient
- No variable value caching to ensure freshness
- Protection system uses temporary arrays during expansion only

## JSPWiki Compatibility

The VariableManager maintains compatibility with JSPWiki patterns:

| Feature | JSPWiki | ngdpbase |
| --------- | --------- | ---------- |
| Variable Format | `[{$variable}]` | `[{$variable}]` ✓ |
| System Variables | Yes | Yes ✓ |
| Contextual Variables | Yes | Yes ✓ |
| Plugin Registration | Yes | Yes ✓ |
| Case Sensitivity | Mixed | Lowercase only |
| Admin Interface | Limited | Enhanced ✓ |

## Troubleshooting

### Common Issues

**Variables not expanding:**

- Check variable name is lowercase
- Ensure VariableManager is initialized
- Verify variable exists with `hasVariable()`

**Escaped variables showing incorrectly:**

- Ensure double brackets: `[[{$variable}]`
- Check for syntax errors in content

**Custom variables not working:**

- Verify registration with correct parameters
- Check if variable is contextual but no context provided
- Review error logs for registration issues

### Debug Information

Access debug information through the admin interface or programmatically:

```javascript
const debug = variableManager.getDebugInfo();
console.log(`Total variables: ${debug.totalVariables}`);
console.log('System variables:', debug.systemVariables);
console.log('Contextual variables:', debug.contextualVariables);
```

## Examples

### Basic Usage

```javascript
// Get variable value
const appName = variableManager.getVariable('applicationname');

// Expand content
const content = 'Welcome to [{$applicationname}]!';
const result = variableManager.expandVariables(content, context);
```

### Custom Variables

```javascript
// Register a simple system variable
variableManager.registerVariable('builddate', () => {
  return new Date().toISOString().split('T')[0];
});

// Register a contextual variable
variableManager.registerVariable('userpagecount', (context) => {
  if (!context.userContext) return '0';
  const pageManager = engine.getManager('PageManager');
  return pageManager.getUserPageCount(context.userContext.username).toString();
}, true);
```

### Advanced Protection

```markdown
Normal variable: [{$username}]
Escaped variable: [[{$username}]
Code example:
```

The variable [{$pagename}] shows the current page.

```
```

This will render as:

- Normal variable: **admin**
- Escaped variable: **[{$username}]**
- Code example: **The variable [{$pagename}] shows the current page.** (unchanged)
