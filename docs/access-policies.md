# Access policies

What an access policy is, how the code evaluates one today, and what is decided but not yet built.

__This page is the source of truth for access policies.__ It describes the policy configuration and its evaluation as the code does them, read from the code, not from older docs. Where another document disagrees, this page wins; the documents listed under [Consolidation](#consolidation) are to be folded into it.

The standing law it serves is [security-posture.md](security-posture.md): every security-relevant call carries a context (P1), and allow and deny come only from `hasPermission` / `canAccess` (P2). How to call those from code is [architecture/Access-Control.md](architecture/Access-Control.md); how to apply the posture when writing a route, manager or add-on is [guides/security-developer-guide.md](guides/security-developer-guide.md).

## The model

- __Permission__ (also called an action): a named thing a user may do, such as `page-edit` or `asset-upload`.
- __Policy__: a rule that allows or denies some permissions to some users on some resources.
- __Role__: a name a user holds; the policies that name it make it a set of permissions. Only users hold roles, and a role is never a title or a group ([glossary](GLOSSARY.md#identities)). Policies grant to roles, never to individual users.

Whether a user may do something is decided by the policies alone. No other setting allows or denies.

## Where it is configured

| Key | Holds |
|---|---|
| `ngdpbase.permissions.definitions` | The catalogue of permissions: each name with its description, its `label` (the plain words a user reads, #1764), icon and colour, its `audit` block and `step-up` flag (#1638). An entry with `"grantable": false` is a recorded event, not a permission a policy grants. `src/security/permissions.generated.ts` is generated from the grantable entries (`npm run generate:permissions`) |
| `ngdpbase.access.policies` | The list of policies |
| `ngdpbase.access.policies.enabled` | Must be `true`. When it is not, no policy applies and every check is denied |
| `ngdpbase.access.resource-types` | The kinds of thing a policy's `resources` may name, each with a description (#1504). Read through ConfigurationManager by the evaluator and the validator. The `page` type declares its `attributes`, what a `condition` may read as `resource:<name>`, each with a `type` and the PIP source it comes `from` ([#2255](https://github.com/jwilleke/ngdpbase/issues/2255)) |
| `ngdpbase.access.subject-attributes` | The attributes of whoever asks that a `condition` may read as `subject:<name>`, each with a `type` and the `from` source the PIP reads it from ([#2261](https://github.com/jwilleke/ngdpbase/issues/2261)). Shipped: `id` and `aal`. See [Subject attributes](#subject-attributes) |
| `ngdpbase.access.environment-attributes` | The attributes of the moment or the site that a `condition` may read as `environment:<name>`, each a boolean with a `from` of `schedule:<name>` or `config:<key>` ([#2261](https://github.com/jwilleke/ngdpbase/issues/2261)). Shipped: `is-business-hours` and `vaults-admin-access`. See [Environment attributes](#environment-attributes) |
| `ngdpbase.vaults.admin-access` | Whether a holder of `admin-system` may enter another person's unencrypted vault at a door ([#2255](https://github.com/jwilleke/ngdpbase/issues/2255)); shipped `true`. See the [security guide](guides/security-developer-guide.md#a-vault-is-its-owners-an-administrator-may-enter-one-that-is-not-encrypted) |

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
| `priority` | Kept for ordering the list; it no longer decides between an allow and a deny ([#2255](https://github.com/jwilleke/ngdpbase/issues/2255)) | Number | `0` |
| `effect` | What a match decides | `allow` / `deny` | Not a valid policy; ignored |
| `subjects` | Who the policy is about | A list of `{ "type": "role", "value": "<role>" }`, `{ "type": "job", "value": "<job id>" }` for a scheduled job that holds its own permissions ([#1999](https://github.com/jwilleke/ngdpbase/issues/1999)), `{ "type": "authenticated" }` for any signed-in user, or `{ "type": "anyone" }` for every caller ([#2261](https://github.com/jwilleke/ngdpbase/issues/2261)). `authenticated` and `anyone` take no `value`; the validator refuses one ("takes no value"). Only these four types are matched; the validator refuses any other | The policy applies to everyone |
| `resources` | What the policy is about | A list of `{ "type": "<resource type>", "pattern": "<glob>" }`. `page` matches the page name; `system-category` matches the page's `system-category` frontmatter; `vault` matches the id of the vault a page or file is in; `shared-folder` matches a shared folder as `shared/<name>` (micromatch). Only types declared in `ngdpbase.access.resource-types` that the evaluator has a matcher for ever match | The policy applies to every resource |
| `actions` | Which permissions the policy decides | Permission names from the catalogue, or `*` for all | The policy applies to every action |
| `condition` | When the policy applies ([#2255](https://github.com/jwilleke/ngdpbase/issues/2255), [#2261](https://github.com/jwilleke/ngdpbase/issues/2261)) | A comparison `{ "attribute": a, "equals": b }`, or `any-of`, `all-of` or `not` over other conditions (see [Conditions](#conditions)). A string starting `subject:`, `resource:` or `environment:` names an attribute, anything else is a literal. The attributes are those declared in `ngdpbase.access.subject-attributes` (`subject:id`, the signed-in account; `subject:aal`, the sign-in level; see [Subject attributes](#subject-attributes)) and those declared on the `page` resource type (`resource:system-category`, `resource:owner`, the page's `author`). Environment attributes are those declared in `ngdpbase.access.environment-attributes` (`environment:is-business-hours`; see [Environment attributes](#environment-attributes)) | The policy applies whenever it matches |

A permission that was renamed or split keeps working under its old name: a policy or an agent token naming it is read as what it now stands for, and a policy naming it is warned about once, at the first decision that reads it, naming the policy. The list is `RETIRED_PERMISSIONS` in `src/utils/permissionCatalog.ts`: `share-manage` is read as `share-create`, `share-extend` and `share-revoke` ([#1638](https://github.com/jwilleke/ngdpbase/issues/1638)); `contact-read` as `identity-read` and `contact-manage` as `identity-manage`, accepted for one release only ([#2038](https://github.com/jwilleke/ngdpbase/issues/2038)). Name the new permissions in anything you write.

### Conditions

A condition is a comparison, or `any-of`, `all-of` or `not` over other conditions. A comparison has an `attribute` and exactly one operator:

| Operator | Reads | Left attribute | Notes |
| --- | --- | --- | --- |
| `equals`, `not-equals` | `{ "attribute": a, "equals": b }` | string, integer, boolean, identity | `b` is a literal or an attribute of the same type |
| `in` | `{ "attribute": a, "in": ["x", "y"] }` | string, integer, identity | A non-empty array of literals of the attribute's type, or an attribute declared as a `list` |
| `greater-or-equal`, `less-or-equal` | `{ "attribute": a, "greater-or-equal": 2 }` | integer | An integer literal or an integer attribute |
| `any-of`, `all-of` | `{ "any-of": [c1, c2] }` | | A non-empty array of conditions |
| `not` | `{ "not": c }` | | One condition |

`{ "attribute": "resource:owner", "equals": "subject:id" }` is a comparison, and stays valid as it is. Conditions nest at most 4 deep, counting every node, so `any-of` > `all-of` > `not` > comparison is the limit; a fifth level is a problem. The validator also reports a comparison with two operators or none, an empty `in`, `any-of` or `all-of`, an attribute that is not declared, and two sides of different types. Width is bounded too: an `in` list holds at most 256 values, an `any-of` or `all-of` at most 256 conditions, and a whole condition at most 512 nodes (`MAX_IN_ITEMS`, `MAX_GROUP_CHILDREN` and `MAX_CONDITION_NODES` in `src/utils/policyAttributes.ts`); split a larger one into several policies. Each message says what is wrong and what to change. Policies are checked when `ngdpbase.access.policies` is saved in Admin → Configuration: if any policy has a problem (the schema's or a condition's), nothing is saved and the page lists each problem with the policy id, in the validator's own words. The same problems are shown on that key's row when the policies in force (for example from `app-custom-config.json`) already have them, and are logged at boot. A policy with one still fails closed at every evaluation, where it never applies as an allow and always applies as a deny.

A value read for an attribute must be of the type the attribute is declared with: an `integer` is a whole number (not `"5"`, `NaN`, `Infinity` or `2.5`), a `boolean` is `true` or `false`, a `list` is an array of strings, booleans or whole numbers. Nothing is coerced. A value of another type counts as missing, so the comparison is unknown, for `not-equals` and `not` as for the rest. An empty string is a value, not a missing one: `status: ""` equals `""` and is not equal to `"draft"` (leave the field out, or leave it empty without quotes, for missing). A literal compared with an `identity` attribute is trimmed and lower-cased, as `subject:id` is, so `"Alice"` meets `alice`; an owner that is a `urn:` id is resolved to its account, and without the identity manager it is missing. A read that fails leaves its comparison unknown and is logged once.

Every node is judged on its own as true, false or unknown:

- A comparison reading an attribute that is missing (a page with no `author`, a caller not signed in) is unknown.
- `any-of`: a true branch decides it, whatever the others. Otherwise it is unknown if any branch is, else false.
- `all-of`: a false branch decides it, whatever the others. Otherwise it is unknown if any branch is, else true.
- `not` of unknown is unknown.

An __allow__ applies only when its condition is true. A __deny__ applies when its condition is true or unknown, so a missing attribute fails closed. A condition with one attribute behaves as before.

### Subject attributes

A condition reads something about whoever asks as `subject:<name>`. Each is declared in `ngdpbase.access.subject-attributes` as `{ "type": …, "from": … }` and read only by `PolicyInformationPoint.subjectAttribute`, from the source `from` names. A request cannot send one: a body field, header or query named `aal` or `department` is never read. A name that is not declared is a problem the validator reports ("add it to ngdpbase.access.subject-attributes"), so a typo never silently holds.

| `from` | Reads | Missing when |
| --- | --- | --- |
| `account:id` | The username, trimmed and lower-cased | Not signed in |
| `account:<field>` | A field of the account record, through `UserManager` | Not signed in, no account, no such field, or a value not of the declared `type` |
| `profile:<field>` | A field of the same record, under its own prefix | As above |
| `sign-in` | The sign-in level the subject has (below) | The subject has none |

The password, email, roles and the other fields in `SENSITIVE_USER_FIELDS` (`src/types/User.ts`) are refused as `account:` or `profile:` fields, in the validator's words (`'account:password' cannot be used in a condition`). Roles stay a subject matcher, not an attribute. A declaration whose `type` is unknown or whose `from` starts with none of `account:`, `profile:` and `sign-in` is a problem too. `id` and `aal` are pinned in code (`PINNED_SUBJECT_ATTRIBUTES`, [#2287](https://github.com/jwilleke/ngdpbase/issues/2287)): they are always there and always mean `account:id` and `sign-in`, whatever the configuration, an add-on's `default-config.json` or a site's own says. Declaring either with another meaning is refused on save in Admin → Configuration, shown on that key's row on load, and reported at start-up (an add-on's declaration is reported there, as the merged value is read); the built-in meaning is kept in every case. The same declaration as the built-in is harmless and not reported. A site adds its own: `"department-id": { "type": "string", "from": "profile:department" }` makes `subject:department-id equals "x"` hold for an account whose record has `department: "x"`, and fail closed for one without. The shipped configuration declares no `department-id`, and no account field `department` exists until a site adds one.

__`subject:aal`__ is the NIST assurance level (1 to 3) of the sign-in, read from the record (`effectiveAal`, `src/utils/policyAttributes.ts`); it is never worked out from factors. It is capped at the level the account's sign-in methods can reach (`aalCap`), as a role's required level is.

| Who asks | `subject:aal` |
| --- | --- |
| A session | The level in its sign-in record. Only a session from before sign-ins were recorded ([#1523](https://github.com/jwilleke/ngdpbase/issues/1523)), which has no sign-in record, is 1 |
| A bearer JWT from Authentik (`AuthentikBearerAuthProvider`) | Missing. It is verified but records no sign-in level, and it is not a session from before #1523, so it is not given 1: a condition on `subject:aal` fails closed, whatever the level asked for ([#2287](https://github.com/jwilleke/ngdpbase/issues/2287)) |
| Someone not signed in | Missing, so a condition on it is unknown and fails closed. The route answers the refusal as it does for any action that needs an account: a page request is redirected to sign-in (returning to the page), a JSON request is a 401. A form POST that saves or deletes a page (`/save/<page>`, `/delete/<page>`) is redirected to sign-in too, returning to the page's editor or the page itself, never to the POST address. A signed-in person below the level gets the ordinary 403 |
| An agent token | The level stored with the token when it was minted: the minting session's, never higher. A token made before this was stored has none: missing |
| A background job | The level stored with the job when it was requested (`JobContext.aal`), set by `jobContextFromRequest` from the requesting session or token and never higher than it. Work no session asked for (boot, a schedule, the command line) has none, and neither has a job stored before this: missing |
| A share-link visitor | Missing |
| Someone acting under a proxy grant | The actor's own session level, as for step-up |

An access token from this site's own OpenID Connect server (`OidcBearerAuthProvider`) carries no stored level either: missing.

`subject:aal` and `"step-up": true` on a permission are separate. Step-up asks for a fresh factor at the moment of the action; `subject:aal` asks what level the session reached. A policy such as an allow of `page-edit` on `general` for `editor` with `{ "attribute": "subject:aal", "greater-or-equal": 2 }` refuses an editor signed in with a password only, and records the refusal with that policy's id in `metadata.conditionNotMet` (it is not in `policyIds`, since it did not decide), and leaves reading alone. The page list and search apply the same condition, reading the subject's attributes once per listing. Because an allow needs a true condition and a deny applies when its condition is unknown, `less-or-equal 1` as a deny also refuses a token or job with no level.

### Environment attributes

A condition reads something about the moment or the site as `environment:<name>`. Each is declared in `ngdpbase.access.environment-attributes` as `{ "type": "boolean", "from": … }` and read only by `PolicyInformationPoint.environmentAttribute`. Both sources give a boolean and nothing else, so `type` must be `boolean`.

| `from` | Reads | Missing when |
| --- | --- | --- |
| `schedule:<name>` | Whether the schedule `<name>` in `ngdpbase.schedules` is open now, in the schedule's own time zone (`scheduleIsOpen`, `src/utils/availability.ts`) | The schedule is not in `ngdpbase.schedules` |
| `config:<key>` | The value stored at the configuration key | There is no value, or it is not a boolean (`"true"` and `1` are not coerced) |

Shipped: `is-business-hours` from `schedule:business-hours`, and `vaults-admin-access` from `config:ngdpbase.vaults.admin-access`. Both are read when the decision is made, so changing `ngdpbase.schedules.business-hours` in Admin → Configuration takes effect with no restart. A deny `page-edit` on `general` for `anyone` with `{ "attribute": "environment:is-business-hours", "equals": false }` refuses edits outside the schedule, and the refusal's audit record carries that policy's id. A schedule with no rules reads as always open, and the boot log says so.

The time is read once per decision, and once per page list or search, so every policy and every page sees one instant. A page write asked with no page (a token's scope, a proxy grant, an affordance) reads the same environment, so a deny on it holds there too.

A schedule name that is misspelled in a declaration makes the attribute missing: an allow with the condition does not apply, a deny does, and the boot log names the schedule that is missing. A schedule is read only in its exact allowed shape: top level `name`, `description`, `message`, `timeZone`, `enabled`, `rules` and an empty `exceptions`; each rule `type` (`allow` or `deny`), `days`, `startTime` and `endTime`, with times only on an allow rule and both or neither. Any other key, a wrong type, or times on a deny rule makes the attribute missing, and the boot log names the path, such as `rules[1].dayz`.

A `config:` source may read any configuration key. There is no list of allowed keys and none is refused, secrets included ([#2261](https://github.com/jwilleke/ngdpbase/issues/2261), decided by the operator). The consequence is that anyone who can edit policies can probe a secret's value through whether a condition holds, which is why this needs a security review. The value is never written to a log line, an audit record or a validator message: the PIP returns it to the evaluator and nowhere else, and the messages name the key, never its value. Only a boolean can be read, so a secret that is a string reads as missing.

### How a decision is made

In `PolicyEvaluator.evaluateAccess` (`src/managers/PolicyEvaluator.ts`), with the policies from `PolicyDecisionPoint.policies()`:

- A policy matches when its subjects, its resources and its actions all match.
- A subject matches when the user holds at least one of the listed roles. A user with no roles matches no policy that names roles. An unauthenticated caller holds the `anonymous` role.
- An `authenticated` subject matches any signed-in user, whatever their roles, including a user with none. An agent token counts: it acts as its account, and its scope still bounds it first. A share-link visitor does not match it, and neither does a scheduled job's own subject (`job:<id>`); shares are covered only by their own resources. An anonymous caller does not match it. The system principal (`ngdpbase.system.roles`) is a signed-in account and matches `authenticated`.
- An `anyone` subject matches every caller: anonymous, a share visitor, a job and an admin. In the policy tier, a deny for `anyone` therefore refuses admin too (a deny overrides any allow); a page's own frontmatter rules are a separate tier and are not affected. A policy with `subjects: []` still means everyone. At boot, an allow of anything but `page-read` to `anyone` or `authenticated` (a page write, `page-raw-edit`, `page-categorize`, `page-public`, any non-page action, or missing or empty `actions`, which means `*`) is listed for review, naming who it lets act. Grant `anyone` with care: `{ "type": "anyone" }` with `page-read` on a category makes it readable without signing in.
- A `job` subject matches a scheduled run of that job. When any policy names a job, its scheduled runs act as `job:<id>` with no roles, holding only what such policies grant; a job no policy names runs with the system principal's roles (`ngdpbase.system.roles`). A run started by hand acts as the admin who started it.
- __A deny overrides any allow__ ([#2255](https://github.com/jwilleke/ngdpbase/issues/2255)): if a matching deny applies, the answer is deny, whatever the priorities. Otherwise a matching allow permits. Until #2255 the first match by `priority` decided; a site's own deny policies, and allows that relied on outranking a deny, are named at boot.
- __A condition__ makes a policy apply only when it is true. See [Conditions](#conditions) for the operators, how a missing attribute is judged, and what an allow and a deny do with an unknown answer. A condition naming an undeclared attribute or an unknown operator never applies as an allow, and is named at boot.
- __No matching policy means deny.__
- __Every decision names its policies__: `Decision.policyIds` holds the denies that matched, or, when none did, the allows; empty when none matched. A recorded refusal carries them (`authorization-deny`, `metadata.policyIds`). `Decision.conditionNotMet` holds the ids of allows that matched subject, resource and action but whose condition was false or unknown, and the refusal records them as `metadata.conditionNotMet`; only ids, never the attribute values compared, and not which comparison failed.
- __A subject's attributes come from the PIP__ ([#2261](https://github.com/jwilleke/ngdpbase/issues/2261)): the PDP gives it the subject's sign-in record, `aalCap` and the level stored with a token or job, and it reads each attribute once per decision.
- __A page's attributes come from the PIP.__ A caller names the page; the PDP asks `PolicyInformationPoint.pageAttributes` for its `system-category` and `owner` from the page itself. No route passes them.

__Page writes by system-category ([#2255](https://github.com/jwilleke/ngdpbase/issues/2255), built).__ `page-edit`, `page-delete` and `page-rename` are granted on `system-category` resources, never on `page` / `*`, and a page write is granted under either of two names, `page-<verb>` or `pushed-pages-<verb>`. The shipped policies, as groups of categories:

| Group | Categories | Policies | Who |
|---|---|---|---|
| pushed pages | `system`, `documentation`, `addon` | `pushed-pages-admin` | holders of `pushed-pages-edit` / `-delete` / `-rename`: admin |
| self-managed | `capture`, `user-profile`; `journal` from the journal add-on | `self-managed-author-write`, `self-managed-author-edit` (condition `resource:owner equals subject:id`); `self-managed-admin`; the `journal-` copies | the page's author, with the actions their role holds; admin, whoever the author is |
| general | `general` | `general-page-write`, `general-page-edit` | admin and editor all three; contributor and demo-admin edit, as on every page before |
| shared | `shared` | `shared-page-write`, plus `shared-folder-file` on the folder | every account (`vault-owner`) and admin, in a folder they may file in; author-lock narrows it |

A category no policy covers is changed by nobody, admin included, and is named at boot. `page-categorize` (shipped to admin, `page-categorize-admin`) sets or changes a page's category; `shared` is given only to a page created in a shared folder. Asked with no page, a page write holds when some enabled category grants it, for a token's scope, a proxy grant or an affordance; `shared` and disabled categories do not count, so a reader holds none ([#2268](https://github.com/jwilleke/ngdpbase/issues/2268)). A door asks about the page.

__Upgrading a site (#2255).__ A stored copy of `admin-full-access`, `editor-permissions`, `contributor-permissions` or `demo-admin-access` in `app-custom-config.json` would still grant the page writes on every page and reopen the pushed pages. At load, before the merge, such a copy loses the page writes it held on `page` / `*`; any it held that the category policies do not give that role is kept, on `general` only, as `<id>-page-write`. The change is in memory and logged; saving the policy list in Admin → Configuration stores it. Every other policy granting a page write on `page` resources to a role other than admin, and every deny, is left as it is and named at boot, with one Admin → needs attention entry.

__Resource types (#1504, built).__ Declared once, in `ngdpbase.access.resource-types`, and read only through ConfigurationManager, so add-on and instance configuration count. The evaluator holds one matcher per type (`RESOURCE_MATCHERS` in `PolicyEvaluator`): `page` by name, `system-category` by the page's `system-category`, `vault` by the vault a page or file is in ([#1539](https://github.com/jwilleke/ngdpbase/issues/1539)), `shared-folder` by the shared folder, `shared/<name>` ([#2125](https://github.com/jwilleke/ngdpbase/issues/2125)); the PIP passes the attributes with the request. A `shared-folder` attribute is supplied only when a folder is asked about (`permitsInSharedFolder`, for `shared-folder-read` and `shared-folder-file`), so a folder grant never applies outside it and a folder lists no roles: the shipped `shared-folder-default` grants both on `shared/default` to `vault-owner`, the role every account is given; the shipped `shared-folder-admin` grants `shared-folder-read` and `shared-folder-file` on `shared/*` to `admin` (operator, 2026-10-30, [#2095](https://github.com/jwilleke/ngdpbase/issues/2095)), so administrators read and file in every folder; `shared-folder-executive-read` grants `shared-folder-read` on `shared/*` and `shared-folder-executive-file` grants `shared-folder-file` on `shared/executive` to `executive`; and a folder opens to anyone else only through a policy naming it. A `vault` attribute is supplied only for vault content, so a capability check with no resource never matches a `vault` policy and a vault grant cannot apply outside vaults. A `page: *` policy does not match a vault page (its name contains `/`), so inside a vault only `vault` policies decide. A declared type with no matcher, or a matcher whose type is not declared, is warned about at startup, and a policy naming such a type never matches. The validator accepts only declared types. A configuration without the key uses the matchers' own types, with a startup warning, so an older site keeps deciding as before.

__Making a page public (#1504, built).__ Unticking Private moves a page out of its vault. It is the owner's move, and it needs the permission `page-public`, asked as `hasPermissionOn('page-public', pageName)`: the PDP reads the page's system-category from the PIP, so a policy on the `system-category` resource type decides. The shipped policy `page-public-access` grants it on `general` and `capture` to the roles that can have private pages (`reader`, `contributor`, `editor`, `user-admin`, `admin`, `demo-admin`). The journal add-on grants the same on `journal` in its own policy, `journal-page-public` (#1507), which applies only while the add-on is enabled: with it off, nobody can make a private journal entry public, and journal entries that are already public stay public. Making a page private stays the owner's move alone (operator, 2026-09-29; see below).

The role `All` no longer exists (#1429). A policy that names it matches nobody; name the roles meant instead.

__A page's own audience (Tier 1).__ Before these policies, a page's frontmatter `audience` (who may act on the page at all) decides when it lists anyone. The rule is `decideFrontmatterAccess` in `src/utils/frontmatterAccess.ts`, run by `PolicyInformationPoint`. An entry is one of:

- a role name, such as `editor` — users who hold the role;
- a username, such as `jim`;
- `addon:<slug>`, such as `addon:phr` — users who turned on the per-user add-on `<slug>` for themselves ([#1964](https://github.com/jwilleke/ngdpbase/issues/1964)). The subject matches when `<slug>` is in `PolicyInformationPoint.subjectEnabledAddons(ctx)`, the list `AddonsManager.enabledAddonsFor` gives. It is matched only against that list, never against a role or username of the same spelling. An anonymous visitor (a share visitor included) has no add-ons, so never matches. A slug that is unknown, names an add-on that is not per-user, or names one that is not loaded matches nobody — the page is refused to everyone the entry would have let in, never opened to everyone — and a warning names the page and the slug, at startup once add-ons have loaded and whenever such a page is saved. The subject's add-ons are read only for a page that names one, and once for a whole list or search.

Any one entry matching allows, so `[addon:phr, admin]` is the users with phr on, and admins by role. How the two fields decide (operator, 2026-10-23, [#1964](https://github.com/jwilleke/ngdpbase/issues/1964)):

- __`audience` covers every action.__ Someone it leaves out can neither read nor edit the page: the view, lists and search, the editor (`/edit/<page>`), the raw editor, a save through the form or the API, a rename and a delete are all refused. For `view`, someone the audience admits is allowed; for any other action they go on to the policies, so a reader in a page's audience still needs `page-edit` to edit it. This holds for every audience, `[treasurer]` and `[addon:phr]` alike.
- __Administrators are the audience's one exception.__ Someone holding the permission `admin-system` (the one that marks a site administrator, asked of the policies, never a role name) can read and edit any audience-restricted page, and lists and search show them these pages too. It is asked only when an audience leaves the user out, and once for a whole list or search.
- __There is no per-action `access` field__ ([#2255](https://github.com/jwilleke/ngdpbase/issues/2255)). An `access` left on an older page, including the `{ edit: [admin] }` once stamped on every shipped page, is not read; who may edit, delete or rename a page is its `system-category`'s policy.
- __Vaults are separate.__ A page in a private store is decided by its container (owner or delegate, or an administrator in an unencrypted vault when `ngdpbase.vaults.admin-access` is on); `audience` is not read there, and the audience's administrator exception does not reach into a vault.

Every write also meets the same audience rule at `PageManager`'s write door (`savePage`, `deletePage`, `getRawPageContent`, which ask `PolicyInformationPoint.audienceAdmits` with the caller's context), so a route that forgot to ask still cannot write to a page its writer is outside the audience of. Recent Changes, App Health and "shared with me" still read `audience` from a list of principals and know nothing of add-ons or the administrator exception: they can leave an audience page out for someone who may open it, never show it to someone who may not.

__Where the page decision applies.__ Everywhere a page is shown: opening it, a list of pages, a search hit, a count. Lists and search hits are decided by the same `PolicyInformationPoint` tiers as a page view — audience first, then these policies, `system-category` included — so a policy that refuses `page-read` also keeps the page out of that user's search results ([#1962](https://github.com/jwilleke/ngdpbase/issues/1962)). The rule for code is in [the security guide](guides/security-developer-guide.md#every-page-a-viewer-is-shown-goes-through-the-page-list-door).

The three levels of checking built on this (the global `PolicyDecisionPoint.permits`, the page-aware `PolicyInformationPoint`, and this evaluator at the bottom) are described in [architecture/Access-Control.md](architecture/Access-Control.md#two-evaluation-engines).

## Decided, not yet built

- __A system-category's vault settings__ (`defaultPrivate`, `encrypt`) are not policy: they are the declaration of the entry's `owner` (`admin`, or the add-on that declared it), and they stand (operator, 2026-09-29, reversing the 2026-09-28 note). A health-record add-on that declares `encrypt: true` keeps its vault sealed.
- __Making a page private stays the owner's move__ (operator, 2026-09-29). An earlier decision (2026-09-28) let admins make someone's page private too; it was withdrawn. An admin who wants a page restricted uses its audience instead.
- __Who may move a page into a system-category__ is `page-categorize` ([#2255](https://github.com/jwilleke/ngdpbase/issues/2255)), asked without the target category. Asking it about the target category is open. See [system-category.md](system-category.md#where-a-pages-master-copy-lives).

## Consolidation

Four older documents describe policies. They overlap, and some describe more than the code does: the schema document lists resource types `attachment`, `category`, `tag`, `resource-type` and `path`, and subject types beyond `role`, none of which the evaluator matches (the declared resource types are `page`, `system-category`, `vault` and `shared-folder`).

| Document | What it holds | Plan |
|---|---|---|
| [admin/policy-schema-documentation.md](admin/policy-schema-documentation.md) | A JSON schema for policies, and examples | Fold the parts the code honours into this page; drop the rest; then retire it |
| [design/policy-based-access-control-design.md](design/policy-based-access-control-design.md) | The original design, 2026-08 | Mark it historical and point here; keep it as the record of intent |
| [admin/policy-management-guide.md](admin/policy-management-guide.md) | How an admin manages policies in the web interface and API | Keep it as the how-to for operators; replace its description of the policy format with a link here |
| [architecture/Access-Control.md](architecture/Access-Control.md) | Which method to call from code, and the evaluation engines | Keep it for code use; its policy semantics point here |

Until each is done, those documents may still describe things that do not exist; this page is the one to trust.
