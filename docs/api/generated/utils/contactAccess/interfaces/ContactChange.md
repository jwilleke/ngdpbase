[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/contactAccess](../README.md) / ContactChange

# Interface: ContactChange

Defined in: src/utils/contactAccess.ts:127

What a contacts record says was done. Names fields, never their values.

## Properties

### account?

> `optional` __account?__: `string`

Defined in: src/utils/contactAccess.ts:133

For a link: the account joined to the person.

***

### fields?

> `optional` __fields?__: `string`[]

Defined in: src/utils/contactAccess.ts:131

***

### id

> __id__: `string`

Defined in: src/utils/contactAccess.ts:130

***

### kind

> __kind__: `"person"` \| `"organization"`

Defined in: src/utils/contactAccess.ts:128

***

### operation

> __operation__: `"link"` \| `"update"` \| `"delete"` \| `"create"`

Defined in: src/utils/contactAccess.ts:129

***

### via?

> `optional` __via?__: `"admin"` \| `"email"`

Defined in: src/utils/contactAccess.ts:135

For a link: how it was confirmed, `admin` or `email`.
