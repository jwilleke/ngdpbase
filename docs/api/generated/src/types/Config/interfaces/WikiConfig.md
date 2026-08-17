[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/types/Config](../README.md) / WikiConfig

# Interface: WikiConfig

Defined in: [src/types/Config.ts:15](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L15)

Wiki configuration object

Represents the complete wiki configuration loaded from JSON files.
Configuration is hierarchical with app-default-config.json, app-custom-config.json,
and environment-specific overrides.

## Indexable

\[`key`: `string`\]: `unknown`

Additional configuration properties

## Properties

### ngdpbase.application.category

> __ngdpbase.application.category__: `string`

Defined in: [src/types/Config.ts:23](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L23)

Application category

***

### ngdpbase.application-name

> __ngdpbase.application-name__: `string`

Defined in: [src/types/Config.ts:17](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L17)

Application name

***

### ngdpbase.attachment.allowedtypes

> __ngdpbase.attachment.allowedtypes__: `string`

Defined in: [src/types/Config.ts:101](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L101)

Allowed attachment MIME types

***

### ngdpbase.attachment.enabled

> __ngdpbase.attachment.enabled__: `boolean`

Defined in: [src/types/Config.ts:89](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L89)

Attachment provider enabled

***

### ngdpbase.attachment.forcedownload

> __ngdpbase.attachment.forcedownload__: `boolean`

Defined in: [src/types/Config.ts:104](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L104)

Force download for attachments

***

### ngdpbase.attachment.maxsize

> __ngdpbase.attachment.maxsize__: `number`

Defined in: [src/types/Config.ts:98](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L98)

Maximum attachment size (bytes)

***

### ngdpbase.attachment.metadatafile

> __ngdpbase.attachment.metadatafile__: `string`

Defined in: [src/types/Config.ts:107](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L107)

Attachment metadata file

***

### ngdpbase.attachment.provider

> __ngdpbase.attachment.provider__: `string`

Defined in: [src/types/Config.ts:95](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L95)

Active attachment provider

***

### ngdpbase.attachment.provider.default

> __ngdpbase.attachment.provider.default__: `string`

Defined in: [src/types/Config.ts:92](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L92)

Default attachment provider

***

### ngdpbase.audit.provider

> __ngdpbase.audit.provider__: `string`

Defined in: [src/types/Config.ts:149](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L149)

Audit provider

***

### ngdpbase.audit.provider.default

> __ngdpbase.audit.provider.default__: `string`

Defined in: [src/types/Config.ts:152](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L152)

Audit provider default

***

### ngdpbase.base-url

> __ngdpbase.base-url__: `string`

Defined in: [src/types/Config.ts:29](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L29)

Base URL

***

### ngdpbase.cache.provider

> __ngdpbase.cache.provider__: `string`

Defined in: [src/types/Config.ts:143](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L143)

Cache provider

***

### ngdpbase.cache.provider.default

> __ngdpbase.cache.provider.default__: `string`

Defined in: [src/types/Config.ts:146](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L146)

Cache provider default

***

### ngdpbase.encoding

> __ngdpbase.encoding__: `string`

Defined in: [src/types/Config.ts:32](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L32)

Character encoding

***

### ngdpbase.favicon-path

> __ngdpbase.favicon-path__: `string`

Defined in: [src/types/Config.ts:20](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L20)

Favicon path

***

### ngdpbase.front-page

> __ngdpbase.front-page__: `string`

Defined in: [src/types/Config.ts:35](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L35)

Front page name

***

### ngdpbase.page.enabled

> __ngdpbase.page.enabled__: `boolean`

Defined in: [src/types/Config.ts:68](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L68)

Page provider enabled

***

### ngdpbase.page.provider

> __ngdpbase.page.provider__: `string`

Defined in: [src/types/Config.ts:74](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L74)

Active page provider

***

### ngdpbase.page.provider.default

> __ngdpbase.page.provider.default__: `string`

Defined in: [src/types/Config.ts:71](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L71)

Default page provider

***

### ngdpbase.page.provider.filesystem.autosave

> __ngdpbase.page.provider.filesystem.autosave__: `boolean`

Defined in: [src/types/Config.ts:86](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L86)

Auto-save enabled

***

### ngdpbase.page.provider.filesystem.encoding

> __ngdpbase.page.provider.filesystem.encoding__: `string`

Defined in: [src/types/Config.ts:83](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L83)

File encoding for pages

***

### ngdpbase.page.provider.filesystem.requiredpagesdir

> __ngdpbase.page.provider.filesystem.requiredpagesdir__: `string`

Defined in: [src/types/Config.ts:80](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L80)

Required pages directory

***

### ngdpbase.page.provider.filesystem.storagedir

> __ngdpbase.page.provider.filesystem.storagedir__: `string`

Defined in: [src/types/Config.ts:77](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L77)

Page storage directory

***

### ngdpbase.search.autocomplete.enabled

> __ngdpbase.search.autocomplete.enabled__: `boolean`

Defined in: [src/types/Config.ts:122](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L122)

Autocomplete enabled

***

### ngdpbase.search.autocomplete.minlength

> __ngdpbase.search.autocomplete.minlength__: `number`

Defined in: [src/types/Config.ts:125](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L125)

Autocomplete minimum length

***

### ngdpbase.search.enabled

> __ngdpbase.search.enabled__: `boolean`

Defined in: [src/types/Config.ts:110](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L110)

Search enabled

***

### ngdpbase.search.maxresults

> __ngdpbase.search.maxresults__: `number`

Defined in: [src/types/Config.ts:119](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L119)

Maximum search results

***

### ngdpbase.search.provider

> __ngdpbase.search.provider__: `string`

Defined in: [src/types/Config.ts:116](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L116)

Active search provider

***

### ngdpbase.search.provider.default

> __ngdpbase.search.provider.default__: `string`

Defined in: [src/types/Config.ts:113](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L113)

Default search provider

***

### ngdpbase.search.suggestions.enabled

> __ngdpbase.search.suggestions.enabled__: `boolean`

Defined in: [src/types/Config.ts:128](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L128)

Search suggestions enabled

***

### ngdpbase.search.suggestions.maxitems

> __ngdpbase.search.suggestions.maxitems__: `number`

Defined in: [src/types/Config.ts:131](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L131)

Maximum suggestion items

***

### ngdpbase.server.host

> __ngdpbase.server.host__: `string`

Defined in: [src/types/Config.ts:41](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L41)

Server host

***

### ngdpbase.server.port

> __ngdpbase.server.port__: `number`

Defined in: [src/types/Config.ts:38](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L38)

Server port

***

### ngdpbase.session.http-only

> __ngdpbase.session.http-only__: `boolean`

Defined in: [src/types/Config.ts:53](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L53)

Session HTTP only flag

***

### ngdpbase.session.max-age

> __ngdpbase.session.max-age__: `number`

Defined in: [src/types/Config.ts:47](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L47)

Session max age (milliseconds)

***

### ngdpbase.session.secret

> __ngdpbase.session.secret__: `string`

Defined in: [src/types/Config.ts:44](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L44)

Session secret

***

### ngdpbase.session.secure

> __ngdpbase.session.secure__: `boolean`

Defined in: [src/types/Config.ts:50](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L50)

Session secure flag (HTTPS only)

***

### ngdpbase.translator-reader.allow-html

> __ngdpbase.translator-reader.allow-html__: `boolean`

Defined in: [src/types/Config.ts:62](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L62)

Translator reader - allow HTML

***

### ngdpbase.translator-reader.camel-case-links

> __ngdpbase.translator-reader.camel-case-links__: `boolean`

Defined in: [src/types/Config.ts:59](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L59)

Translator reader - camel case links

***

### ngdpbase.translator-reader.match-english-plurals

> __ngdpbase.translator-reader.match-english-plurals__: `boolean`

Defined in: [src/types/Config.ts:56](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L56)

Translator reader - match English plurals

***

### ngdpbase.translator-reader.plain-uris

> __ngdpbase.translator-reader.plain-uris__: `boolean`

Defined in: [src/types/Config.ts:65](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L65)

Translator reader - plain URIs

***

### ngdpbase.user.provider

> __ngdpbase.user.provider__: `string`

Defined in: [src/types/Config.ts:134](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L134)

User provider

***

### ngdpbase.user.provider.default

> __ngdpbase.user.provider.default__: `string`

Defined in: [src/types/Config.ts:137](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L137)

User provider default

***

### ngdpbase.user.provider.storagedir

> __ngdpbase.user.provider.storagedir__: `string`

Defined in: [src/types/Config.ts:140](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L140)

User storage directory

***

### ngdpbase.version

> __ngdpbase.version__: `string`

Defined in: [src/types/Config.ts:26](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L26)

Application version
