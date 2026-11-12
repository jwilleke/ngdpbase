[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/PageManager](../README.md) / ChromeSlot

# Type Alias: ChromeSlot

> __ChromeSlot__ = `"left-menu"` \| `"footer"` \| `"page-tabs"`

Defined in: src/managers/PageManager.ts:250

A site-chrome slot: a page that frames every page (#952, #950, #1622).
`configKey` names the page; `legacy` is the deprecated slug-convention
chain tried when the key is empty; `defaultPage` is used when the key is
unset; `quiet` slots are optional, so a missing page is not reported.
