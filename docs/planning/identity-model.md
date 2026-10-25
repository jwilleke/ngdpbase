# Identity model: digital identities, credentials, roles and affiliations

Status: APPROVED by the operator (2026-10-24). Built step by step; each step below says when it is built. This page is the source of truth for identities; `docs/GLOSSARY.md` matches it, and an epic tracks the work.

## The model (operator, 2026-10-24)

- __Digital identity__: the representation of an identity. We don't know, and don't care, whether it is a human, an agent or an API service. Every digital identity has one record and one id for life.
- __Credentials__: a digital identity may or may not have credentials that let it authenticate (password, passkey, a link to an outside sign-in, later an API key). Gaining credentials does not create a new identity: same record, same id.
- __User__: a digital identity that has credentials. __Contact__: a digital identity that has none. "Digital identity" means either.
- __Only an identity that has authenticated acts.__ A contact is only ever acted on.
- __Role__: a set of permissions (actions) granted against resources. Roles only mean something for an identity that can act, so only users hold roles. A contact holds no roles; anything a contact "does" is as `anonymous`.
- __Affiliation__: puts digital identities into sets or groups (operator, 2026-10-24) — all Owners, all Occupants, all Vendors of an organization — so they can be found, listed, mailed or given a role as a group. An affiliation to an organization the site owns (its own, first organization) is a __fact__: the site itself records it. An affiliation to any other organization is a __claim__: the site has no way to validate it, and goes no deeper for now — no record of who claimed it or when (operator, 2026-10-24). Users and contacts can both have affiliations, and an affiliation never grants anything by itself.
- __Affiliations never grant permissions.__ Roles do. A site may search an affiliation and give a role to everyone in it ("everyone with the Owner affiliation gets the `owner` role"); that assignment is a separate, explicit rule, applied only to users (contacts can't hold roles), and the role — not the affiliation — carries the permissions (operator, 2026-10-24).
- __The same word can name both.__ "Owner" is an affiliation (claimed: an Owner of the association — of a user or a contact) and can also be a role (the `owner` role, a set of permissions owners get). A user who holds the Owner affiliation can be given the `owner` role (accommodation's role job does this today); a contact can hold the affiliation but, having no credentials, never the role. Keep the two separate in code even when they share a name.
- __Organization__: a digital identity too. For now, organizations have no credentials.

```text
Digital identity (one record, one id for life — human, agent or service, we don't care)
├── details: name, email, address, phones           (always)
├── affiliations: Owner of unit 12, Vendor, …      (users and contacts)
└── credentials: password / passkey / outside sign-in  (optional)
      └── only with credentials: roles → permissions → can act
User = has credentials.  Contact = has none.  Organization = a digital identity, no credentials for now.
```

## The identity id (operator, 2026-10-24)

- Every digital identity's id is its `@id`, a random `urn:uuid:<v4>` created with the record. It is globally unique and never changes. It is the identity's id for life, before and after it gains credentials.
- Anything that refers to an identity (role membership, affiliations, an add-on's donor, payer, owner or member) stores that `@id`. Never a username: a username is only the sign-in name on the account.
- Organizations always get a `urn:uuid` `@id` too. Their web address is an ordinary field (`url`), never the id. (Today an organization's `@id` defaults to its URL; existing ones keep their id, new ones get a uuid — see steps.)

## Affiliation shape (operator, 2026-10-24)

An affiliation follows schema.org `affiliation` with an `OrganizationRole`:

```json
"affiliation": [{
  "@type": "OrganizationRole",
  "memberOf": { "@id": "<the site or an association: an Organization>" },
  "roleName": "Owner",
  "startDate": "2021-06-01",
  "endDate": null
}]
```

- A group is an organization plus a `roleName`: "Owners" is every digital identity with an affiliation to the association whose `roleName` is "Owner". Never a unit; "who owns unit 12" stays with accommodation.
- `startDate` / `endDate` give dated affiliations (absorbs #2003).
- __`roleName` is not a Role.__ A Role is a set of permissions held by users. `roleName` is only the affiliation's title (Owner, Occupant, Vendor, Treasurer) and grants nothing. In prose and on screens it is called the affiliation's __title__, never "role". A separate, explicit rule may give a Role to users with a given affiliation.
- The shape before this, `affiliation: [{ organization, role? }]`, maps onto it (organization → `memberOf`, role → `roleName`); converted when read and once on disk at start-up ([#2039](https://github.com/jwilleke/ngdpbase/issues/2039)).

## Permission names (operator, 2026-10-24)

`contact-read` and `contact-manage` are renamed `identity-read` and `identity-manage` (shipped catalogue change, approved): they cover every identity record, users' included, and "contact" now means an identity with no credentials. The old names are accepted as aliases for one release; add-on policies (accounting's treasurer grant) switch to the new names.

## How the code differs today

| Today | Under the model |
|---|---|
| A PersonManager record per human (users and contacts), identifier = username or `person:<uuid>`; an account in `users.json` for users | Same shape — one identity record, credentials optional. Names change: "identity", "user", "contact"; no "person" |
| Same `@id` before and after a contact signs up (`linkAccount`, sign-up link) | Kept: one id for life |
| Organizations in OrganizationManager, not treated as digital identities | Organizations are digital identities (no credentials for now) |
| RoleManager's doc says it can hold business titles ("Board President at Acme Corp"); none exist | Roles are permission sets only, held by users; titles are affiliations. Correct the doc |
| Owner/Occupant are entries on the user record (accommodation `ownership`, `occupies`), so a contact can't be an owner | Owner/Occupant are affiliations on the identity record, so a contact can be an owner too |
| Affiliations (`affiliation: [{ organization, role? }]`) on the identity record | A kind of affiliation (to an organization, with a title) |
| Role files list members by identity `@id` | Kept (same id for life), but only identities with credentials may be members |
| A contact could in principle be listed in a role | Refused: a role member must have credentials |

## Questions settled

- 1 __One manager or two?__ Decided (operator, 2026-10-24): PersonManager is renamed __IdentityManager__ and owns every identity record — users' and contacts' alike: name, email, address, phones, affiliations. UserManager owns only sign-in: username, password, passkeys, outside sign-ins, preferences, the account's on/off switch. No manager above both (one owner per job, Manager-SOT). OrganizationManager stays separate for now. `PersonManager` stays as an alias for one release so add-ons can switch. Searching identities is IdentityManager's: e.g. `identityManager.search(ctx, { affiliation: { memberOf: association, title: 'Vendor' } })` returns every vendor, users and contacts alike, each saying whether it has credentials; checked like any identity read (own record under `profile-manage`, others under `contact-read`).
- 2 __Where affiliations live.__ Decided (operator, 2026-10-24): an affiliation is a title within an organization ("Owner", "Occupant", "Vendor" of the association), never "of what" beyond the organization (never a unit). The detail stays with the add-on that owns it: accommodation already answers "who owns unit 12" and "who lives in unit 12". Pointing affiliations at things would make them explode in number. Who may set one (operator, 2026-10-24): an affiliation to the site's own organization (a fact) only by users holding `identity-manage`, or an add-on acting for such a user through its own door (as accommodation does for owners); an affiliation to any other organization (a claim) by the same, and by a user for their own record under `profile-manage`. A title is free text; an add-on may offer its own list (Owner, Occupant, Vendor), core restricts nothing. All through IdentityManager's door.
- 3 __Business titles in RoleManager__: settled (checked 2026-10-24). None exist: jimstest, the temp build and The Fairways hold only the shipped permission roles, and nothing in code creates a title role (every role record is on the install organization). RoleManager holds permission roles only; titles such as "Board President" are affiliations. Only the RoleManager doc's "business roles" wording needs correcting.
- 4 __Organizations with credentials later__ (an API service signing in as an organization): out of scope now; the model allows it.

## Steps (operator-approved order, 2026-10-24; each its own issue, each released before the next)

- 1 Glossary and guides: digital identity, credentials, user, contact, identity record, role, affiliation, title; drop "person" in prose. No code.
- 2 An account missing its identity record gets one at start-up, recorded (the paused fix; unblocks hand-made test users).
- 3 Renames with one-release aliases: PersonManager → IdentityManager; `contact-read` / `contact-manage` → `identity-read` / `identity-manage`. Built in [#2038](https://github.com/jwilleke/ngdpbase/issues/2038).
- 4 Affiliations: the `OrganizationRole` shape (memberOf, title as `roleName`, startDate/endDate), who may set them, search by affiliation; today's `affiliation: [{ organization, role? }]` converted. Built in [#2039](https://github.com/jwilleke/ngdpbase/issues/2039): `IdentityManager.search(ctx, { affiliation: { memberOf, title?, current? } })`; an ongoing affiliation has no `endDate` (core does not adopt a `"current"` marker, [#2003](https://github.com/jwilleke/ngdpbase/issues/2003)).
- 5 A role member must have credentials: a contact is refused as a role member.
- 6 Organizations get a `urn:uuid` `@id` (URL an ordinary field); every reference that stores a username for an identity switches to its `@id`.
- 7 Add-ons switch: accounting to the new permission names; accommodation's owners/occupants to affiliations (so a contact can be an owner); association follows.
