[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/LocaleUtils](../README.md) / default

# Class: default

Defined in: src/utils/LocaleUtils.ts:37

Locale utilities for handling browser locale and internationalization

## Constructors

### Constructor

> __new default__(): `LocaleUtils`

#### Returns

`LocaleUtils`

## Methods

### formatDate()

> `static` __formatDate__(`date`, `locale?`): `string`

Defined in: src/utils/LocaleUtils.ts:162

Format date using specified locale

#### Parameters

##### date

`Date`

Date to format

##### locale?

`string` = `'en-US'`

Locale string

#### Returns

`string`

Formatted date string

***

### formatDateWithPattern()

> `static` __formatDateWithPattern__(`date`, `pattern`, `timezone?`): `string`

Defined in: src/utils/LocaleUtils.ts:185

Format date using an explicit pattern string (e.g. 'yyyy-MM-dd').
Supports the subset of patterns offered in the profile date-format picker.

#### Parameters

##### date

`Date`

Date to format

##### pattern

`string`

Format pattern ('yyyy-MM-dd', 'MM/dd/yyyy', 'dd/MM/yyyy', 'dd.MM.yyyy', 'yyyy/MM/dd')

##### timezone?

`string`

Optional IANA timezone (e.g. 'America/New_York', 'UTC')

#### Returns

`string`

Formatted date string

***

### formatTime()

> `static` __formatTime__(`date`, `locale?`): `string`

Defined in: src/utils/LocaleUtils.ts:255

Format time using specified locale

#### Parameters

##### date

`Date`

Date to format

##### locale?

`string` = `'en-US'`

Locale string

#### Returns

`string`

Formatted time string

***

### formatTimeWithPrefs()

> `static` __formatTimeWithPrefs__(`date`, `timeFormat`, `locale?`, `timezone?`): `string`

Defined in: src/utils/LocaleUtils.ts:229

Format time honoring an explicit 12h/24h preference and optional timezone.

#### Parameters

##### date

`Date`

Date to format

##### timeFormat

`string`

'12h' or '24h'

##### locale?

`string` = `'en-US'`

Locale string (used for AM/PM labels in 12h mode)

##### timezone?

`string`

Optional IANA timezone

#### Returns

`string`

Formatted time string

***

### getDateFormatFromLocale()

> `static` __getDateFormatFromLocale__(`locale`): `string`

Defined in: src/utils/LocaleUtils.ts:112

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

Defined in: src/utils/LocaleUtils.ts:274

Get available date format options

#### Returns

`DateFormatOption`[]

Array of date format options

***

### getSupportedLocales()

> `static` __getSupportedLocales__(): `SupportedLocale`[]

Defined in: src/utils/LocaleUtils.ts:290

Get supported locales list

#### Returns

`SupportedLocale`[]

Array of supported locale objects

***

### getTimeFormatFromLocale()

> `static` __getTimeFormatFromLocale__(`locale`): `"24h"` \| `"12h"`

Defined in: src/utils/LocaleUtils.ts:141

Get time format preference based on locale

#### Parameters

##### locale

`string`

Locale string (e.g., 'en-US')

#### Returns

`"24h"` \| `"12h"`

Time format preference ('12h' or '24h')

***

### getTimezoneDisplayName()

> `static` __getTimezoneDisplayName__(`timezone`, `locale?`): `string`

Defined in: src/utils/LocaleUtils.ts:329

Get timezone display name

#### Parameters

##### timezone

`string`

Timezone identifier (e.g., 'America/New_York')

##### locale?

`string` = `'en-US'`

Locale for display name (default: 'en-US')

#### Returns

`string`

Human-readable timezone name

***

### isValidTimezone()

> `static` __isValidTimezone__(`timezone`): `boolean`

Defined in: src/utils/LocaleUtils.ts:313

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

Defined in: src/utils/LocaleUtils.ts:71

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

Defined in: src/utils/LocaleUtils.ts:43

Parse Accept-Language header to get preferred locale

#### Parameters

##### acceptLanguage

`string`

Accept-Language header value

#### Returns

`string`

Best matching locale (e.g., 'en-US', 'fr-FR', 'de-DE')
