---
name: RecentChangesPlugin
description: "Lists recent page changes in chronological order for \"what changed lately\" feeds"
dateModified: '2026-05-14'
category: plugins
code: src/plugins/RecentChangesPlugin.ts
---

# RecentChangesPlugin

The RecentChangesPlugin displays recent page changes in chronological order. It provides a convenient way to see what pages have been modified recently, helping users stay up-to-date with wiki activity.

## Overview

This plugin is based on JSPWiki's RecentChangesPlugin and provides similar functionality with two display formats:

- __Compact format__: Simple list with page titles and relative timestamps
- __Full format__: Detailed table with page titles, modification dates, authors, and versions

## Usage

### Basic Usage

```wiki
[{RecentChangesPlugin}]
```

Shows recent changes from the last 7 days in compact format (default).

### Show Changes from Last N Days

```wiki
[{RecentChangesPlugin since='2'}]
```

Shows changes from the last 2 days in compact format.

### Full Format Display

```wiki
[{RecentChangesPlugin since='7' format='full'}]
```

Shows changes from the last 7 days in full format with detailed information.

### Compact Format (Explicit)

```wiki
[{RecentChangesPlugin format='compact'}]
```

Shows recent changes in compact format (same as default).

## Parameters

| Parameter | Type | Default | Description |
| ----------- | ------ | --------- | ------------- |
| `since` | number | `7` | Number of days to look back for changes |
| `format` | string | `compact` | Display format: `compact` or `full` |

### Parameter Details

#### `since` Parameter

- Accepts positive integers
- Specifies how many days back to search for changes
- Pages modified within this time window are included
- Examples:
  - `since='1'` - Changes from the last 24 hours
  - `since='7'` - Changes from the last week
  - `since='30'` - Changes from the last month

#### `format` Parameter

- Accepts two values: `compact` or `full`
- __`compact`__: Minimalist list format with relative timestamps (e.g., "2 hours ago")
- __`full`__: Table format with complete details including modification date/time, author, and version
- Default is `compact` for quick scanning

## Display Formats

### Compact Format

The compact format displays:

- Page title (linked)
- Relative timestamp (e.g., "just now", "2 hours ago", "3 days ago")
- Total change count at the bottom

__Example output:__

```text
Recent Changes (Last 7 days)
• Home (2 hours ago)
• Getting Started (5 hours ago)
• Configuration (1 day ago)
• User Guide (3 days ago)

4 changes
```

### Full Format

The full format displays a table with:

- Page title (linked)
- Last modified timestamp (formatted date/time)
- Author name
- Version number (badge)
- Total page count at the bottom

__Example output:__

```text
Recent Changes (Last 7 days)

| Page            | Last Modified          | Author  | Version |
| ----------------- | ------------------------ | --------- | --------- |
| Home            | Jan 15, 2025 3:45 PM  | admin   | 5       |
| Getting Started | Jan 15, 2025 12:20 PM | editor  | 3       |
| Configuration   | Jan 14, 2025 9:15 AM  | admin   | 12      |
| User Guide      | Jan 12, 2025 2:30 PM  | writer  | 8       |

Total: 4 pages changed
```

## Examples

### Example 1: Today's Changes

```wiki
## What's New Today

[{RecentChangesPlugin since='1' format='full'}]
```

Shows all pages modified in the last 24 hours with full details.

### Example 2: Recent Activity Summary

```wiki
## Recent Wiki Activity

[{RecentChangesPlugin since='14'}]
```

Shows changes from the last two weeks in compact format.

### Example 3: This Week's Updates

```wiki
## This Week in the Wiki

Here are the pages that were updated this week:

[{RecentChangesPlugin since='7' format='full'}]
```

Shows changes from the last 7 days in a detailed table.

### Example 4: Quick Recent Changes

```wiki
## Quick Updates

[{RecentChangesPlugin since='3'}]
```

Shows recent changes from the last 3 days in compact format for quick scanning.

## Technical Details

### How It Works

1. __Page Discovery__: Queries the PageManager for all wiki pages
2. __File Statistics__: Retrieves file modification timestamps using filesystem metadata
3. __Date Filtering__: Filters pages modified within the specified `since` days
4. __Sorting__: Sorts pages by modification time (newest first)
5. __Formatting__: Renders output based on the selected format

### Modification Time Detection

- Uses file system modification time (`mtime`) from page files
- Modification time reflects when the page file was last written
- Time comparison uses midnight (00:00:00) of the cutoff date as the boundary

### Time Formatting

__Compact Format__ (relative times):

- "just now" - Less than 1 minute ago
- "N minutes ago" - Less than 1 hour ago
- "N hours ago" - Less than 1 day ago
- "N days ago" - Less than 1 week ago
- "MMM DD, YYYY" - For older dates

__Full Format__ (absolute times):

- "MMM DD, YYYY H:MM AM/PM" - Standard format with 12-hour time

### No Changes Message

If no pages have been modified within the specified time period:

- Compact format: "No changes in the last N day(s)."
- Full format: Same message

## Performance Considerations

- __File I/O__: Reads file statistics for all pages in the wiki
- __Filtering__: Only pages within the time window are fully processed
- __Memory__: Stores page information in memory during processing
- __Scalability__: Performance depends on total number of pages
  - Small wikis (<100 pages): Instant
  - Medium wikis (100-1000 pages): Very fast (<1s)
  - Large wikis (>1000 pages): May take a few seconds

### Optimization Tips

1. Use smaller `since` values for frequently accessed pages
2. Consider caching for high-traffic wikis (future enhancement)
3. Use compact format for better performance (less data to render)

## JSPWiki Compatibility

This plugin provides similar functionality to JSPWiki's RecentChangesPlugin:

| Feature | JSPWiki | ngdpbase | Compatible |
| --------- | --------- | --------- | ------------ |
| Basic functionality | ✓ | ✓ | ✓ |
| `since` parameter | ✓ | ✓ | ✓ |
| `format` parameter | ✓ | ✓ | ✓ |
| Compact format | ✓ | ✓ | ✓ |
| Full format | ✓ | ✓ | ✓ |
| Date filtering | ✓ | ✓ | ✓ |
| Sorted by date | ✓ | ✓ | ✓ |

### Differences from JSPWiki

- __Time formatting__: ngdpbase uses relative time in compact format (e.g., "2 hours ago") for better UX
- __Styling__: Uses Bootstrap classes for consistent appearance with ngdpbase's design
- __Metadata__: Extracts author and version from page frontmatter metadata

## Use Cases

### 1. Recent Changes Page

Create a dedicated RecentChanges page:

```wiki
---
title: Recent Changes
---

# Recent Changes

Stay up-to-date with the latest wiki updates:

[{RecentChangesPlugin since='30' format='full'}]
```

### 2. Sidebar Widget

Add to a sidebar for quick access:

```wiki
## Recent Activity

[{RecentChangesPlugin since='7'}]

[View all changes](/wiki/RecentChanges)
```

### 3. Team Dashboard

Create a team activity dashboard:

```wiki
# Team Wiki Dashboard

## Today's Updates
[{RecentChangesPlugin since='1' format='full'}]

## This Week
[{RecentChangesPlugin since='7'}]
```

### 4. Project Activity Monitor

Track project documentation changes:

```wiki
# Project Documentation Activity

## Last 24 Hours
[{RecentChangesPlugin since='1' format='full'}]

## Last Week
[{RecentChangesPlugin since='7'}]

## Last Month
[{RecentChangesPlugin since='30'}]
```

## Error Handling

The plugin includes comprehensive error handling:

### Invalid Parameters

```wiki
[{RecentChangesPlugin since='invalid'}]
```

Displays: "Invalid 'since' parameter: must be a positive number"

```wiki
[{RecentChangesPlugin format='invalid'}]
```

Displays: "Invalid 'format' parameter: must be 'full' or 'compact'"

### System Errors

- __PageManager unavailable__: "PageManager not available"
- __File read errors__: Pages that can't be read are skipped silently (logged to console)
- __General errors__: "Error displaying recent changes: [error message]"

## Troubleshooting

### No Pages Showing

__Problem__: Plugin displays "No changes in the last N days"

__Solutions__:

1. Increase the `since` parameter to look further back
2. Verify pages exist in the wiki
3. Check that pages have been modified recently
4. Ensure file system timestamps are correct

### Missing Metadata

__Problem__: Author or version shows as "Unknown" or "1"

__Solutions__:

1. Ensure pages have proper frontmatter metadata
2. Add `author` field to page frontmatter
3. Add `version` field to page frontmatter

### Performance Issues

__Problem__: Plugin takes too long to load

__Solutions__:

1. Reduce the `since` parameter value
2. Use compact format instead of full format
3. Consider paginating results (future enhancement)

## See Also

- [JSPWiki RecentChanges Plugin](https://jspwiki-wiki.apache.org/Wiki.jsp?page=RecentChangesPlugin)
- [PageManager Documentation](../managers/PageManager.md)
- [PluginManager Documentation](../managers/PluginManager.md)
- [IndexPlugin](IndexPlugin.md) - For alphabetical page listing

## Version History

- __1.0.0__ (2025-01-20) - Initial release
  - Basic functionality with date filtering
  - Compact and full display formats
  - Relative time formatting for compact format
  - File modification time detection
  - Comprehensive error handling
  - JSPWiki compatibility
