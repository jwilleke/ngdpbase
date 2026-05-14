---
name: CurrentTimePlugin
description: Displays current date/time with customizable formatting
dateModified: '2025-12-18'
category: plugins
code: src/plugins/CurrentTimePlugin.ts
relatedModules:
  - PluginManager
version: 1.0.0
---

# CurrentTimePlugin

Displays the current date and time with customizable formatting, respecting user locale and timezone preferences.

## Overview

The CurrentTimePlugin provides JSPWiki-compatible date/time display functionality. It automatically uses user preferences for locale, timezone, and time format (12h/24h), or can be customized with explicit format patterns.

**Source:** `plugins/CurrentTimePlugin.js`

## Plugin Metadata

| Property | Value |
| ---------- | ------- |
| Name | CurrentTimePlugin |
| Author | ngdpbase |
| Version | 1.0.0 |
| JSPWiki Compatible | Yes |

## Usage

### Basic Syntax

```wiki
[{CurrentTimePlugin}]
```

Uses user preferences for locale, timezone, and time format.

### With Custom Format

```wiki
[{CurrentTimePlugin format='yyyy-MM-dd HH:mm:ss'}]
```

## Parameters

| Parameter | Type | Default | Required | Description |
| ----------- | ------ | --------- | ---------- | ------------- |
| format | string | - | No | Java SimpleDateFormat-style pattern |

### Format Pattern Tokens

The plugin supports Java SimpleDateFormat-style patterns:

| Token | Description | Example |
| ------- | ------------- | --------- |
| yyyy | 4-digit year | 2025 |
| yy | 2-digit year | 25 |
| MMMM | Full month name | December |
| MMM | Short month name | Dec |
| MM | 2-digit month | 12 |
| M | Month without leading zero | 12 |
| dd | 2-digit day | 18 |
| d | Day without leading zero | 18 |
| EEEE | Full weekday name | Wednesday |
| EEE | Short weekday name | Wed |
| HH | 2-digit hour (24h) | 14 |
| hh | 2-digit hour (12h) | 02 |
| mm | 2-digit minute | 30 |
| ss | 2-digit second | 45 |
| a | AM/PM marker | PM |
| z | Timezone abbreviation | EST |
| G | Era designator | AD |

## Examples

### Example 1: Default (User Preferences)

```wiki
[{CurrentTimePlugin}]
```

**Output:** `12/18/2025, 02:30:45 PM` (varies by user locale)

### Example 2: ISO Date Format

```wiki
[{CurrentTimePlugin format='yyyy-MM-dd'}]
```

**Output:** `2025-12-18`

### Example 3: Full Date with Time

```wiki
[{CurrentTimePlugin format='EEEE, MMMM d, yyyy HH:mm:ss'}]
```

**Output:** `Wednesday, December 18, 2025 14:30:45`

### Example 4: Time Only (12-hour)

```wiki
[{CurrentTimePlugin format='hh:mm a'}]
```

**Output:** `02:30 PM`

### Example 5: Literal Text in Format

```wiki
[{CurrentTimePlugin format="'Today is' EEEE"}]
```

**Output:** `Today is Wednesday`

## User Preferences

The plugin respects these user profile settings:

| Setting | Description | Default |
| --------- | ------------- | --------- |
| locale | User's locale code | en-US |
| timezone | User's timezone | UTC |
| timeFormat | 12h or 24h format | 12h |
| dateFormat | Date format preference | MM/dd/yyyy |

## Technical Implementation

### Execute Method

```javascript
execute(context, params) {
  const userPrefs = context?.userContext?.preferences || {};
  const locale = userPrefs.locale || 'en-US';
  const timezone = userPrefs.timezone || 'UTC';

  if (params.format) {
    return this.formatWithPattern(now, params.format, locale, timezone);
  }

  return this.formatWithUserPreferences(now, locale, timezone);
}
```

### Context Usage

- `context.userContext.preferences` - User's locale/timezone settings

## JSPWiki Compatibility

| Feature | JSPWiki | ngdpbase | Notes |
| --------- | --------- | --------- | ------- |
| Basic syntax | Yes | Yes | Fully compatible |
| Format patterns | Yes | Yes | Java SimpleDateFormat-style |
| User preferences | Partial | Yes | Extended preference support |

## Error Handling

| Error | Cause | Output |
| ------- | ------- | -------- |
| Invalid format | Unrecognized pattern | Falls back to locale default |
| Missing context | No user context | Uses en-US/UTC defaults |

## Related Plugins

- [VariablesPlugin](./VariablesPlugin.md) - Can also display date/time variables

## Related Documentation

- [Plugin System Architecture](../architecture/Plugin-Architecture.md)
- [PluginManager](../managers/PluginManager.md)

## Version History

| Version | Date | Changes |
| --------- | ------ | --------- |
| 1.0.0 | 2025-10-05 | Initial implementation |
