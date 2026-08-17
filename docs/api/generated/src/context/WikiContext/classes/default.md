[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/context/WikiContext](../README.md) / default

# Class: default

Defined in: [src/context/WikiContext.ts:137](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/context/WikiContext.ts#L137)

WikiContext - Encapsulates the context of a single request or rendering operation

Inspired by JSPWiki's WikiContext, this class provides a request-scoped container
for all contextual information needed during page rendering, including the engine,
current page, user, request/response objects, and manager references.

 WikiContext

## See

- [WikiEngine](../../../types/WikiEngine/interfaces/WikiEngine.md) for the main engine
- [RenderingManager](../../../managers/RenderingManager/classes/export=.md) for rendering operations

## Constructors

### Constructor

> __new default__(`engine`, `options?`): `WikiContext`

Defined in: [src/context/WikiContext.ts:215](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/context/WikiContext.ts#L215)

Creates a new WikiContext instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

##### options?

[`WikiContextOptions`](../interfaces/WikiContextOptions.md) = `{}`

Context options

#### Returns

`WikiContext`

#### Throws

If engine is not provided

#### Example

```ts
const context = new WikiContext(engine, {
  context: WikiContext.CONTEXT.VIEW,
  pageName: 'Main',
  userContext: req.session.user,
  request: req,
  response: res
});
```

## Properties

### aclManager

> `readonly` __aclManager__: [`export=`](../../../managers/ACLManager/classes/export=.md)

Defined in: [src/context/WikiContext.ts:193](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/context/WikiContext.ts#L193)

Reference to ACLManager

***

### content

> `readonly` __content__: `string` \| `null`

Defined in: [src/context/WikiContext.ts:169](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/context/WikiContext.ts#L169)

Page content (markdown)

***

### context

> `readonly` __context__: `string`

Defined in: [src/context/WikiContext.ts:163](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/context/WikiContext.ts#L163)

The rendering context (VIEW, EDIT, PREVIEW, etc.)

***

### CONTEXT

> `readonly` `static` __CONTEXT__: [`ContextTypes`](../interfaces/ContextTypes.md)

Defined in: [src/context/WikiContext.ts:144](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/context/WikiContext.ts#L144)

Context type constants for different rendering modes

#### Static

***

### engine

> `readonly` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: [src/context/WikiContext.ts:160](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/context/WikiContext.ts#L160)

The wiki engine instance

***

### pageManager

> `readonly` __pageManager__: [`export=`](../../../managers/PageManager/classes/export=.md)

Defined in: [src/context/WikiContext.ts:181](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/context/WikiContext.ts#L181)

Reference to PageManager

***

### pageName

> `readonly` __pageName__: `string` \| `null`

Defined in: [src/context/WikiContext.ts:166](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/context/WikiContext.ts#L166)

Name of the current page

***

### pluginManager

> `readonly` __pluginManager__: [`default`](../../../managers/PluginManager/classes/default.md)

Defined in: [src/context/WikiContext.ts:187](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/context/WikiContext.ts#L187)

Reference to PluginManager

***

### renderingManager

> `readonly` __renderingManager__: [`export=`](../../../managers/RenderingManager/classes/export=.md)

Defined in: [src/context/WikiContext.ts:184](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/context/WikiContext.ts#L184)

Reference to RenderingManager

***

### request

> `readonly` __request__: `Request`\<`ParamsDictionary`, `any`, `any`, `ParsedQs`, `Record`\<`string`, `any`\>\> \| `null`

Defined in: [src/context/WikiContext.ts:175](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/context/WikiContext.ts#L175)

Express request object

***

### response

> `readonly` __response__: `Response`\<`any`, `Record`\<`string`, `any`\>\> \| `null`

Defined in: [src/context/WikiContext.ts:178](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/context/WikiContext.ts#L178)

Express response object

***

### userContext

> `readonly` __userContext__: [`UserContext`](../interfaces/UserContext.md) \| `null`

Defined in: [src/context/WikiContext.ts:172](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/context/WikiContext.ts#L172)

Current user context/session

***

### variableManager

> `readonly` __variableManager__: [`default`](../../../managers/VariableManager/classes/default.md)

Defined in: [src/context/WikiContext.ts:190](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/context/WikiContext.ts#L190)

Reference to VariableManager

## Methods

### getContext()

> __getContext__(): `string`

Defined in: [src/context/WikiContext.ts:248](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/context/WikiContext.ts#L248)

Returns the current rendering context type

#### Returns

`string`

The context type (VIEW, EDIT, PREVIEW, etc.)

#### Example

```ts
if (context.getContext() === WikiContext.CONTEXT.EDIT) {
  // Show edit-specific UI
}
```

***

### renderMarkdown()

> __renderMarkdown__(`content?`): `Promise`\<`string`\>

Defined in: [src/context/WikiContext.ts:272](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/context/WikiContext.ts#L272)

Renders the provided markdown content through the full rendering pipeline

This method uses the MarkupParser for advanced parsing with plugin support,
variable expansion, and multi-phase processing. Falls back to simple Showdown
conversion if the parser is unavailable.

#### Parameters

##### content?

The markdown content to render

`string` | `null`

#### Returns

`Promise`\<`string`\>

The rendered HTML

#### Async

#### Examples

```ts
const html = await context.renderMarkdown('# Hello World');
// Returns: '<h1>Hello World</h1>'
```

```ts
// With plugins and variables
const html = await context.renderMarkdown('[{CurrentTimePlugin}]');
// Returns expanded plugin output
```

***

### toParseOptions()

> __toParseOptions__(): [`ParseOptions`](../interfaces/ParseOptions.md)

Defined in: [src/context/WikiContext.ts:315](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/context/WikiContext.ts#L315)

Creates the options object needed for the MarkupParser

Builds a comprehensive options object containing page context, user context,
request information, and engine reference for use during parsing.

#### Returns

[`ParseOptions`](../interfaces/ParseOptions.md)

Parse options object

#### Example

```ts
const options = context.toParseOptions();
const html = await parser.parse(content, options);
```
