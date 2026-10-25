---
name: PolicyInformationPoint
description: What a page decision needs to know about the page — its own rules, walked in order, asking the PDP where global policy decides (was ACLManager)
dateModified: '2026-10-24'
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

`walkPageTiers` is the one implementation, and every entry point below uses it. The ceilings (an agent token's scope, a share's grant, a proxy grant — `carriesCeiling`, [#1762](https://github.com/jwilleke/ngdpbase/issues/1762)) are asked first by each caller, because they bound the subject rather than the page. Then, first answer wins:

| Tier | Rule | Note |
| --- | --- | --- |
| 0 | __private__ | owner or delegate, never a role; a proxy only under a grant carrying `vault-proxy`. For an encrypted store there is no key an administrator (or a proxy, until #1762 slice 5) could hold |
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
| `pageAffordance(ctx, action)` | the same evaluator, asked only to decide whether to show a control or a block — the view's Edit button, `<wiki:If test="hasPermission:x">` (through `WikiContext.mayShow`). Records nothing ([#1668](https://github.com/jwilleke/ngdpbase/issues/1668)) |
| `canUserAccessPage(caller, page, action)` | another page, loaded as this subject — inserts, includes, attachments |
| `pageAffordanceFor(caller, page, action, metadata?)` | the cross-page check as an affordance — the journal entry view's Edit link, and `<wiki:If test="exists:Page">` (through `PageManager.mayShowPage`). Records nothing ([#1668](https://github.com/jwilleke/ngdpbase/issues/1668)) |
| `filterAccessiblePages(caller, action, candidates)` | many pages over the index; no disk read, log line or audit record per page; agrees with the single-page answer in both directions ([#1219](https://github.com/jwilleke/ngdpbase/issues/1219)) |
| `canUserAccessMediaItem(caller, item)` | media, including a share's media cover |
| `canAccessPrivateContainer(caller, owner, resource, action)` | a private store's files |

`caller` in these, and `audienceAdmits(caller, metadata)`, is the context the caller was given: a request's subject or a job's `JobContext`. The PIP turns it into a subject itself with `decisionSubject`, the conversion the PDP uses, so a caller never converts first ([#2022](https://github.com/jwilleke/ngdpbase/issues/2022)).

Every single-page decision at a door is recorded by `logAccessDecision`, and a refusal reaches the audit log as `authorization-deny`, carrying the request's `ipAddress` from the subject (the session and bearer middleware put it there). One method, `auditDenial`, builds that record for page, media and private-container refusals alike.

An affordance is not a door. `pageAffordance` and `pageAffordanceFor` walk the same tiers through the same `_runEvaluator`, so each always agrees with its door (`checkPagePermissionWithContext`, `canUserAccessPage`) on allow and deny, but writes no audit record and logs its trace at debug, not info. Showing a control is not an attempt: before [#1668](https://github.com/jwilleke/ngdpbase/issues/1668) the view asked the door for its Edit button, and every anonymous view wrote an `authorization-deny`. Acting on the control — `GET /edit`, `POST /save` — asks the door, and a refusal there is recorded.

## The subject

The PIP also supplies the subject's attributes (operator, [#1431](https://github.com/jwilleke/ngdpbase/issues/1431) step 13 — one PIP). It builds a subject from the account (`UserManager`) and the roles it holds now (`RoleManager`), and stores neither.

| Method | For |
| --- | --- |
| `currentSubject(req)` | who is making a request — the middleware's subject, else the session's account now, else anonymous. Was `UserManager.getCurrentUser` |
| `subjectFor(username)` | an active account with its current roles, or `null`; what the session and bearer middleware in `app.ts` use |
| `resolveSubjectNow(username, job?)` | a job's requester at decision time (#631); the PDP asks this. For the system principal with a `job` that a policy names, the job itself: `job:<id>`, no roles ([#1999](https://github.com/jwilleke/ngdpbase/issues/1999)) |
| `anonymousSubject()` | the anonymous visitor |
| `subjectEnabledAddons(ctx)` | the per-user add-ons the subject has turned on ([#1963](https://github.com/jwilleke/ngdpbase/issues/1963)), from `AddonsManager.enabledAddonsFor`; for the page audience `addon:<slug>` ([#1964](https://github.com/jwilleke/ngdpbase/issues/1964)) |
| `systemPrincipalName()` / `isSystemPrincipal(name)` / `systemSubject()` | the server acting for itself (#631); `UserManager.createUser` reserves the name through this |

It starts before `UserManager`, because `UserManager`'s own start-up creates the default admin under the system principal. Everything else it reads at the moment of use.

## What it no longer does

So nobody goes looking:

- __JSPWiki page-body ACL markup__ (`[{ALLOW edit Charlie}]`) is not read. It was removed in #1431 7a; an import converts it to audience terms ([#1446](https://github.com/jwilleke/ngdpbase/issues/1446)). The editor scrubs leftover markup, keeping escaped examples ([aclMarkup.ts](../../src/parsers/aclMarkup.ts)).
- __Availability__ — maintenance, business hours, holidays — is its own gate ([#1432](https://github.com/jwilleke/ngdpbase/issues/1432)).
- __No role-name gate__, anywhere in it. `check-permission-gates` fails CI if one appears.
- __No policy cache__, and no copy of the policies.
