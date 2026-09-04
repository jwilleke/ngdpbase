---
name: Security developer guide
description: How to write a route, manager method or addon that authorizes correctly — context forwarded, allow and deny from hasPermission or canAccess, permissions and policies as configuration, and the checks that fail
dateModified: 2026-09-04
category: architecture
relatedModules: [UserManager, PolicyEvaluator, ACLManager, WikiContext, ApiContext]
---

# Security developer guide

What a developer has to do so that a new route, manager method or addon authorizes the way this codebase requires. The principles are P1 and P2 in [security-posture.md](security-posture.md); this page is the practice.

## Two questions, two doors

| Question | Ask | What it knows |
| --- | --- | --- |
| May this subject perform this kind of action at all? | `wikiContext.hasPermission('page-delete')` / `ctx.requirePermission('admin-system')` | The subject, the action, the policies, deny policies, an inactive account, the agent-token scope ceiling |
| May they do it on this page? | `wikiContext.canAccess('edit', pageName)` | All of the above plus the page's own access markup, audience and private flags, and ACL frontmatter. Resource attributes beat global policy |

Nothing else is an allow or a deny:

- `isAuthenticated` classifies a refusal, 401 for an anonymous subject and 403 for an authenticated one, after policy has refused. It never decides.
- `hasRole` on `UserManager` is a lookup about a named account, the same shape as `userHoldsPermission`. It is never this request's authority: a role name skips the policy evaluator, deny policies and the token ceiling. `ApiContext.requireRole` is gone for that reason.
- A role name in code, `roles.includes('admin')`, is the same defect. `src/routes/WikiRoutes.ts` holds zero, and a static test keeps it there.

## Every security-relevant call carries a context

A manager method that decides access, writes an audit record, or acts on someone's behalf takes the context it was given, positionally. Forward it; never rebuild `{ username, roles, isAuthenticated }` from parts, because the rebuild drops `viaToken` and with it the agent-token scope ceiling. `scripts/check-permission-subject.ts` fails the commit on a rebuild in route code. A job or timer uses `JobContext`; boot paths that act use the system principal. An omitted actor is not "the system"; it is nobody, and the record is wrong.

## Permissions and policies are configuration

- `ngdpbase.permissions.definitions` is the permission catalog: `{target}-{action}`, target first, hyphen separated. `UserManager.permissions` reads it live; there is no list in code.
- `ngdpbase.access.policies` grants permissions to subjects. `hasPermission` resolves through `PolicyEvaluator` over these; a permission that appears in a policy is honoured whether or not anything else names it.
- Roles are lists in `ngdpbase.roles.definitions`, additive, unordered, never gating anything. A role change is a configuration change and is recorded as `config-change`.

__Adding a permission for a new action:__ declare it in the catalog with description, icon and colour; grant it in a policy; ask for it at the door. The registry-drift test fails when a permission is declared and checked nowhere, or checked and declared nowhere.

## Addons

An addon's `config/default-config.json` is a layer of the configuration merge, between the shipped defaults and the operator's custom file, folded in when `ngdpbase.addons.<slug>.enabled` is true. The merge is per entry for maps and by `id` for policy arrays, so an addon declares its own permission and its own policy additively:

```json
{
  "ngdpbase.permissions.definitions": {
    "calendar-manage": { "description": "Create, edit and delete calendar events", "icon": "calendar-check", "color": "#0d6efd" }
  },
  "ngdpbase.access.policies": [
    { "id": "calendar-manage-access", "name": "Calendar management", "priority": 90, "effect": "allow",
      "subjects": [{ "type": "role", "value": "admin" }], "resources": [{ "type": "page", "pattern": "*" }],
      "actions": ["calendar-manage"] }
  ]
}
```

The addon's routes then `await ctx.requirePermission('calendar-manage')`, and a deployment grants the permission to its own roles in its own custom file. An addon never names a role. Do not append to a role's `permissions` array from an addon: a plain array replaces wholesale on merge; a policy with its own `id` merges by id. Bundled and external addons are treated alike; discovery follows `ngdpbase.managers.addons-manager.addons-path`.

## Checklist for a new route or manager method

1. The handler asks `hasPermission` or `canAccess` for the permission the action *is*. If no permission means that, add one to the catalog; do not borrow a role name.
2. The context is forwarded, not rebuilt. Addon API routes use `ApiContext.from(req, engine)`.
3. The refusal answers 401 or 403 by `isAuthenticated`, after policy.
4. The action's audit event exists, is declared in `ngdpbase.audit.events`, and is emitted at the manager door — see [audit-developer-guide.md](audit-developer-guide.md).
5. Tests: refused by policy, allowed by policy with the subject's role name saying otherwise, and the audit record written. Sabotage each once.

## The checks that fail

| Check | Catches |
| --- | --- |
| `npm run lint:permission-subject` | A rebuilt permission subject in route or manager code |
| `npm run lint:http` | Network access originating outside `src/http/` |
| `npm run lint:csrf` | A state-changing client fetch without the CSRF token |
| `npm run lint:addons`, `npm run check:addon-load` | Addon value imports across the host boundary; an addon that does not load |
| `permission-registry.invariant.test.ts` | Catalog and code disagreeing on which permissions exist |
| `WikiRoutes.permissionGates.test.ts` | A role-name gate returning to the routes |
| `npm run lint:audit` | An action recorded under a name configuration does not declare, or not at all |

All of them run in `lint`, `lint:ci` and the pre-commit hook. A check nobody has watched go red is a check nobody knows works: break the thing on purpose once, then fix it.
