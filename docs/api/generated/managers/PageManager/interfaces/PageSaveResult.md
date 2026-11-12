[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/PageManager](../README.md) / PageSaveResult

# Interface: PageSaveResult

Defined in: src/managers/PageManager.ts:213

What [PageManager.savePage](../classes/default.md#savepage) wrote.

## Properties

### content

> __content__: `string`

Defined in: src/managers/PageManager.ts:215

The body as saved — always the caller's text: a save never rewrites it (#1332).

***

### name

> __name__: `string`

Defined in: src/managers/PageManager.ts:217

Where the page landed (#1462): its title, or its private path (#1456).

***

### normalisedTitleFrom

> __normalisedTitleFrom__: `string` \| `null`

Defined in: src/managers/PageManager.ts:229

What the source called this page, when `normaliseTitle` rewrote a title
that broke the rule (#1455). Null when nothing was rewritten. A funnel
names it in its report — a page whose title changed under the reader's
feet is a fact they are owed.

***

### previousName

> __previousName__: `string` \| `null`

Defined in: src/managers/PageManager.ts:220

The name it had before this save; null for a new page.

***

### previousReferrers

> __previousReferrers__: `string`[]

Defined in: src/managers/PageManager.ts:222

Pages that linked to the old name, read before a rename took it out of the link graph (#1094).

***

### uuid

> __uuid__: `string`

Defined in: src/managers/PageManager.ts:218
