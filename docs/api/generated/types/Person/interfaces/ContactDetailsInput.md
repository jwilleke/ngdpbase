[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Person](../README.md) / ContactDetailsInput

# Interface: ContactDetailsInput

Defined in: src/types/Person.ts:141

What `IdentityManager.updateContactDetails` takes (#2073): the parts of an
identity record a user keeps on /profile. A part left out is not touched;
a text given empty is removed.

## Properties

### address?

> `optional` __address?__: [`AddressInput`](AddressInput.md)

Defined in: src/types/Person.ts:149

The home address (`address`).

***

### emergency?

> `optional` __emergency?__: `object`

Defined in: src/types/Person.ts:147

The `emergency` ContactPoint: who to call, their phone and email.

#### email?

> `optional` __email?__: `string`

#### name?

> `optional` __name?__: `string`

#### phone?

> `optional` __phone?__: [`PhoneInput`](PhoneInput.md)

***

### familyName?

> `optional` __familyName?__: `string`

Defined in: src/types/Person.ts:143

***

### givenName?

> `optional` __givenName?__: `string`

Defined in: src/types/Person.ts:142

***

### image?

> `optional` __image?__: `string`

Defined in: src/types/Person.ts:155

A photo: a web address.

***

### knowsLanguage?

> `optional` __knowsLanguage?__: `string`[]

Defined in: src/types/Person.ts:153

Languages, each a name ("Spanish") or a tag ("es"); stored as tags.

***

### mailing?

> `optional` __mailing?__: [`AddressInput`](AddressInput.md)

Defined in: src/types/Person.ts:151

The `mailing` PostalAddress in `contactPoint`.

***

### phones?

> `optional` __phones?__: ([`PhoneInput`](PhoneInput.md) & `object`)[]

Defined in: src/types/Person.ts:145

Phones by `contactType` (`home`, `mobile`, `business`, `other`, or any other kind).

***

### sameAs?

> `optional` __sameAs?__: `string`[]

Defined in: src/types/Person.ts:157

Links: web addresses.
