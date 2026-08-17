[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/context/WikiContext](../README.md) / WikiContextOptions

# Interface: WikiContextOptions

Defined in: [src/context/WikiContext.ts:78](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/context/WikiContext.ts#L78)

Options for WikiContext constructor

## Properties

### content?

> `optional` __content__: `string`

Defined in: [src/context/WikiContext.ts:84](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/context/WikiContext.ts#L84)

Page content (markdown)

***

### context?

> `optional` __context__: `string`

Defined in: [src/context/WikiContext.ts:80](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/context/WikiContext.ts#L80)

Context type (VIEW, EDIT, PREVIEW, etc.)

***

### pageName?

> `optional` __pageName__: `string`

Defined in: [src/context/WikiContext.ts:82](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/context/WikiContext.ts#L82)

Name of the page

***

### request?

> `optional` __request__: `Request`\<`ParamsDictionary`, `any`, `any`, `ParsedQs`, `Record`\<`string`, `any`\>\>

Defined in: [src/context/WikiContext.ts:88](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/context/WikiContext.ts#L88)

Express request object

***

### response?

> `optional` __response__: `Response`\<`any`, `Record`\<`string`, `any`\>\>

Defined in: [src/context/WikiContext.ts:90](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/context/WikiContext.ts#L90)

Express response object

***

### userContext?

> `optional` __userContext__: [`UserContext`](UserContext.md)

Defined in: [src/context/WikiContext.ts:86](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/context/WikiContext.ts#L86)

User context/session
