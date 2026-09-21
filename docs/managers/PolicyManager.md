---
name: PolicyManager
description: Removed in #1431 step 10 — the access policies are read live through ConfigurationManager (src/security/policies.ts)
dateModified: '2026-09-21'
category: managers
code: src/security/policies.ts
---

# PolicyManager — removed

`PolicyManager` no longer exists. It was removed in [#1431](https://github.com/jwilleke/ngdpbase/issues/1431) step 10.

## Why

It copied `ngdpbase.access.policies` into a `Map` once, when the server started, and every access decision read that copy. Nothing ever re-read it.

So a policy an administrator changed in __Configuration__ (`/admin/configuration`) was saved, and recorded in the audit log, and __not enforced until the server restarted__. The system said one thing and did another.

That is the case the [manager source-of-truth rule](Manager-SOT.md) names directly: a copy taken at start-up is a second source of truth that an operator cannot change without a restart.

## What replaced it

`readPolicies(get)` in `src/security/policies.ts`. It reads the policies through `ConfigurationManager` every time it is asked, and keeps nothing. `ConfigurationManager` is the one owner, because it is what merges the shipped defaults, each addon's defaults and the operator's changes.

Its answer is the same as `PolicyManager`'s was, kept exactly so that only the timing changed:

- `ngdpbase.access.policies.enabled` false — which is its default when unset — means no policies
- an entry without a string `id` is skipped
- two entries with the same `id`: the later one wins
- highest `priority` first

The readers that used `PolicyManager`:

| Reader | Now |
| --- | --- |
| `PolicyEvaluator` | calls `readPolicies` per decision; `compile()` once per listing |
| `UserManager.getUserPermissions` | uses `permissionsForRoles` in `src/utils/rolePermissions.ts`, the same derivation as the admin __Security Policy Summary__ |
| `PolicyValidator.validateAllPolicies()` | reads the policies in force when given none |

## Where policies are edited

In __Configuration__, as the `ngdpbase.access.policies` value. The change is written through `ConfigurationManager.setProperty` with the administrator as the actor, recorded in the audit log, and now enforced on the next decision.
