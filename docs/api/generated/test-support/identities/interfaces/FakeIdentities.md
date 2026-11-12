[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [test-support/identities](../README.md) / FakeIdentities

# Interface: FakeIdentities

Defined in: src/test-support/identities.ts:15

## Properties

### canAnswer

> __canAnswer__: () => `boolean`

Defined in: src/test-support/identities.ts:18

Whether the identity store can answer lookups now (#2041): false when it
started degraded (no provider). A start-up conversion asks this first and
postpones the whole pass when it is false.

#### Returns

`boolean`

***

### conversionPass

> __conversionPass__: (`ctx`) => `object`

Defined in: src/test-support/identities.ts:20

One start-up conversion pass over stored references (#2097): `convert`
is [convertRecordedUser](../../../managers/IdentityManager/classes/default.md#convertrecordeduser)'s value, and `counts` tallies its outcomes
(values converted to an @id, orphans found or made, "no user recorded"
values) for the caller's counts-only report. When the store cannot
answer it throws `IdentityStoreUnavailableError`, so the caller postpones
its pass rather than skip a record.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`object`

##### convert

> __convert__: (`stored`) => `Promise`\<`string`\>

###### Parameters

###### stored

`string`

###### Returns

`Promise`\<`string`\>

##### counts

> __counts__: `object`

###### counts.converted

> __converted__: `number`

###### counts.noUser

> __noUser__: `number`

###### counts.orphans

> __orphans__: `number`

***

### convertRecordedUser

> __convertRecordedUser__: (`ctx`, `stored`) => `Promise`\<\{ `outcome`: `"orphan"` \| `"kept"` \| `"converted"` \| `"orphaned"` \| `"no-user"`; `value`: `string`; \}\>

Defined in: src/test-support/identities.ts:19

[convertReference](../../../managers/IdentityManager/classes/default.md#convertreference) for records that may hold a value meaning "no
user was recorded" (#2097): `migrated`, `unknown`, `import`
(NO\_RECORDED\_USER) become `orphan:<value>` without a lookup,
outcome `no-user`, so an account that later takes one of those names
gains nothing, and the caller does not count them as needing attention.
Everything else is `convertReference`'s, and throws as it does.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### stored

`string`

#### Returns

`Promise`\<\{ `outcome`: `"orphan"` \| `"kept"` \| `"converted"` \| `"orphaned"` \| `"no-user"`; `value`: `string`; \}\>

***

### convertReference

> __convertReference__: (`ctx`, `stored`) => `Promise`\<\{ `outcome`: `"orphan"` \| `"kept"` \| `"converted"` \| `"orphaned"`; `value`: `string`; \}\>

Defined in: src/test-support/identities.ts:17

What a stored reference to a user should become, for a start-up
conversion (#2041). `stored` is what a record holds today:

- an `@id` (`urn:`), an orphan (`orphan:<name>`), `anonymous`, the
  system principal or an empty value: `kept` (`orphan` when it is an
  orphan, so the caller can count them);
- a username with an account: that identity's `@id`, `converted`;
- a username with no account: `orphan:<name>`, `orphaned`. The record is
  then nobody's: a later account with the same name never takes it over,
  and no "is it mine" check matches it.

Throws when the identity store cannot answer (and so does nothing to the
record): the caller postpones its whole pass to the next start, rather
than orphan a name it could not look up. Ask [canAnswer](../../../managers/IdentityManager/classes/default.md#cananswer) first.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### stored

`string`

#### Returns

`Promise`\<\{ `outcome`: `"orphan"` \| `"kept"` \| `"converted"` \| `"orphaned"`; `value`: `string`; \}\>

***

### describeReference

> __describeReference__: (`ctx`, `stored`) => `Promise`\<`string`\>

Defined in: src/test-support/identities.ts:25

How a stored reference to a user is shown to people (#2097, operator
2026-10-26): the username followed by the id, `jim (urn:uuid:3f6c…)`. An
orphan shows as `jim (no account)`, an `@id` whose account is gone as
`urn:uuid:… (no account)`; anything else (a username not yet converted,
`anonymous`, the system principal) as it is. Resolved when shown, never
stored. Never throws for a store that is down.

`ctx` is whoever the name is shown to. Showing who wrote a page needs no
`identity-read`: only the username and the id are shown, as a page always
showed its author's username, so the record is read as core's own lookup
(the system context, naming the caller in its reason).

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### stored

`unknown`

#### Returns

`Promise`\<`string`\>

***

### identityIdOf

> __identityIdOf__: (`ctx`, `username`) => `Promise`\<`string` \| `null`\>

Defined in: src/test-support/identities.ts:16

The `@id` of the user `username`'s identity record, or null (#2041): null
when there is no account by that name, and null when the identity store
cannot answer (degraded, unreadable), logged without the name. The door
for a write or a record that refers to a user: it then keeps working as
it does for a name with no account, and never fails because the identity
store is down. Read as [getByUserIdentifier](../../../managers/IdentityManager/classes/default.md#getbyuseridentifier), which a caller that
must tell "no account" from "cannot answer" uses instead (a start-up
conversion, with [canAnswer](../../../managers/IdentityManager/classes/default.md#cananswer)). A refusal still throws.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### username

`string`

#### Returns

`Promise`\<`string` \| `null`\>

***

### lookups

> __lookups__: `string`[]

Defined in: src/test-support/identities.ts:29

Every username looked up, in order.

***

### referencesOf

> __referencesOf__: (`ctx`, `username`) => `Promise`\<`string`[]\>

Defined in: src/test-support/identities.ts:23

The stored values that name the user `username` (#2097): their identity
`@id` and, for records not yet converted, their username — the batch form
of [refersTo](../../../managers/IdentityManager/classes/default.md#refersto), for a list filter that compares many records (the
page index, the search index). A "no user recorded" name is left out, and
no orphan is ever in it. Only the username when the store cannot answer.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### username

`string` \| `null` \| `undefined`

#### Returns

`Promise`\<`string`[]\>

***

### refersTo

> __refersTo__: (`ctx`, `stored`, `username`) => `Promise`\<`boolean`\>

Defined in: src/test-support/identities.ts:22

Whether a stored reference names the user `username` (#2097): it is their
identity `@id`, or, on a record not yet converted, their username. An
orphan (`orphan:<name>`) and a "no user recorded" value never match
anyone, so a later account with the same name inherits nothing. The `@id`
is looked up with [identityIdOf](../../../managers/IdentityManager/classes/default.md#identityidof): false when the store cannot answer.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### stored

`unknown`

##### username

`string` \| `null` \| `undefined`

#### Returns

`Promise`\<`boolean`\>

***

### storedReferenceOf

> __storedReferenceOf__: (`ctx`, `username`) => `Promise`\<`string`\>

Defined in: src/test-support/identities.ts:21

What a new record stores for the user `username` (#2097): their identity
`@id`; a "no user recorded" value (`migrated`, `unknown`, `import`) as
its orphan form, so no account ever gains it; a principal (`anonymous`,
the system principal), an `@id` or an orphan as it is; a name with no
account, or any name when the store cannot answer ([identityIdOf](../../../managers/IdentityManager/classes/default.md#identityidof)),
as given. The one rule for page authors and editors, tombstones and file
uploaders.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### username

`string`

#### Returns

`Promise`\<`string`\>

***

### usernameOf

> __usernameOf__: (`ctx`, `stored`) => `Promise`\<`string` \| `null`\>

Defined in: src/test-support/identities.ts:24

The username a stored reference names (#2097), for code that needs the
sign-in name (a vault path, a preference): an `@id` gives its account's
username, an orphan gives null, anything else (a username not yet
converted, `anonymous`, the system principal) is returned as it is. Null
for an `@id` with no account (deleted, or a contact's) and when the store
cannot answer, logged without the value; a refusal still throws.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### stored

`unknown`

#### Returns

`Promise`\<`string` \| `null`\>

## Methods

### getById()

> __getById__(`ctx`, `id`): `Promise`\<\{ `@id`: `string`; `identifier`: `string`; \} \| `null`\>

Defined in: src/test-support/identities.ts:26

#### Parameters

##### ctx

`unknown`

##### id

`string`

#### Returns

`Promise`\<\{ `@id`: `string`; `identifier`: `string`; \} \| `null`\>

***

### getByUserIdentifier()

> __getByUserIdentifier__(`ctx`, `username`): `Promise`\<\{ `@id`: `string`; `identifier`: `string`; \} \| `null`\>

Defined in: src/test-support/identities.ts:27

#### Parameters

##### ctx

`unknown`

##### username

`string`

#### Returns

`Promise`\<\{ `@id`: `string`; `identifier`: `string`; \} \| `null`\>
