---
name: PolicyInformationPoint
description: What a page decision needs to know about the page — its own rules, walked in order, asking the PDP where global policy decides (was ACLManager)
dateModified: '2026-09-21'
category: managers
code: src/security/PolicyInformationPoint.ts
---

# PolicyInformationPoint

Registered as `PolicyInformationPoint`. Until [#1431](https://github.com/jwilleke/ngdpbase/issues/1431) step 8 it was `ACLManager`, in `src/managers/`.

## Where it sits

Access control follows the XACML roles, set out in [Manager-SOT.md](Manager-SOT.md):

| Role | Who plays it | Job |
| --- | --- | --- |
| PEP | the doors — routes, manager doors, the availability gate | ask, then enforce (401 or 403) |
| PDP | `PolicyDecisionPoint` | may this subject do this — delegation ceilings, then the policies |
| __PIP__ | __this__ | the page's and the subject's attributes, asking the PDP where global policy decides |
| PAP | `ConfigurationManager` plus the admin screens | where policy is written, and audited |

A door asks for a __permission__, never a role. The policies are the only grant, read live through `ConfigurationManager` and interpreted only by the PDP ([PolicyDecisionPoint.ts](../../src/security/PolicyDecisionPoint.ts)).

## The page's rules

`walkPageTiers` is the one implementation, and every entry point below uses it. The ceilings (an agent token's scope, a share's grant) are asked first by each caller, because they bound the subject rather than the page. Then, first answer wins:

| Tier | Rule | Note |
| --- | --- | --- |
| 0 | __private__ | owner or delegate, never a role. For an encrypted store there is no key an administrator could hold |
| 0.5 | __author-lock__, `edit` only | only denies. The author, or a subject holding `admin-system`, goes on to tier 1 |
| 1 | frontmatter __`access[action]`__ / __`audience`__ | a page's own restriction, when it states one |
| 2 | a __share__ is the policy for a share visitor; otherwise __global policy__ via the PDP | |
| — | default deny | |

A page decision without the page's metadata refuses, except for `create`. A page that exists but has no metadata is damage, not a permission question: the view and edit routes fail with a 500, log it, and notify holders of `admin-system` ([pageMetadataMissing.ts](../../src/utils/pageMetadataMissing.ts)).

## Entry points

| Method | For |
| --- | --- |
| `checkPagePermissionWithContext(ctx, action)` | one page, from a request that already holds it |
| `evaluatePagePermission(ctx, action)` | the same, returning the reason (e.g. `author_lock_deny`) |
| `canUserAccessPage(subject, page, action)` | another page, loaded as this subject — inserts, includes, attachments |
| `filterAccessiblePages(subject, action, candidates)` | many pages over the index; no disk read, log line or audit record per page; agrees with the single-page answer in both directions ([#1219](https://github.com/jwilleke/ngdpbase/issues/1219)) |
| `canUserAccessMediaItem(subject, item)` | media, including a share's media cover |
| `canAccessPrivateContainer(subject, owner, resource, action)` | a private store's files |

Every single-page decision is recorded by `logAccessDecision`, and a refusal reaches the audit log as `authorization-deny`.

## The subject

The PIP also supplies the subject's attributes (operator, [#1431](https://github.com/jwilleke/ngdpbase/issues/1431) step 13 — one PIP). It builds a subject from the account (`UserManager`) and the roles it holds now (`RoleManager`), and stores neither.

| Method | For |
| --- | --- |
| `currentSubject(req)` | who is making a request — the middleware's subject, else the session's account now, else anonymous. Was `UserManager.getCurrentUser` |
| `subjectFor(username)` | an active account with its current roles, or `null`; what the session and bearer middleware in `app.ts` use |
| `resolveSubjectNow(username)` | a job's requester at decision time (#631); the PDP asks this |
| `anonymousSubject()` | the anonymous visitor |
| `systemPrincipalName()` / `isSystemPrincipal(name)` / `systemSubject()` | the server acting for itself (#631); `UserManager.createUser` reserves the name through this |

It starts before `UserManager`, because `UserManager`'s own start-up creates the default admin under the system principal. Everything else it reads at the moment of use.

## What it no longer does

So nobody goes looking:

- __JSPWiki page-body ACL markup__ (`[{ALLOW edit Charlie}]`) is not read. It was removed in #1431 7a; an import converts it to audience terms ([#1446](https://github.com/jwilleke/ngdpbase/issues/1446)). The editor scrubs leftover markup, keeping escaped examples ([aclMarkup.ts](../../src/parsers/aclMarkup.ts)).
- __Availability__ — maintenance, business hours, holidays — is its own gate ([#1432](https://github.com/jwilleke/ngdpbase/issues/1432)).
- __No role-name gate__, anywhere in it. `check-permission-gates` fails CI if one appears.
- __No policy cache__, and no copy of the policies.
