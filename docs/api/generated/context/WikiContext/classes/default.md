[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [context/WikiContext](../README.md) / default

# Class: default

Defined in: src/context/WikiContext.ts:208

WikiContext - Encapsulates the context of a single request or rendering operation

Inspired by JSPWiki's WikiContext, this class provides a request-scoped container
for all contextual information needed during page rendering, including the engine,
current page, user, request/response objects, and manager references.

 WikiContext

## See

- [WikiEngine](../../../types/WikiEngine/interfaces/WikiEngine.md) for the main engine
- [RenderingManager](../../../managers/RenderingManager/classes/default.md) for rendering operations

## Extends

- [`BaseContext`](../../BaseContext/classes/BaseContext.md)

## Constructors

### Constructor

> __new default__(`engine`, `options?`): `WikiContext`

Defined in: src/context/WikiContext.ts:331

Creates a new WikiContext instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

##### options?

[`WikiContextOptions`](../interfaces/WikiContextOptions.md)

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

#### Overrides

[`BaseContext`](../../BaseContext/classes/BaseContext.md).[`constructor`](../../BaseContext/classes/BaseContext.md#constructor)

## Properties

### \_subject

> `protected` `readonly` __\_subject__: [`PermissionSubject`](../../../managers/UserManager/interfaces/PermissionSubject.md) \| `null`

Defined in: src/context/BaseContext.ts:48

The caller's subject as the middleware wrote it, or `null` for a context
built without one (a boot-time render, a test fixture).

Read it through [getActor](../../BaseContext/classes/BaseContext.md#getactor); that is the accessor callers and manager
doors use, and it is the one place the anonymous case is decided.

#### Inherited from

[`BaseContext`](../../BaseContext/classes/BaseContext.md).[`_subject`](../../BaseContext/classes/BaseContext.md#_subject)

***

### content

> `readonly` __content__: `string` \| `null`

Defined in: src/context/WikiContext.ts:240

Page content (markdown)

***

### context

> `readonly` __context__: `string`

Defined in: src/context/WikiContext.ts:234

The rendering context (VIEW, EDIT, PREVIEW, etc.)

***

### CONTEXT

> `readonly` `static` __CONTEXT__: [`ContextTypes`](../interfaces/ContextTypes.md)

Defined in: src/context/WikiContext.ts:215

Context type constants for different rendering modes

#### Static

***

### engine

> `readonly` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/context/WikiContext.ts:231

The wiki engine instance

***

### engineRef

> `protected` `readonly` __engineRef__: [`EngineLike`](../../BaseContext/interfaces/EngineLike.md)

Defined in: src/context/BaseContext.ts:50

#### Inherited from

[`BaseContext`](../../BaseContext/classes/BaseContext.md).[`engineRef`](../../BaseContext/classes/BaseContext.md#engineref)

***

### pageManager

> `readonly` __pageManager__: [`default`](../../../managers/PageManager/classes/default.md)

Defined in: src/context/WikiContext.ts:267

Reference to PageManager

***

### pageMetadata

> `readonly` __pageMetadata__: [`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md) \| `null`

Defined in: src/context/WikiContext.ts:295

Page front matter metadata — carries audience/access/user-keywords for ACL evaluation

***

### pageName

> `readonly` __pageName__: `string` \| `null`

Defined in: src/context/WikiContext.ts:237

Name of the current page

***

### pluginManager

> `readonly` __pluginManager__: [`default`](../../../managers/PluginManager/classes/default.md)

Defined in: src/context/WikiContext.ts:273

Reference to PluginManager

***

### policyInformationPoint

> `readonly` __policyInformationPoint__: [`default`](../../../security/PolicyInformationPoint/classes/default.md)

Defined in: src/context/WikiContext.ts:279

Reference to PolicyInformationPoint

***

### renderingManager

> `readonly` __renderingManager__: [`default`](../../../managers/RenderingManager/classes/default.md)

Defined in: src/context/WikiContext.ts:270

Reference to RenderingManager

***

### request

> `readonly` __request__: `Request`\<`ParamsDictionary`, `any`, `any`, `ParsedQs`, `Record`\<`string`, `any`\>\> \| `null`

Defined in: src/context/WikiContext.ts:261

Express request object

***

### response

> `readonly` __response__: `Response`\<`any`, `Record`\<`string`, `any`\>\> \| `null`

Defined in: src/context/WikiContext.ts:264

Express response object

***

### variableManager

> `readonly` __variableManager__: [`default`](../../../managers/VariableManager/classes/default.md)

Defined in: src/context/WikiContext.ts:276

Reference to VariableManager

## Accessors

### activeTheme

#### Get Signature

> __get__ __activeTheme__(): `string`

Defined in: src/context/WikiContext.ts:539

Active theme folder name (e.g. 'default', 'flatly').

Lazy: resolves from ConfigurationManager on first access and caches the
result. Permission-only callers (route handlers that just call hasRole /
hasPermission) never trigger the lookup.

##### Returns

`string`

***

### displayTheme

#### Get Signature

> __get__ __displayTheme__(): `string`

Defined in: src/context/WikiContext.ts:570

Returns the user's display theme preference ('light' | 'dark' | 'system')
Derived from userContext.preferences['display.theme']; defaults to 'system'.

##### Returns

`string`

***

### themeContext

#### Get Signature

> __get__ __themeContext__(): [`ThemeContext`](../interfaces/ThemeContext.md)

Defined in: src/context/WikiContext.ts:577

Returns a ThemeContext snapshot for use in parse options and variable context

##### Returns

[`ThemeContext`](../interfaces/ThemeContext.md)

***

### themeInfo

#### Get Signature

> __get__ __themeInfo__(): [`ThemeInfo`](../../../managers/ThemeManager/interfaces/ThemeInfo.md) \| `null`

Defined in: src/context/WikiContext.ts:555

Metadata from the active theme's theme.json.

Lazy: triggers theme resolution on first access (uses the engine-wide
`getThemeManager` cache). Returns the override if one was passed via
WikiContextOptions.

##### Returns

[`ThemeInfo`](../../../managers/ThemeManager/interfaces/ThemeInfo.md) \| `null`

***

### userContext

#### Get Signature

> __get__ __userContext__(): [`UserContext`](../interfaces/UserContext.md)

Defined in: src/context/WikiContext.ts:252

The caller's subject, as the middleware wrote it.

# 1399: stored once, on BaseContext, and read here under the name the
render path and the templates already use. A UserContext IS a
PermissionSubject plus display-only extras, so this is a view of the same
object — never a copy, which is what would drop `privateStoreHandle` and
make a sealed page vanish for its owner (#1382, #1173).

##### Returns

[`UserContext`](../interfaces/UserContext.md)

Current user context/session

## Methods

### canAccess()

> __canAccess__(`action`, `pageNameOverride?`): `Promise`\<`boolean`\>

Defined in: src/context/WikiContext.ts:463

Returns true if the current user is allowed to perform the given action
on the current page — or on a different page when `pageNameOverride` is
passed (#714 Slice B, the cross-page check used by linked-page visibility
filters and serveAttachment's owning-page lookup).

Delegates to [PolicyInformationPoint.checkPagePermissionWithContext](../../../security/PolicyInformationPoint/classes/default.md#checkpagepermissionwithcontext) for the
current page (the no-override fast path) and [PolicyInformationPoint.canUserAccessPage](../../../security/PolicyInformationPoint/classes/default.md#canuseraccesspage)
for cross-page checks (#714 Slice B — loads the target page's metadata
internally and runs the same evaluator).

Returns false if the WikiContext has no pageName (and no override) or no
PolicyInformationPoint.

#### Parameters

##### action

`string`

Page action (e.g., 'view', 'edit', 'delete')

##### pageNameOverride?

`string`

When set, check access on this page
  instead of `this.pageName`. Used for cross-page checks (e.g., a private
  attachment whose owning page is not the current request's page).

#### Returns

`Promise`\<`boolean`\>

true if access is allowed

#### Examples

```ts
if (await wikiContext.canAccess('edit')) { ... }
```

```ts
// Cross-page check (Slice B): can the current user view the page that
// owns this attachment? Used at WikiRoutes.serveAttachment to enforce
// private-page access for attachments whose owning page is private.
if (!(await wikiContext.canAccess('view', owningPageName))) {
  return 403;
}
```

***

### getActor()

> __getActor__(): [`PermissionSubject`](../../../managers/UserManager/interfaces/PermissionSubject.md)

Defined in: src/context/BaseContext.ts:77

The subject this context was handed, forwarded — never rebuilt.

A caller with no session is `ANONYMOUS_SUBJECT`: a real, named caller that
policy evaluates like any other, not an absence. That is why this returns
a subject rather than `null` — "nobody in particular" is an answer, and
making every call site invent its own fallback is how a default actor gets
introduced (P1).

The returned object is the stored reference. Do not copy it field by
field: a rebuilt subject drops whatever the copier did not think of, which
has so far been `viaToken` (#1173), `viaShare` (#1222) and
`privateStoreHandle` (#1382).

#### Returns

[`PermissionSubject`](../../../managers/UserManager/interfaces/PermissionSubject.md)

#### Inherited from

[`BaseContext`](../../BaseContext/classes/BaseContext.md).[`getActor`](../../BaseContext/classes/BaseContext.md#getactor)

***

### getContext()

> __getContext__(): `string`

Defined in: src/context/WikiContext.ts:389

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

### getPrincipals()

> __getPrincipals__(): `string`[]

Defined in: src/context/BaseContext.ts:187

The identifiers that match audience-style filters — every role, plus the
username when there is one. Used where running the full evaluator per
result would be too expensive (search filtering).

#### Returns

`string`[]

#### Inherited from

[`BaseContext`](../../BaseContext/classes/BaseContext.md).[`getPrincipals`](../../BaseContext/classes/BaseContext.md#getprincipals)

***

### hasPermission()

> __hasPermission__(`action`): `Promise`\<`boolean`\>

Defined in: src/context/BaseContext.ts:110

May this caller perform `action` at all? The canonical global check,
asked of the PDP (#1431 step 14): the token and share ceilings, then the
policies, with deny policies and role expansion.

For a check against a PAGE, ask [hasPermissionOn](../../BaseContext/classes/BaseContext.md#haspermissionon): the PDP then
reads the page's own attributes (its system-category, its owner) from the
PIP (#2255). Asked here, a page write (`page-edit`, `-delete`, `-rename`)
means "on some category", which is right for an affordance or a token's
scope and wrong for a door.

#### Parameters

##### action

`string`

#### Returns

`Promise`\<`boolean`\>

#### Inherited from

[`BaseContext`](../../BaseContext/classes/BaseContext.md).[`hasPermission`](../../BaseContext/classes/BaseContext.md#haspermission)

***

### hasPermissionOn()

> __hasPermissionOn__(`action`, `pageName`): `Promise`\<`boolean`\>

Defined in: src/context/BaseContext.ts:151

A capability asked about the page it is for (#1539, #2255). For a page in
a vault: the container rule first — the owner, never a role, the same
rule as Tier 0 of the page tiers — then the capability with the page's
`vault`, so a policy on the `vault` resource type (`vault-owner`)
decides. For any other page, the PDP is asked about the page by name and
reads its system-category and owner from the PIP, so the policies on its
category decide. A route that acts on a named page asks this instead of
the bare capability.

#### Parameters

##### action

`string`

##### pageName

`string`

#### Returns

`Promise`\<`boolean`\>

#### Inherited from

[`BaseContext`](../../BaseContext/classes/BaseContext.md).[`hasPermissionOn`](../../BaseContext/classes/BaseContext.md#haspermissionon)

***

### hasSubject()

> __hasSubject__(): `boolean`

Defined in: src/context/BaseContext.ts:95

True when a real subject was supplied — `getActor()` is not the anonymous fallback.

#### Returns

`boolean`

#### Inherited from

[`BaseContext`](../../BaseContext/classes/BaseContext.md).[`hasSubject`](../../BaseContext/classes/BaseContext.md#hassubject)

***

### holdsPermission()

> __holdsPermission__(`action`): `Promise`\<`boolean`\>

Defined in: src/context/BaseContext.ts:124

Does this request's subject HOLD the permission (#1635)? Policy alone,
without the step-up freshness rule — for affordances only (show this
button, show this section), so a person whose sign-in is not fresh still
sees the way to the prompt. A door or action asks [hasPermission](../../BaseContext/classes/BaseContext.md#haspermission).

#### Parameters

##### action

`string`

#### Returns

`Promise`\<`boolean`\>

#### Inherited from

[`BaseContext`](../../BaseContext/classes/BaseContext.md).[`holdsPermission`](../../BaseContext/classes/BaseContext.md#holdspermission)

***

### holdsPermissionOn()

> __holdsPermissionOn__(`action`, `pageName`): `Promise`\<`boolean`\>

Defined in: src/context/BaseContext.ts:172

[hasPermissionOn](../../BaseContext/classes/BaseContext.md#haspermissionon) as an affordance (#2255): does the subject HOLD
`action` on this page, policy alone, without the step-up rule? So the
step-up fallback of a page-scoped check asks about the same page.

#### Parameters

##### action

`string`

##### pageName

`string`

#### Returns

`Promise`\<`boolean`\>

#### Inherited from

[`BaseContext`](../../BaseContext/classes/BaseContext.md).[`holdsPermissionOn`](../../BaseContext/classes/BaseContext.md#holdspermissionon)

***

### mayShow()

> __mayShow__(`action`): `Promise`\<`boolean`\>

Defined in: src/context/WikiContext.ts:516

Would the current user be allowed this action on the current page — asked
only to decide whether to SHOW something (#1668): `<wiki:If
hasPermission:edit>` hiding a block. An affordance, never a door.

The same evaluator as [canAccess](#canaccess)'s same-page path, through
[PolicyInformationPoint.pageAffordance](../../../security/PolicyInformationPoint/classes/default.md#pageaffordance), so the two always agree; it
writes no audit record. Hiding content is not an attempt, and asking the
door here wrote an `authorization-deny` for every anonymous view of a page
using the tag. Anything that then ACTS asks [canAccess](#canaccess).

#### Parameters

##### action

`string`

Page action (e.g., 'view', 'edit')

#### Returns

`Promise`\<`boolean`\>

true if the door would allow the action

***

### renderMarkdown()

> __renderMarkdown__(`content?`): `Promise`\<`string`\>

Defined in: src/context/WikiContext.ts:605

Renders the provided markdown content through the full rendering pipeline

This method uses the MarkupParser for advanced parsing with plugin support,
variable expansion, and multi-phase processing. Falls back to plain markdown-it
conversion if the parser is unavailable.

#### Parameters

##### content?

`string` \| `null` = `...`

The markdown content to render

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

Defined in: src/context/WikiContext.ts:650

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

***

### userHasRole()

> `static` __userHasRole__(`userContext`, ...`names`): `boolean`

Defined in: src/context/WikiContext.ts:415

Static role check for callers that don't have a full WikiContext.

Useful for hot-path middleware (maintenance gate, /metrics) that runs on
every request and shouldn't pay the cost of constructing a WikiContext just
to ask "is this user an admin?". Same semantics as the instance `hasRole`.

#### Parameters

##### userContext

\{ `roles?`: `string`[]; \} \| `null` \| `undefined`

userContext-like object (or null/undefined)

##### names

...`string`[]

Role names (matches if user has at least one)

#### Returns

`boolean`

true if userContext.roles contains any of the given names

#### Example

```ts
if (WikiContext.userHasRole(req.userContext, 'admin')) { ... }
```
