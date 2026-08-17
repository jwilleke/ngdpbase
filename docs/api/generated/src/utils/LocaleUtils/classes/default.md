[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/utils/LocaleUtils](../README.md) / default

# Class: default

Defined in: [src/utils/LocaleUtils.ts:37](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/LocaleUtils.ts#L37)

Locale utilities for handling browser locale and internationalization

## Constructors

### Constructor

> __new default__(): `LocaleUtils`

#### Returns

`LocaleUtils`

## Methods

### formatDate()

> `static` __formatDate__(`date`, `locale`): `string`

Defined in: [src/utils/LocaleUtils.ts:162](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/LocaleUtils.ts#L162)

Format date using specified locale

#### Parameters

##### date

`Date`

Date to format

##### locale

`string` = `'en-US'`

Locale string

#### Returns

`string`

Formatted date string

***

### formatTime()

> `static` __formatTime__(`date`, `locale`): `string`

Defined in: [src/utils/LocaleUtils.ts:183](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/LocaleUtils.ts#L183)

Format time using specified locale

#### Parameters

##### date

`Date`

Date to format

##### locale

`string` = `'en-US'`

Locale string

#### Returns

`string`

Formatted time string

***

### getDateFormatFromLocale()

> `static` __getDateFormatFromLocale__(`locale`): `string`

Defined in: [src/utils/LocaleUtils.ts:112](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/LocaleUtils.ts#L112)

Get date format pattern based on locale

#### Parameters

##### locale

`string`

Locale string (e.g., 'en-US')

#### Returns

`string`

Date format pattern for user preferences

***

### getDateFormatOptions()

> `static` __getDateFormatOptions__(): `DateFormatOption`[]

Defined in: [src/utils/LocaleUtils.ts:202](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/LocaleUtils.ts#L202)

Get available date format options

#### Returns

`DateFormatOption`[]

Array of date format options

***

### getSupportedLocales()

> `static` __getSupportedLocales__(): `SupportedLocale`[]

Defined in: [src/utils/LocaleUtils.ts:218](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/LocaleUtils.ts#L218)

Get supported locales list

#### Returns

`SupportedLocale`[]

Array of supported locale objects

***

### getTimeFormatFromLocale()

> `static` __getTimeFormatFromLocale__(`locale`): `"12h"` \| `"24h"`

Defined in: [src/utils/LocaleUtils.ts:141](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/LocaleUtils.ts#L141)

Get time format preference based on locale

#### Parameters

##### locale

`string`

Locale string (e.g., 'en-US')

#### Returns

`"12h"` \| `"24h"`

Time format preference ('12h' or '24h')

***

### getTimezoneDisplayName()

> `static` __getTimezoneDisplayName__(`timezone`, `locale`): `string`

Defined in: [src/utils/LocaleUtils.ts:257](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/LocaleUtils.ts#L257)

Get timezone display name

#### Parameters

##### timezone

`string`

Timezone identifier (e.g., 'America/New_York')

##### locale

`string` = `'en-US'`

Locale for display name (default: 'en-US')

#### Returns

`string`

Human-readable timezone name

***

### isValidTimezone()

> `static` __isValidTimezone__(`timezone`): `boolean`

Defined in: [src/utils/LocaleUtils.ts:241](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/LocaleUtils.ts#L241)

Validate timezone string

#### Parameters

##### timezone

`string`

Timezone to validate

#### Returns

`boolean`

True if timezone is valid

***

### normalizeLocale()

> `static` __normalizeLocale__(`locale`): `string`

Defined in: [src/utils/LocaleUtils.ts:71](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/LocaleUtils.ts#L71)

Normalize locale string to standard format

#### Parameters

##### locale

`string`

Raw locale string

#### Returns

`string`

Normalized locale (e.g., 'en-US', 'fr-FR')

***

### parseAcceptLanguage()

> `static` __parseAcceptLanguage__(`acceptLanguage`): `string`

Defined in: [src/utils/LocaleUtils.ts:43](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/LocaleUtils.ts#L43)

Parse Accept-Language header to get preferred locale

#### Parameters

##### acceptLanguage

`string`

Accept-Language header value

#### Returns

`string`

Best matching locale (e.g., 'en-US', 'fr-FR', 'de-DE')
