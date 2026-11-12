[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/PageManager](../README.md) / AuthorshipConversion

# Interface: AuthorshipConversion

Defined in: src/managers/PageManager.ts:457

What one authorship conversion pass did (#2097), counts only.

## Properties

### converted

> __converted__: `number`

Defined in: src/managers/PageManager.ts:468

***

### full

> __full__: `boolean`

Defined in: src/managers/PageManager.ts:461

Every page visited (`full`), or only those whose index entry still names a username.

***

### ms

> __ms__: `number`

Defined in: src/managers/PageManager.ts:477

***

### noUser

> __noUser__: `number`

Defined in: src/managers/PageManager.ts:472

***

### orphans

> __orphans__: `number`

Defined in: src/managers/PageManager.ts:469

***

### pagesChanged

> __pagesChanged__: `number`

Defined in: src/managers/PageManager.ts:463

***

### pagesRefused

> __pagesRefused__: `number`

Defined in: src/managers/PageManager.ts:465

Pages whose frontmatter could not be rewritten line by line, left as they are.

***

### pagesSkipped

> __pagesSkipped__: `number`

Defined in: src/managers/PageManager.ts:474

Pages and tombstones skipped for their own reason (a file that cannot be read or written, a full disk, a vault that cannot be opened).

***

### pagesVisited

> __pagesVisited__: `number`

Defined in: src/managers/PageManager.ts:462

***

### shippedOrphans

> __shippedOrphans__: `number`

Defined in: src/managers/PageManager.ts:471

Orphans on shipped (documentation, system) and add-on pages: their author is upstream's, not a site user; not needing attention.

***

### skipErrors

> __skipErrors__: `string`[]

Defined in: src/managers/PageManager.ts:476

The error class of each skip (`EACCES`, `ENOSPC`, ...), never a message, name or path.

***

### status

> __status__: `"done"` \| `"postponed"`

Defined in: src/managers/PageManager.ts:459

`done`, or `postponed` when the identity store could not answer.

***

### tombstonesChanged

> __tombstonesChanged__: `number`

Defined in: src/managers/PageManager.ts:467

***

### versionsChanged

> __versionsChanged__: `number`

Defined in: src/managers/PageManager.ts:466
