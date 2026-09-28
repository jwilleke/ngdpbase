# Access policies

What an access policy is, how the code evaluates one today, and what is decided but not yet built.

__This page is the source of truth for access policies.__ It describes the policy configuration and its evaluation as the code does them, read from the code, not from older docs. Where another document disagrees, this page wins; the documents listed under [Consolidation](#consolidation) are to be folded into it.

The standing law it serves is [security-posture.md](security-posture.md): every security-relevant call carries a context (P1), and allow and deny come only from `hasPermission` / `canAccess` (P2). How to call those from code is [architecture/Access-Control.md](architecture/Access-Control.md); how to apply the posture when writing a route, manager or add-on is [guides/security-developer-guide.md](guides/security-developer-guide.md).

## The model

- __Permission__ (also called an action): a named thing a person may do, such as `page-edit` or `asset-upload`.
- __Policy__: a rule that allows or denies some permissions to some people on some resources.
- __Role__: a name a person holds. Policies grant to roles, never to individual users.

Whether a person may do something is decided by the policies alone. No other setting allows or denies.

## Where it is configured

| Key | Holds |
|---|---|
| `ngdpbase.permissions.definitions` | The catalogue of permissions: each name with its description, icon and colour. `src/security/permissions.generated.ts` is generated from it (`npm run generate:permissions`) |
| `ngdpbase.access.policies` | The list of policies |
| `ngdpbase.access.policies.enabled` | Must be `true`. When it is not, no policy applies and every check is denied |

All three live in `config/app-default-config.json`, overridable per instance in `app-custom-config.json`.

__Add-ons__ declare their own permissions and policies in their own `config/default-config.json`, under the same keys. Those files are a layer of the configuration merge between the shipped defaults and the instance's custom file, merged per entry and, for policies, by `id`. So an add-on adds its permissions and policies without touching a shipped one, and the instance's custom file still wins over everything (`src/utils/addonConfigLayer.ts`, #1220). Only an enabled add-on contributes.

## A policy, as the code reads it today

```json
{
  "id": "admin-full-access",
  "name": "Administrator Full Access",
  "description": "Full system access for administrators - all page and admin permissions",
  "priority": 100,
  "effect": "allow",
  "subjects": [{ "type": "role", "value": "admin" }],
  "resources": [{ "type": "page", "pattern": "*" }],
  "actions": ["page-read", "page-edit", "page-create"]
}
```

| Field | Represents | Values | When absent or empty |
|---|---|---|---|
| `id` | The policy's identity. Add-on and custom policies merge with shipped ones by `id` | Unique string | Not a valid policy; ignored |
| `name` | A human title | String | — |
| `description` | A human explanation | String | — |
| `priority` | Evaluation order: higher is checked first | Number | `0` |
| `effect` | What a match decides | `allow` / `deny` | Not a valid policy; ignored |
| `subjects` | Who the policy is about | A list of `{ "type": "role", "value": "<role>" }`. Only `role` is matched | The policy applies to everyone |
| `resources` | What the policy is about | A list of `{ "type": "page", "pattern": "<glob>" }`, the glob matched against the page name (micromatch). Only `page` is matched | The policy applies to every resource |
| `actions` | Which permissions the policy decides | Permission names from the catalogue, or `*` for all | The policy applies to every action |

### How a decision is made

In `PolicyEvaluator.evaluateAccess` (`src/managers/PolicyEvaluator.ts`), with the policies from `PolicyDecisionPoint.policies()`:

- Policies are sorted by `priority`, highest first.
- A policy matches when its subjects, its resources and its actions all match.
- A subject matches when the person holds at least one of the listed roles. A person with no roles matches no policy that names roles. An unauthenticated caller holds the `anonymous` role.
- __The first matching policy decides__, allow or deny. Later policies are not consulted.
- __No matching policy means deny.__

The role `All` no longer exists (#1429). A policy that names it matches nobody; name the roles meant instead.

The three levels of checking built on this (the global `PolicyDecisionPoint.permits`, the page-aware `PolicyInformationPoint`, and this evaluator at the bottom) are described in [architecture/Access-Control.md](architecture/Access-Control.md#two-evaluation-engines).

## Decided, not yet built

- __A `system-category` resource type__ (operator, 2026-09-28). `{ "type": "system-category", "pattern": "<system-category>" }` matches a page by its `system-category` frontmatter, the way `page` matches by name. One policy can then cover every page of a system-category, and the action list stays one vocabulary instead of growing a permission per system-category. It lets add-ons' own system-categories be governed the same way. See [system-category.md](system-category.md).
- __First use: who may move a page into a system-category__ is decided by policy on the target system-category. By default only admins may move a page into `system` or `documentation` (today this is hard-wired in the save route). See [system-category.md](system-category.md#where-a-pages-master-copy-lives).

## Consolidation

Four older documents describe policies. They overlap, and some describe more than the code does: the schema document lists resource types `attachment`, `category`, `tag`, `resource-type` and `path`, and subject types beyond `role`, none of which the evaluator matches today.

| Document | What it holds | Plan |
|---|---|---|
| [admin/policy-schema-documentation.md](admin/policy-schema-documentation.md) | A JSON schema for policies, and examples | Fold the parts the code honours into this page; drop the rest; then retire it |
| [design/policy-based-access-control-design.md](design/policy-based-access-control-design.md) | The original design, 2026-08 | Mark it historical and point here; keep it as the record of intent |
| [admin/policy-management-guide.md](admin/policy-management-guide.md) | How an admin manages policies in the web interface and API | Keep it as the how-to for operators; replace its description of the policy format with a link here |
| [architecture/Access-Control.md](architecture/Access-Control.md) | Which method to call from code, and the evaluation engines | Keep it for code use; its policy semantics point here |

Until each is done, those documents may still describe things that do not exist; this page is the one to trust.
