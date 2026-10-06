---
name: Security developer guide
description: How to write a route, manager method or addon that authorizes correctly — context forwarded, allow and deny from hasPermission or canAccess, permissions and policies as configuration, and the checks that fail
dateModified: 2026-10-06
category: guides
relatedModules: [UserManager, PolicyEvaluator, PolicyInformationPoint, WikiContext, ApiContext]
---

# Security developer guide

What a developer has to do so that a new route, manager method or addon authorizes the way this codebase requires. The principles are P1 and P2 in [security-posture.md](../security-posture.md); this page is the practice.

## Two questions, two doors

| Question | Ask | What it knows |
| --- | --- | --- |
| May this subject perform this kind of action at all? | `wikiContext.hasPermission('page-delete')` / `ctx.requirePermission('admin-system')` | The subject, the action, the policies, deny policies, an inactive account, the agent-token scope ceiling |
| May they do it on this page? | `wikiContext.canAccess('edit', pageName)` | All of the above plus the page's own access markup, audience and private flags, and ACL frontmatter. Resource attributes beat global policy |
| May they read this page — its content, its history? | Nothing: read it through the page door, `pageManager.readPage(id, ctx)` or `readVersionHistory` / `readVersion` / `readVersionDiff` | The door decides `page-read` itself before it reads anything, and answers a refusal instead of the page. A route answers a refusal with 404. `npm run lint:page-door` fails a route that reads past it ([#1622](https://github.com/jwilleke/ngdpbase/issues/1622)); the methods are in [PageManager.md](../managers/PageManager.md) |
| Does the subject hold the permission, to show a control? | `wikiContext.holdsPermission('config-manage')` / `pdp.holds(subject, action)` | Policy alone, without the step-up freshness rule ([#1635](https://github.com/jwilleke/ngdpbase/issues/1635)). For affordances only — acting on the control asks `hasPermission`, which applies step-up. A door never asks this. |
| May they do this kind of action to this page — create it, write it? | `wikiContext.hasPermissionOn('page-create', pageName)` | The capability, asked about the page itself. For a vault page: the owner only (the container rule), then the capability with the page's `vault`, so `vault-owner` decides and a site-wide role does not reach in ([#1539](https://github.com/jwilleke/ngdpbase/issues/1539)). A route that writes an existing page also asks the page door (`WikiRoutes.writeRefusal`), as the editor does ([#1542](https://github.com/jwilleke/ngdpbase/issues/1542)) |

Nothing else is an allow or a deny:

- `isAuthenticated` classifies a refusal, 401 for an anonymous subject and 403 for an authenticated one, after policy has refused. It never decides.
- `RoleManager.hasRole` is a lookup about a named account, the same shape as `PolicyDecisionPoint.userHoldsPermission`. It is never this request's authority: a role name skips the policy evaluator, deny policies and the token ceiling. `ApiContext.requireRole` is gone for that reason. `UserManager` has no `hasRole`.
- A role name in code, `roles.includes('admin')`, is the same defect when it is the allow. The static test `src/routes/__tests__/WikiRoutes.permissionGates.test.ts` keeps `hasRole(` out of `src/routes/WikiRoutes.ts`. The one `updates.roles.includes('admin')` there validates submitted form data (an external account cannot be given the admin role); it is not an authorization decision.

## Every security-relevant call carries a context

A manager method that decides access, writes an audit record, or acts on someone's behalf takes the context it was given, positionally. Forward it; never rebuild `{ username, roles, isAuthenticated }` from parts, because the rebuild drops `viaToken` and with it the agent-token scope ceiling. `scripts/check-permission-subject.ts` fails the commit on a rebuild in route code. A job or timer uses `JobContext`; boot paths that act use the system principal. An omitted actor is not "the system"; it is nobody, and the record is wrong.

## Permissions and policies are configuration

- `ngdpbase.permissions.definitions` is the permission catalog: `{target}-{action}`, target first, hyphen separated. Callers read it live with `ConfigurationManager.getProperty('ngdpbase.permissions.definitions')`; there is no list in code. `UserManager` does not hold the catalog.
- `ngdpbase.access.policies` grants permissions to subjects. `hasPermission` resolves through `PolicyEvaluator` over these; a permission that appears in a policy is honoured whether or not anything else names it.
- Roles are lists in `ngdpbase.roles.definitions`, additive, unordered, never gating anything. A role change is a configuration change and is recorded as `config-change`.

__Adding a permission for a new action:__ declare it in the catalog with description, icon and colour; grant it in a policy; ask for it at the door. The registry-drift test fails when a permission is declared and checked nowhere, or checked and declared nowhere.

## Addons

An addon's `config/default-config.json` is a layer of the configuration merge, between the shipped defaults and the operator's custom file, folded in when `ngdpbase.addons.<slug>.enabled` is true. The author's copy of the recipe — declare a permission, grant it in a policy with its own `id`, check it with `hasPermission` / `canAccess` — is [Permissions](addons-developer-guide.md#permissions). The file, the merge, and where the operator overrides it are [Configuration](addons-developer-guide.md#configuration). Do not append to a role's `permissions` array from an addon: a plain array replaces wholesale on merge; a policy with its own `id` merges by id. An addon never names a role. Bundled and external addons are treated alike; discovery follows `ngdpbase.managers.addons-manager.addons-path`.

## Checklist for a new route or manager method

1. The handler asks `hasPermission` or `canAccess` for the permission the action *is*. If no permission means that, add one to the catalog; do not borrow a role name.
2. The context is forwarded, not rebuilt. Addon API routes use `ApiContext.from(req, engine)`.
3. The refusal answers 401 or 403 by `isAuthenticated`, after policy.
4. The action's audit event exists, is declared in `ngdpbase.audit.events`, and is emitted at the manager door — see [audit-developer-guide.md](audit-developer-guide.md).
5. Tests: refused by policy, allowed by policy with the subject's role name saying otherwise, and the audit record written. Sabotage each once.

## How you know you are done

- `npm run lint:permission-subject`
- `npm run lint:page-door`
- `npm run lint:http`
- `npm run lint:csrf`
- `npm run lint:addons`
- `npm run check:addon-load`
- `npm test -- src/__tests__/permission-registry.invariant.test.ts src/routes/__tests__/WikiRoutes.permissionGates.test.ts`

The `lint:*` commands above run in `lint`, `lint:ci` and the pre-commit hook. `npm run check:addon-load` does not; run it after a build when an add-on import changes. The permission tests are `npm test`.

## See also

- [security-posture.md](../security-posture.md) — P1, P2, numbered decisions
- [audit-developer-guide.md](audit-developer-guide.md)
- [configuration-developer-guide.md](configuration-developer-guide.md)
- `src/context/ActorContext.ts`, `src/utils/subjectMayDo.ts`

## Known gaps

- [#1174](https://github.com/jwilleke/ngdpbase/issues/1174)
- [#1216](https://github.com/jwilleke/ngdpbase/issues/1216)
