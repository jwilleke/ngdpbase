[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / ReauthMode

# Type Alias: ReauthMode

> __ReauthMode__ = `"json"` \| `"page"` \| `"text"` \| `"download"`

Defined in: src/managers/AuthManager.ts:914

How a refused request wants its answer: a page to redirect, JSON, or plain
text (#1745). `download` is a GET that answers with a file: refused like a
page, but returned to the page that linked it, since going back to the file
itself saves it and leaves the browser on the prompt (#2145).
