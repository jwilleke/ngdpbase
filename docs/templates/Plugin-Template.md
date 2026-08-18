---
name: "PluginName"
description: "Brief description of what this plugin does"
dateModified: "YYYY-MM-DD"
category: "plugins"
relatedModules: ["RelatedPlugin", "PluginManager"]
version: "1.0.0"
---

# PluginName

Brief overview of the plugin's purpose.

## Overview

Detailed description of what this plugin provides and when to use it.

__Source:__ `plugins/PluginName.js`

## Plugin Metadata

| Property | Value |
| ---------- | ------- |
| Name | PluginName |
| Author | ngdpbase |
| Version | 1.0.0 |
| JSPWiki Compatible | Yes/Partial/No |

## Usage

### Basic Syntax

```wiki
[{PluginName}]
```

### With Parameters

```wiki
[{PluginName param1='value1' param2='value2'}]
```

## Parameters

| Parameter | Type | Default | Required | Description |
| ----------- | ------ | --------- | ---------- | ------------- |
| param1 | string | - | Yes | Description of param1 |
| param2 | number | 10 | No | Description of param2 |
| format | string | "default" | No | Output format: "default", "compact", "detailed" |

### Parameter Details

#### param1

Detailed explanation of param1 and its valid values.

__Valid values:__

- `value1` - Description
- `value2` - Description

#### format

Controls the output format:

- `default` - Standard output
- `compact` - Minimal output
- `detailed` - Verbose output with extra information

## Examples

### Example 1: Basic Usage

```wiki
[{PluginName}]
```

__Output:__

```text
Plugin output here
```

### Example 2: Custom Parameters

```wiki
[{PluginName param1='custom' param2=5}]
```

__Output:__

```html
<div class="plugin-output">Custom output</div>
```

### Example 3: Different Formats

```wiki
[{PluginName format='detailed'}]
```

__Output:__

```text
Detailed output with additional information
```

### Example 4: Real-World Use Case

```wiki
Use this plugin to display:
[{PluginName param1='example'}]
in your wiki pages.
```

## Output Formats

### Default Format

Standard output suitable for most use cases.

### Compact Format

Minimal output for inline usage.

### Detailed Format

Extended output with additional context.

## Technical Implementation

### Execute Method

```javascript
async execute(context, params = {}) {
  // Plugin implementation
  const { param1, param2 = 10 } = params;
  // ... processing
  return outputString;
}
```

### Context Usage

The plugin receives a WikiContext with:

- `context.engine` - WikiEngine instance
- `context.pageName` - Current page name
- `context.user` - Current user (if authenticated)

## JSPWiki Compatibility

| Feature | JSPWiki | ngdpbase | Notes |
| --------- | --------- | --------- | ------- |
| Basic syntax | Yes | Yes | Fully compatible |
| param1 | Yes | Yes | Same behavior |
| param2 | Yes | Partial | Different default |

## Error Handling

| Error | Cause | Output |
| ------- | ------- | -------- |
| Missing required param | param1 not provided | Error message displayed |
| Invalid value | param1 has invalid value | Fallback to default |

## Related Plugins

- [RelatedPlugin.md](./RelatedPlugin.md) - Description of relationship

## Related Documentation

- [Plugin System Architecture](../architecture/Plugin-Architecture.md)
- [PluginManager](../managers/PluginManager.md)
- [User Guide: PluginName](../../required-pages/PluginName.md)

## Version History

| Version | Date | Changes |
| --------- | ------ | --------- |
| 1.0.0 | YYYY-MM-DD | Initial implementation |
