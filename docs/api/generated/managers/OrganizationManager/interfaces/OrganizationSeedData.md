[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/OrganizationManager](../README.md) / OrganizationSeedData

# Interface: OrganizationSeedData

Defined in: src/managers/OrganizationManager.ts:34

Subset of install-form data this manager needs to seed the anchor org.
Kept narrow so InstallService and tests can pass plain objects without
importing the full InstallData type.

## Properties

### adminEmail?

> `optional` __adminEmail?__: `string`

Defined in: src/managers/OrganizationManager.ts:44

Email used for the install's primary technical contact.

***

### filename?

> `optional` __filename?__: `string`

Defined in: src/managers/OrganizationManager.ts:46

Filename to write under storagedir, e.g. "acme-corporation.json".

***

### orgAddressCountry?

> `optional` __orgAddressCountry?__: `string`

Defined in: src/managers/OrganizationManager.ts:42

***

### orgAddressLocality?

> `optional` __orgAddressLocality?__: `string`

Defined in: src/managers/OrganizationManager.ts:40

***

### orgAddressRegion?

> `optional` __orgAddressRegion?__: `string`

Defined in: src/managers/OrganizationManager.ts:41

***

### orgDescription?

> `optional` __orgDescription?__: `string`

Defined in: src/managers/OrganizationManager.ts:37

***

### orgFoundingDate?

> `optional` __orgFoundingDate?__: `string`

Defined in: src/managers/OrganizationManager.ts:38

***

### orgLegalName?

> `optional` __orgLegalName?__: `string`

Defined in: src/managers/OrganizationManager.ts:36

***

### orgName

> __orgName__: `string`

Defined in: src/managers/OrganizationManager.ts:35

***

### orgUrl?

> `optional` __orgUrl?__: `string`

Defined in: src/managers/OrganizationManager.ts:39
