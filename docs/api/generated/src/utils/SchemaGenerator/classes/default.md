[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/utils/SchemaGenerator](../README.md) / default

# Class: default

Defined in: [src/utils/SchemaGenerator.ts:130](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/SchemaGenerator.ts#L130)

SchemaGenerator - Generates Schema.org JSON-LD markup from page metadata
Provides SEO and semantic web benefits for ngdpbase platform

## Constructors

### Constructor

> __new default__(): `SchemaGenerator`

#### Returns

`SchemaGenerator`

## Methods

### determineSchemaType()

> `static` __determineSchemaType__(`pageData`): `string`

Defined in: [src/utils/SchemaGenerator.ts:212](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/SchemaGenerator.ts#L212)

Determine appropriate Schema.org type based on page metadata

#### Parameters

##### pageData

`PageData`

Page metadata

#### Returns

`string`

Schema.org type

***

### enhanceCreativeWork()

> `static` __enhanceCreativeWork__(`schema`, `pageData`, `_options`): `BaseSchema`

Defined in: [src/utils/SchemaGenerator.ts:286](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/SchemaGenerator.ts#L286)

Enhance CreativeWork schema for project pages

#### Parameters

##### schema

`BaseSchema`

##### pageData

`PageData`

##### \_options

`SchemaOptions`

#### Returns

`BaseSchema`

***

### enhanceSchemaByType()

> `static` __enhanceSchemaByType__(`baseSchema`, `pageData`, `options`): `BaseSchema`

Defined in: [src/utils/SchemaGenerator.ts:251](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/SchemaGenerator.ts#L251)

Enhance schema based on determined type

#### Parameters

##### baseSchema

`BaseSchema`

Base schema object

##### pageData

`PageData`

Page metadata

##### options

`SchemaOptions`

Generation options

#### Returns

`BaseSchema`

Enhanced schema object

***

### enhanceTechArticle()

> `static` __enhanceTechArticle__(`schema`, `pageData`, `_options`): `BaseSchema`

Defined in: [src/utils/SchemaGenerator.ts:270](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/SchemaGenerator.ts#L270)

Enhance TechArticle schema for documentation

#### Parameters

##### schema

`BaseSchema`

##### pageData

`PageData`

##### \_options

`SchemaOptions`

#### Returns

`BaseSchema`

***

### enhanceWebPage()

> `static` __enhanceWebPage__(`schema`, `pageData`, `options`): `BaseSchema`

Defined in: [src/utils/SchemaGenerator.ts:302](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/SchemaGenerator.ts#L302)

Enhance WebPage schema for wiki pages

#### Parameters

##### schema

`BaseSchema`

##### pageData

`PageData`

##### options

`SchemaOptions`

#### Returns

`BaseSchema`

***

### generateACLBasedPermissions()

> `static` __generateACLBasedPermissions__(`pageACL`, `userManager`, `_options`): `unknown`[]

Defined in: [src/utils/SchemaGenerator.ts:708](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/SchemaGenerator.ts#L708)

Generate permissions based on parsed page ACL

#### Parameters

##### pageACL

`ParsedACL`

Parsed ACL object

##### userManager

`unknown`

UserManager instance

##### \_options

`SchemaOptions`

#### Returns

`unknown`[]

Array of DigitalDocumentPermission objects

***

### generateComprehensiveSchema()

> `static` __generateComprehensiveSchema__(`siteData`, `options`): (`Record`\<`string`, `unknown`\> \| `BaseSchema`)[]

Defined in: [src/utils/SchemaGenerator.ts:785](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/SchemaGenerator.ts#L785)

Generate comprehensive site schema using Schema.org compliant data

#### Parameters

##### siteData

`SiteData`

Combined data from SchemaManager

##### options

`SchemaOptions` = `{}`

Generation options

#### Returns

(`Record`\<`string`, `unknown`\> \| `BaseSchema`)[]

Array of schema objects

***

### generateDeveloperPermissions()

> `static` __generateDeveloperPermissions__(`_pageData`, `_userManager`, `_options`): `unknown`[]

Defined in: [src/utils/SchemaGenerator.ts:668](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/SchemaGenerator.ts#L668)

Generate permissions for Developer category pages

#### Parameters

##### \_pageData

`PageData`

##### \_userManager

`unknown`

##### \_options

`SchemaOptions`

#### Returns

`unknown`[]

Array of DigitalDocumentPermission objects

***

### generateDigitalDocumentPermissions()

> `static` __generateDigitalDocumentPermissions__(`pageData`, `_user`, `options`): `unknown`[]

Defined in: [src/utils/SchemaGenerator.ts:468](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/SchemaGenerator.ts#L468)

Generate DigitalDocumentPermission objects for a page

#### Parameters

##### pageData

`PageData`

Page metadata and content

##### \_user

`unknown`

##### options

`SchemaOptions` = `{}`

Generation options (must include engine)

#### Returns

`unknown`[]

Array of DigitalDocumentPermission objects

***

### generateDocumentationPermissions()

> `static` __generateDocumentationPermissions__(`_pageData`, `_userManager`, `_options`): `unknown`[]

Defined in: [src/utils/SchemaGenerator.ts:628](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/SchemaGenerator.ts#L628)

Generate permissions for Documentation category pages

#### Parameters

##### \_pageData

`PageData`

##### \_userManager

`unknown`

##### \_options

`SchemaOptions`

#### Returns

`unknown`[]

Array of DigitalDocumentPermission objects

***

### generateGeneralPagePermissions()

> `static` __generateGeneralPagePermissions__(`_pageData`, `_userManager`, `_options`): `unknown`[]

Defined in: [src/utils/SchemaGenerator.ts:528](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/SchemaGenerator.ts#L528)

Generate permissions for General category pages (user content)

#### Parameters

##### \_pageData

`PageData`

##### \_userManager

`unknown`

##### \_options

`SchemaOptions`

#### Returns

`unknown`[]

Array of DigitalDocumentPermission objects

***

### generateOrganizationSchema()

> `static` __generateOrganizationSchema__(`organizationData`, `options`): `Record`\<`string`, `unknown`\>

Defined in: [src/utils/SchemaGenerator.ts:395](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/SchemaGenerator.ts#L395)

Generate Organization schema from Schema.org compliant organization data

#### Parameters

##### organizationData

`OrganizationData`

Schema.org Organization data

##### options

`SchemaOptions` = `{}`

Generation options

#### Returns

`Record`\<`string`, `unknown`\>

Organization schema object

***

### generatePageSchema()

> `static` __generatePageSchema__(`pageData`, `options`): `BaseSchema`

Defined in: [src/utils/SchemaGenerator.ts:137](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/SchemaGenerator.ts#L137)

Generate Schema.org markup for a wiki page

#### Parameters

##### pageData

`PageData`

Page metadata and content

##### options

`SchemaOptions` = `{}`

Generation options (should include engine and user for permissions)

#### Returns

`BaseSchema`

JSON-LD schema object

***

### generatePermissionsByContext()

> `static` __generatePermissionsByContext__(`pageData`, `pageACL`, `userManager`, `_aclManager`, `options`): `unknown`[]

Defined in: [src/utils/SchemaGenerator.ts:501](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/SchemaGenerator.ts#L501)

Generate permissions based on page category and protection level

#### Parameters

##### pageData

`PageData`

Page metadata

##### pageACL

Parsed ACL from page content

`ParsedACL` | `null`

##### userManager

`unknown`

UserManager instance

##### \_aclManager

`unknown`

##### options

`SchemaOptions`

Generation options

#### Returns

`unknown`[]

Array of DigitalDocumentPermission objects

***

### generatePersonSchema()

> `static` __generatePersonSchema__(`personData`, `options`): `Record`\<`string`, `unknown`\>

Defined in: [src/utils/SchemaGenerator.ts:377](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/SchemaGenerator.ts#L377)

Generate Person schema from Schema.org compliant person data

#### Parameters

##### personData

`PersonData`

Schema.org Person data

##### options

`SchemaOptions` = `{}`

Generation options

#### Returns

`Record`\<`string`, `unknown`\>

Person schema object

***

### generateScriptTag()

> `static` __generateScriptTag__(`schema`): `string`

Defined in: [src/utils/SchemaGenerator.ts:357](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/SchemaGenerator.ts#L357)

Generate JSON-LD script tag for HTML injection

#### Parameters

##### schema

Schema.org object

`Record`\<`string`, `unknown`\> | `BaseSchema`

#### Returns

`string`

HTML script tag

***

### generateSiteSchema()

> `static` __generateSiteSchema__(`pages`, `options`): `BaseSchema`[]

Defined in: [src/utils/SchemaGenerator.ts:367](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/SchemaGenerator.ts#L367)

Generate schema for multiple pages (site-wide)

#### Parameters

##### pages

`PageData`[]

Array of page data objects

##### options

`SchemaOptions` = `{}`

Generation options

#### Returns

`BaseSchema`[]

Array of schema objects

***

### generateSoftwareSchema()

> `static` __generateSoftwareSchema__(`configData`, `options`): `BaseSchema`

Defined in: [src/utils/SchemaGenerator.ts:413](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/SchemaGenerator.ts#L413)

Generate SoftwareApplication schema from wiki configuration

#### Parameters

##### configData

`ConfigData`

Configuration from wiki.json

##### options

`SchemaOptions` = `{}`

Generation options

#### Returns

`BaseSchema`

SoftwareApplication schema object

***

### generateSystemPagePermissions()

> `static` __generateSystemPagePermissions__(`_pageData`, `_userManager`, `_options`): `unknown`[]

Defined in: [src/utils/SchemaGenerator.ts:596](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/SchemaGenerator.ts#L596)

Generate permissions for System category pages (app-managed)

#### Parameters

##### \_pageData

`PageData`

##### \_userManager

`unknown`

##### \_options

`SchemaOptions`

#### Returns

`unknown`[]

Array of DigitalDocumentPermission objects

***

### mapPrincipalToGrantee()

> `static` __mapPrincipalToGrantee__(`principal`, `userManager`): \{ `@type`: `string`; `audienceType?`: `string`; `name?`: `string`; \} \| `null`

Defined in: [src/utils/SchemaGenerator.ts:748](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/SchemaGenerator.ts#L748)

Map ACL principal to Schema.org grantee object

#### Parameters

##### principal

`string`

ACL principal (user, role, or special)

##### userManager

`unknown`

UserManager instance

#### Returns

\{ `@type`: `string`; `audienceType?`: `string`; `name?`: `string`; \} \| `null`

Schema.org Person or Audience object
