---
name: ACLManager
description: "Per-page access control: private/author-lock/audience/role-policy evaluation via the canonical wikiContext.canAccess facade"
dateModified: '2026-05-22'
category: managers
code: src/managers/ACLManager.ts
---

# ACLManager

__Module:__ `src/managers/ACLManager.ts`
__Extends:__ [BaseManager](BaseManager.md)
__Complete Guide:__ [ACLManager-Complete-Guide.md](ACLManager-Complete-Guide.md)

---

## Overview

ACLManager runs the per-page access-control evaluator. Every page action (`view` / `edit` / `delete` / `rename` / `upload`) flows through one of three public entry points and is decided by a six-step tier ladder. The evaluator is the __single source of truth__ for ACL decisions (the EPIC #714 unification, complete v3.37.0); route handlers and other managers consume it via the public methods below, not by re-implementing private-page or author-lock checks of their own.

## Key Features

- __Six-tier evaluator__ — Tier 0 private → Tier 0.5 author-lock → Tier 1 frontmatter → Tier 2 global policies → Tier 3 ACL markup → default deny
- __Rich-return form__ (`evaluatePagePermission`) returns `{ allowed, reason }` so callers can specialise 403 messages on the reason
- __Cross-page check__ (`canUserAccessPage`) for "can user X view page Y" lookups (linked-page filters, attachment owning-page resolution)
- __JSPWiki-style ACL markup__: `[{ALLOW view Admin}]` (__deprecated; Tier 3 scheduled for removal per [#778](https://github.com/jwilleke/ngdpbase/issues/778)__). Blocked on new saves; remaining ~13 jimstest pages will be migrated to the modern frontmatter `audience` / `access` pattern (see [`docs/proper-documentation-pages.md` § Page Access Control](../proper-documentation-pages.md#page-access-control))
- Integration with [PolicyEvaluator](PolicyEvaluator.md) for global policies at Tier 2
- Audit logging of every decision (allow + deny) via `logAccessDecision`

## Public API surface

```typescript
// Boolean form — back-compat thin wrapper. Use when you only care
// about allow vs deny.
async checkPagePermissionWithContext(wikiContext: WikiContext, action: string): Promise<boolean>;

// Rich form — returns the matching tier's `reason` so callers can
// specialise their 403 message (e.g. `'author_lock_deny'` → render the
// specific "This page is author-locked..." message). Added in #714 Slice F.
async evaluatePagePermission(wikiContext: WikiContext, action: string): Promise<{ allowed: boolean; reason: string }>;

// Cross-page check — loads target page's metadata internally. Used by
// linked-page filters and attachment owning-page resolution.
// Added in #714 Slice B.
async canUserAccessPage(userContext: UserContext | null, pageName: string, action: string): Promise<boolean>;
// #1219 — rule 10's filter: the same tiers over many pages, from the in-memory index, no log or audit record per page
async filterAccessiblePages(userContext: UserContext | null, action: string, candidates: Array<{ title: string; metadata: PageFrontmatter | null }>): Promise<string[]>;
// #1223 — the media door's question: share ceiling on the item, then the linked page's own rules
async canUserAccessMediaItem(userContext: UserContext | null, item: MediaItem): Promise<boolean>;
```

Most callers should reach the evaluator through the canonical facade __`WikiContext.canAccess(action, pageNameOverride?)`__ (`src/context/WikiContext.ts`) instead of importing `ACLManager` directly — it handles the same-page-vs-cross-page routing and per-context memoization for free.

## Quick Example

```javascript
const aclManager = engine.getManager('ACLManager');

// Most common — boolean decision for the current page in the WikiContext
const canEdit = await aclManager.checkPagePermissionWithContext(wikiContext, 'edit');

// When the route needs to specialise a 403 message
const { allowed, reason } = await aclManager.evaluatePagePermission(wikiContext, 'edit');
if (!allowed) {
  const msg = reason === 'author_lock_deny'
    ? 'This page is author-locked. Only the page author and administrators can edit it.'
    : 'You do not have permission to edit this page';
  return renderError(req, res, 403, 'Access Denied', msg);
}

// Cross-page check (linked attachment, sidebar visibility filter, …)
const canSeeLinkedPage = await aclManager.canUserAccessPage(
  wikiContext.userContext,
  linkedPageName,
  'view'
);

// Parse legacy ACL markup (Tier 3; deprecated on new saves)
const acl = aclManager.parsePageACL('[{ALLOW view All}] [{ALLOW edit Admin}]');
```

## Supported Actions

| Action | Maps To | Description |
| -------- | --------- | ------------- |
| `view` | `page-read` | Read page content |
| `edit` | `page-edit` | Modify page content |
| `delete` | `page-delete` | Delete the page |
| `create` | `page-create` | Create new pages |
| `rename` | `page-rename` | Rename the page |
| `upload` | `asset-upload` | Upload attachments |

## Permission Evaluation Order

__First decision wins.__ The evaluator walks tiers in order; the first tier that returns a decision short-circuits the rest. Tier-by-tier reasons (surfaced as `reason` strings in `evaluatePagePermission`'s return):

| Tier | Rule | Allow reasons | Deny reasons |
|---|---|---|---|
| __0__ | Private | `private_match` (admin OR page creator) | `private_deny` (anyone else on a `private: true` page) |
| __0.5__ | Author-lock — write-only gate ([#714 Slice A](https://github.com/jwilleke/ngdpbase/issues/714)) | *(never allows; only denies)* | `author_lock_deny` when `action === 'edit'` AND `metadata['author-lock'] === true` AND user is neither admin nor `metadata.author` |
| __1__ | Frontmatter `audience` / `access[action]` | `frontmatter_principal_<p>` | `frontmatter_deny` (map exists; user not in it) |
| __2__ | Global policies via [PolicyEvaluator](PolicyEvaluator.md) | `<policyName>` / `global_policy` | `<policyName>` |
| __3__ ⚠ deprecated | Legacy `[{ALLOW <action> …}]` page markup — __scheduled for removal per [#778](https://github.com/jwilleke/ngdpbase/issues/778)__ | `page_acl_all` / `page_acl_role_<r>` / `page_acl_user` | *(never denies; falls through if no match)* |
| — | Default | *(never)* | `default_deny` |

### Tier-ordering invariants

- __First decision wins__ — Tier 0 outranks Tier 0.5 outranks Tier 1, etc.
- __Tier 0.5 only denies__ — it never returns true; the author/admin "win" case is just *fall through* so Tier 1+ decides whether the actual author is permitted.
- __Tier 3 only allows__ — legacy ALLOW markup is opt-in; it never denies. Missing-or-non-matching markup just falls through to default-deny.
- __`true` requires an affirmative grant__ somewhere in 0 / 1 / 2 / 3. The default is __always deny__.

## Tier-0.5 author-lock semantics (the [#714 Slice A](https://github.com/jwilleke/ngdpbase/issues/714) addition)

Author-lock is a __write-time constraint__, not a read-time constraint:

- Only fires for `action === 'edit'`.
- Only DENIES non-author non-admin attempts on pages with `author-lock: true`.
- Pages also marked `private: true` are decided by Tier 0 first (`private` is the higher-priority rule); Tier 0.5 is never consulted for private pages.
- The actual author and any admin __fall through__ to Tier 1+ — Tier 0.5 does NOT grant edit, it only constrains it.

The route handler at `WikiRoutes.editPage` consumes `evaluatePagePermission`'s `reason` to render the specific *"This page is author-locked. Only the page author and administrators can edit it."* 403 message when Tier 0.5 fires; everything else gets the generic *"You do not have permission to edit this page"*.

## EPIC #714 — unification history

Through v3.36.0 the per-page access-control rules were scattered: private-page checks duplicated across `WikiRoutes.checkPrivatePageAccess`, `MediaManager.checkPrivatePageAccess`, and `ACLManager.checkPagePermissionWithContext`; author-lock enforcement lived in a standalone route-layer branch in `WikiRoutes.editPage`. EPIC #714 (six slices, v3.36.1–v3.37.0) consolidated them into the evaluator above:

| Slice | Release | What |
|---|---|---|
| __A__ | v3.36.1 | Tier 0.5 author-lock added to ACLManager (alongside the route-layer branch; no-removal yet) |
| __B__ | v3.37.0 | `WikiContext.canAccess(action, pageNameOverride?)` cross-page form + `ACLManager.canUserAccessPage` + cache-key fix |
| __C__ | v3.37.0 | Migrated 5 route handlers off `WikiRoutes.checkPrivatePageAccess`; deleted that helper |
| __D__ | v3.37.0 | Migrated MediaManager off its own `checkPrivatePageAccess`; deleted it |
| __E + F__ | v3.37.0 | Rich-return `evaluatePagePermission`; deleted route-layer author-lock branch; restored its specific 403 message via `reason` |

## Related Managers

- [PolicyEvaluator](PolicyEvaluator.md) - Evaluates global access policies
- [PolicyManager](PolicyManager.md) - Manages policy definitions
- [UserManager](UserManager.md) - User role management
- [NotificationManager](NotificationManager.md) - Audit alerts

## Developer Documentation

For complete API reference, configuration options, and implementation details, see:

- [ACLManager-Complete-Guide.md](ACLManager-Complete-Guide.md)
- [Generated API Docs](../api/generated/src/managers/ACLManager/README.md)
