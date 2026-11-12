[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Review](../README.md) / ReviewHandler

# Type Alias: ReviewHandler

> __ReviewHandler__ = (`request`, `ctx`) => `Promise`\<[`ReviewHandlerResult`](../interfaces/ReviewHandlerResult.md)\>

Defined in: src/types/Review.ts:66

Carries out an approved request, with the decider's context. Throw to say it
was not done: the request stays open and the error's message is shown to
reviewers as the reason, so write it for them.

## Parameters

### request

[`ReviewRequest`](../interfaces/ReviewRequest.md)

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

## Returns

`Promise`\<[`ReviewHandlerResult`](../interfaces/ReviewHandlerResult.md)\>
