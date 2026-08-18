---
title: PluginName Plugin
description: How to use the PluginName plugin in your wiki pages
author: ngdpbase
dateModified: YYYY-MM-DD
category: system/documentation
---

# PluginName Plugin

Brief description of what this plugin does and why you'd use it.

## Quick Start

Add this to any wiki page:

```wiki
[{PluginName}]
```

## What It Does

Clear explanation of the plugin's purpose in plain language.

## Usage

### Basic

```wiki
[{PluginName}]
```

### With Options

```wiki
[{PluginName option='value'}]
```

## Options

| Option | Values | Default | What it does |
| -------- | -------- | --------- | -------------- |
| option1 | text | - | Description |
| option2 | number | 10 | Description |
| format | default, compact | default | Changes output style |

## Examples

### Show basic output

```wiki
[{PluginName}]
```

Result: Shows the default plugin output

### Customize the display

```wiki
[{PluginName option1='custom' format='compact'}]
```

Result: Shows customized compact output

### Common use case

Here's how to use it in a typical scenario:

```wiki
!! My Page Title

Some content here.

[{PluginName option1='example'}]

More content below.
```

## Tips

- Tip 1 for effective usage
- Tip 2 for common scenarios
- Tip 3 for best practices

## Common Issues

__Plugin shows nothing?__
Check that the plugin name is spelled correctly.

__Output looks wrong?__
Try using a different format option.

## See Also

- [Plugins Index](./Plugins.md) - List of all available plugins
- [Wiki Syntax Guide](./WikiSyntax.md) - General wiki syntax help
