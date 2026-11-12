[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / StepUpPromptState

# Type Alias: StepUpPromptState

> __StepUpPromptState__ = `"waiting"` \| `"confirmed"` \| `"cancelled"`

Defined in: src/managers/AuthManager.ts:940

Where a script's own prompt is (#2193): a page that sent a request by
`fetch` and was refused waits on the prompt its refusal named, and sends
again only when that prompt, not another tab's, is confirmed.
