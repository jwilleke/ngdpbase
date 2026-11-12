[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [plugins/TabPlugin](../README.md) / default

# Variable: default

> `const` __default__: [`SimplePlugin`](../../types/interfaces/SimplePlugin.md)

Defined in: src/plugins/TabPlugin.ts:12

TabPlugin — defines a single tab within a [{Tabs}] body block.

TabsPlugin parses [{Tab name='...'}]content[{/Tab}] blocks directly
from its body content, so this plugin is a no-op when used inside
[{Tabs}]. It returns empty string to avoid double-rendering.

Standalone use outside [{Tabs}] also returns empty string intentionally.
