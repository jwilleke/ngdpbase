[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AddonsManager](../README.md) / flattenDottedKeys

# Function: flattenDottedKeys()

> __flattenDottedKeys__(`obj`, `prefix?`): `Record`\<`string`, `unknown`\>

Defined in: src/managers/AddonsManager.ts:106

Flatten nested plain-object values into dotted-key form (#534 defensive).

`express.urlencoded({ extended: true })` keeps dotted form-field names FLAT
by default — `<input name="journal.x">` → `body['journal.x']` directly,
NOT `body.journal.x`. (Verified: qs's `allowDots` defaults to false, and
body-parser doesn't override that.) But the WikiRoutes core code defends
against a future config change with its own `getBodyValue` walker, and
`AddonsManager.saveProfileSections` normalizes addon-bound body shape so
addon authors can rely on flat lookups regardless of host config.

Rules:

- Non-object values (string, number, boolean, null, undefined) pass
    through as-is at the current dotted key.
- Arrays pass through as-is (not flattened element-wise — qs already
    produces sensible array shapes for `name="x[]"` inputs).
- Plain objects are recursively flattened.
- Flat dotted keys present on the input pass through unchanged.
- If both flat (`'a.b': X`) and nested (`a: { b: Y }`) shapes are
    present, the LAST seen during iteration wins — typically the nested
    value, since flat dotted keys are inserted before nested objects in
    qs output. This is intentional: nested is the more-specific shape.

## Parameters

### obj

`Record`\<`string`, `unknown`\>

### prefix?

`string` = `''`

## Returns

`Record`\<`string`, `unknown`\>
