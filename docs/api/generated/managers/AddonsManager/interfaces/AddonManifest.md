[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AddonsManager](../README.md) / AddonManifest

# Interface: AddonManifest

Defined in: src/managers/AddonsManager.ts:290

Shape of the `ngdpbase` key in an add-on's package.json.
All fields are optional — omitting the key entirely is valid.

## Properties

### aboutPage?

> `optional` __aboutPage?__: `string`

Defined in: src/managers/AddonsManager.ts:337

# 1965: the add-on's About page, a page it ships in `pages/`, by uuid or
slug. `[{ConfigAccessor type='addons'}]` links to it ("More about it").
The site overrides it with `ngdpbase.addons.<slug>.about-page`.

***

### capabilities?

> `optional` __capabilities?__: `string`[]

Defined in: src/managers/AddonsManager.ts:317

Capability flags this addon advertises

***

### domainDefaults?

> `optional` __domainDefaults?__: `Record`\<`string`, `unknown`\>

Defined in: src/managers/AddonsManager.ts:315

Config keys this addon wants applied by default at load time.
Each key is only set if the operator has not already explicitly
set it in custom config. Values are ephemeral (merged config only,
not persisted to app-custom-config.json).

***

### family?

> `optional` __family?__: `string`

Defined in: src/managers/AddonsManager.ts:342

# 1965: the heading the add-on is listed under, shared by related add-ons
(e.g. "Accounting" for accounting, accounting-donations and accounting-dues).

***

### listed?

> `optional` __listed?__: `boolean`

Defined in: src/managers/AddonsManager.ts:344

# 1965: `false` keeps plumbing (e.g. elasticsearch) out of the add-on listings.

***

### minVersion?

> `optional` __minVersion?__: `string`

Defined in: src/managers/AddonsManager.ts:308

The oldest ngdpbase release this addon runs on (`x.y.z`). Checked before
the addon is imported: on an older core it is not loaded, and its status
says which release it needs, instead of failing at import with a missing
module.

***

### perPerson?

> `optional` __perPerson?__: `boolean`

Defined in: src/managers/AddonsManager.ts:331

# 1963: each person turns this add-on on or off for themselves. Their
switch is the preference `<slug>.enabled` (`personSwitchKey`), read only
by `AddonsManager.enabledAddonsFor` and written only through
`host.setEnabledForPerson`. Absent or anything but `true`: not per-person.

***

### receivers?

> `optional` __receivers?__: `string`[]

Defined in: src/managers/AddonsManager.ts:357

# 1979 (ICE, D4): the names of the receivers this add-on registers with
`host.registerReceiver` — its own manager's door for what shims produce,
e.g. `["health-records"]`. The host refuses a receiver not named here.

***

### shims?

> `optional` __shims?__: `string`[]

Defined in: src/managers/AddonsManager.ts:351

# 1979 (ICE, D6): the names of the import shims this add-on registers at
load with `host.registerShim`, e.g. `["ccda", "fhir"]` (ids `<slug>.ccda`,
`<slug>.fhir`). The host refuses a shim not named here. Site configuration
switches each one: `ngdpbase.import.shims.<slug>.<name>.enabled`.

***

### slug?

> `optional` __slug?__: `string`

Defined in: src/managers/AddonsManager.ts:299

Canonical addon identity (#927). Authoritative id used as the registry
key, the `ngdpbase.addons.<slug>.enabled` config key, dependency
references, and the boot-time validator's match — read statically from
`package.json` with no module import. When absent, identity falls back
to the package/folder name (minus a conventional trailing `-addon`).
The module's exported `name` is a display label and must equal this.

***

### stores?

> `optional` __stores?__: `unknown`

Defined in: src/managers/AddonsManager.ts:324

Private store kinds this addon owns (#1414): `[{ id, encrypt }]`. Saved to
configuration at the addon's first load, owned by its slug; from then on
configuration wins and this is never consulted again. See
docs/guides/addons-developer-guide.md "Declare a Private Store".

***

### type?

> `optional` __type?__: `"domain"` \| `"additive"`

Defined in: src/managers/AddonsManager.ts:301

'domain' = this addon IS the site identity; 'additive' = augments an existing wiki
