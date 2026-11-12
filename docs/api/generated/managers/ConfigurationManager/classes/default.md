[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/ConfigurationManager](../README.md) / default

# Class: default

Defined in: src/managers/ConfigurationManager.ts:75

ConfigurationManager - Handles JSPWiki-compatible configuration management

Implements a two-tier configuration system that merges default settings with
instance-specific overrides. This allows for flexible deployment configurations
while maintaining sensible defaults.

Configuration merge order (later overrides earlier):

1. config/app-default-config.json (base defaults - required, read-only)
2. INSTANCE_DATA_FOLDER/config/app-custom-config.json (instance overrides - optional)

INSTANCE_DATA_FOLDER defaults to './data' but can be set via environment variable
for Docker/Kubernetes deployments (typically '/app/data').

 ConfigurationManager

## See

[BaseManager](../../BaseManager/classes/default.md) for base functionality

## Example

```ts
const configManager = engine.getManager('ConfigurationManager');
const appName = configManager.getApplicationName();
const port = configManager.getServerPort();
```

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `ConfigurationManager`

Defined in: src/managers/ConfigurationManager.ts:105

Creates a new ConfigurationManager instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Returns

`ConfigurationManager`

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`constructor`](../../BaseManager/classes/default.md#constructor)

## Properties

### config?

> `protected` `optional` __config?__: `Record`\<`string`, `unknown`\>

Defined in: src/managers/BaseManager.ts:325

Configuration passed during initialization

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`config`](../../BaseManager/classes/default.md#config)

***

### description?

> `readonly` `optional` __description?__: `string`

Defined in: src/managers/BaseManager.ts:335

Short description of what this manager does.
Used by admin UIs, addon registries, and introspection tools.
Override in subclasses to provide a human-readable description.

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`description`](../../BaseManager/classes/default.md#description)

***

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/managers/BaseManager.ts:319

Reference to the wiki engine

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`engine`](../../BaseManager/classes/default.md#engine)

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/managers/BaseManager.ts:322

Initialization status flag

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`initialized`](../../BaseManager/classes/default.md#initialized)

***

### pageWritePolicyMigration

> __pageWritePolicyMigration__: `string`[] = `[]`

Defined in: src/managers/ConfigurationManager.ts:512

What the #2255 page-write migration rewrote in memory, one sentence each; PolicyDecisionPoint reports it.

***

### pageWritePolicyMigrationShown

> __pageWritePolicyMigrationShown__: `Record`\<`string`, `string`\> = `{}`

Defined in: src/managers/ConfigurationManager.ts:514

Each `pageWritePolicyMigration` line in plain words, for the needs-attention entry.

## Methods

### backup()

> __backup__(): `Promise`\<`ConfigManagerBackupData`\>

Defined in: src/managers/ConfigurationManager.ts:1599

Backup configuration data

Backs up the custom configuration (user overrides) which can be restored
to recreate the user's configuration settings. We don't backup default or
environment configs as those are part of the codebase.

#### Returns

`Promise`\<`ConfigManagerBackupData`\>

Backup data containing custom configuration

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`backup`](../../BaseManager/classes/default.md#backup)

***

### backupFolders()

> __backupFolders__(): [`BackupFolder`](../../BaseManager/type-aliases/BackupFolder.md)[]

Defined in: src/managers/BaseManager.ts:390

Where this manager keeps its data as folders or files (#1985): declared,
never backed up by hand. BackupManager archives each beside the backup
document (`<stem>.<part>.tar`), stages it in a site restore, and puts the
staged copy in place at the next start, in `initialize()` above, before
the subclass reads it. Resolved from the configuration, so it can be
answered before the subclass's own `initialize()` has run. Default none.

A manager with data in the document as well keeps its `backup()`; a
declared part's record goes beside that data (`data[part]`), or is the
entry's `data` when the manager has none and declares one part.

#### Returns

[`BackupFolder`](../../BaseManager/type-aliases/BackupFolder.md)[]

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`backupFolders`](../../BaseManager/classes/default.md#backupfolders)

***

### describeProperty()

> __describeProperty__(`key`): [`PropertyDescription`](../../../utils/configEnvKeys/interfaces/PropertyDescription.md)

Defined in: src/managers/ConfigurationManager.ts:1076

Describe where a key's value actually comes from (#1089).

The admin screen needs three separate facts that `getProperty` alone cannot
express: the effective value, whether the environment owns the key, and
which variable does. Without this it displayed `mergedConfig` — the raw JSON
— while `getProperty` returned something else entirely, so the *read* side
was wrong before anyone edited anything.

#### Parameters

##### key

`string`

#### Returns

[`PropertyDescription`](../../../utils/configEnvKeys/interfaces/PropertyDescription.md)

***

### getAccessControlConfig()

> __getAccessControlConfig__(): `object`

Defined in: src/managers/ConfigurationManager.ts:1442

Get access control configuration

#### Returns

`object`

Access control configuration

##### businessHours

> __businessHours__: `object`

###### businessHours.days

> __days__: `unknown`

###### businessHours.enabled

> __enabled__: `boolean`

###### businessHours.end

> __end__: `unknown`

###### businessHours.start

> __start__: `unknown`

##### contextAware

> __contextAware__: `object`

###### contextAware.enabled

> __enabled__: `boolean`

###### contextAware.timeZone

> __timeZone__: `unknown`

***

### getAddonDatabaseDeclarations()

> __getAddonDatabaseDeclarations__(): readonly [`AddonDatabaseDeclaration`](../../../utils/addonDatabaseRules/interfaces/AddonDatabaseDeclaration.md)[]

Defined in: src/managers/ConfigurationManager.ts:724

# 1860: the database each installed add-on declares in its
default-config.json (`ngdpbase.addons.<slug>.database`), whether or not it
is turned on. A refused declaration is not here; its add-on is refused
([getAddonRefusal](#getaddonrefusal)). DatabaseManager is the reader.

#### Returns

readonly [`AddonDatabaseDeclaration`](../../../utils/addonDatabaseRules/interfaces/AddonDatabaseDeclaration.md)[]

***

### getAddonDeclaredDefaults()

> __getAddonDeclaredDefaults__(`slug`): `Record`\<`string`, `unknown`\>

Defined in: src/managers/ConfigurationManager.ts:745

# 1813: what one enabled addon's own `config/default-config.json` declares,
exactly as it was folded into the merge — not the merged view, so the
caller can tell what THIS addon said from what core or another addon said.
Empty for an addon that ships no file, is disabled, or is unknown.

#### Parameters

##### slug

`string`

#### Returns

`Record`\<`string`, `unknown`\>

***

### getAddonRefusal()

> __getAddonRefusal__(`slug`): `string` \| `null`

Defined in: src/managers/ConfigurationManager.ts:714

# 1559: why this add-on must not load — an entry its default-config.json
declares under `ngdpbase.system-category` was refused, or its database
declaration was (#1860) — or null. None of its other keys were merged.

#### Parameters

##### slug

`string`

#### Returns

`string` \| `null`

***

### getAllProperties()

> __getAllProperties__(): [`WikiConfig`](../../../types/Config/interfaces/WikiConfig.md)

Defined in: src/managers/ConfigurationManager.ts:1095

#### Returns

[`WikiConfig`](../../../types/Config/interfaces/WikiConfig.md)

***

### getApplicationName()

> __getApplicationName__(): `string`

Defined in: src/managers/ConfigurationManager.ts:1123

Get application name

#### Returns

`string`

Application name (defaults to 'ngdpbase')

#### Example

```ts
const name = configManager.getApplicationName(); // 'ngdpbase'
```

***

### getAuditConfig()

> __getAuditConfig__(): `object`

Defined in: src/managers/ConfigurationManager.ts:1473

Get audit configuration

#### Returns

`object`

Audit configuration

##### enabled

> __enabled__: `boolean`

##### includeContext

> __includeContext__: `object`

###### includeContext.decision

> __decision__: `boolean`

###### includeContext.ip

> __ip__: `boolean`

###### includeContext.reason

> __reason__: `boolean`

###### includeContext.timestamp

> __timestamp__: `boolean`

###### includeContext.userAgent

> __userAgent__: `boolean`

##### logDirectory

> __logDirectory__: `unknown`

##### logFile

> __logFile__: `unknown`

##### retention

> __retention__: `object`

###### retention.maxAge

> __maxAge__: `unknown`

###### retention.maxFiles

> __maxFiles__: `number`

***

### getBaseURL()

> __getBaseURL__(): `string`

Defined in: src/managers/ConfigurationManager.ts:1132

Get base URL for the wiki

#### Returns

`string`

Base URL (defaults to '<http://localhost:3000>')

***

### getCustomConfigPath()

> __getCustomConfigPath__(): `string`

Defined in: src/managers/ConfigurationManager.ts:1274

This site's custom config file: `<instance data folder>/config/<INSTANCE_CONFIG_FILE or app-custom-config.json>`.

#### Returns

`string`

***

### getCustomProperties()

> __getCustomProperties__(): `Partial`\<[`WikiConfig`](../../../types/Config/interfaces/WikiConfig.md)\>

Defined in: src/managers/ConfigurationManager.ts:1574

Get custom configuration for admin UI

Returns only the custom overrides, useful for displaying
which settings have been customized.

#### Returns

`Partial`\<[`WikiConfig`](../../../types/Config/interfaces/WikiConfig.md)\>

Custom configuration properties only

#### Example

```ts
const customSettings = configManager.getCustomProperties();
console.log('Customized settings:', Object.keys(customSettings));
```

***

### getCustomProperty()

> __getCustomProperty__(`key`): `unknown`

Defined in: src/managers/ConfigurationManager.ts:1110

Get a property value only if it was explicitly set in the custom config
(i.e. not inherited from app-default-config.json).
Returns null if the key is not present in the custom config.

Use this when a theme or other subsystem should own a value by default and
the config should only override it when the operator has explicitly said so.

#### Parameters

##### key

`string`

Configuration key

#### Returns

`unknown`

Custom config value, or null if not explicitly set

***

### getDeclaredProperty()

> __getDeclaredProperty__(`key`, `defaultValue?`): `unknown`

Defined in: src/managers/ConfigurationManager.ts:695

# 1638: read a property as the build declares it — the shipped defaults
with every ENABLED addon's default-config.json folded in — ignoring the
operator's custom file. A registry check asks this when it must tell an
entry the code can act on (shipped, or an enabled addon's) from one only
the operator's file names. No env-override or env-ref resolution.

#### Parameters

##### key

`string`

##### defaultValue?

`unknown` = `null`

#### Returns

`unknown`

***

### getDefaultProperties()

> __getDefaultProperties__(): [`WikiConfig`](../../../types/Config/interfaces/WikiConfig.md)

Defined in: src/managers/ConfigurationManager.ts:1586

Get default configuration for comparison

Returns the base default configuration, useful for comparison
with current settings or resetting individual properties.

#### Returns

[`WikiConfig`](../../../types/Config/interfaces/WikiConfig.md)

Default configuration properties

***

### getDefaultProperty()

> __getDefaultProperty__(`key`, `defaultValue?`): `unknown`

Defined in: src/managers/ConfigurationManager.ts:684

# 896: read a property from the SHIPPED defaults only, ignoring instance
custom-config overrides. Used by vocabulary providers whose seed must not
be shadowed by legacy whole-catalog snapshots in instance config (the
# 895 propagation bug). No env-override or env-ref resolution — defaults
are repo-shipped literals.

#### Parameters

##### key

`string`

##### defaultValue?

`unknown` = `null`

#### Returns

`unknown`

***

### getDirectories()

> __getDirectories__(): `object`

Defined in: src/managers/ConfigurationManager.ts:1233

Get directory paths

#### Returns

`object`

Directory configuration

##### data

> __data__: `unknown`

##### pages

> __pages__: `unknown`

##### resources

> __resources__: `unknown`

##### templates

> __templates__: `unknown`

##### work

> __work__: `unknown`

***

### getEncoding()

> __getEncoding__(): `string`

Defined in: src/managers/ConfigurationManager.ts:1149

Get encoding

#### Returns

`string`

Encoding

***

### getEngine()

> __getEngine__(): [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/managers/BaseManager.ts:458

Get the wiki engine instance

#### Returns

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Example

```ts
const config = this.getEngine().getConfig();
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`getEngine`](../../BaseManager/classes/default.md#getengine)

***

### getEnvControlledKeys()

> __getEnvControlledKeys__(): [`EnvKeyMap`](../../../utils/configEnvKeys/type-aliases/EnvKeyMap.md)

Defined in: src/managers/ConfigurationManager.ts:1063

Which keys the environment owns, and the variable that supplies each (#1089).

Exposed so the admin configuration screen can render those keys read-only
instead of accepting a write that cannot take effect.

#### Returns

[`EnvKeyMap`](../../../utils/configEnvKeys/type-aliases/EnvKeyMap.md)

***

### getFeatureConfig()

> __getFeatureConfig__(`featureName`): `object`

Defined in: src/managers/ConfigurationManager.ts:1390

Get feature configuration

#### Parameters

##### featureName

`string`

Name of feature

#### Returns

`object`

Feature configuration

##### enabled

> __enabled__: `boolean`

***

### getFencedCodeTags()

> __getFencedCodeTags__(): `Set`\<`string`\>

Defined in: src/managers/ConfigurationManager.ts:1166

Get the set of recognised fenced code block language tags.
Tags not in this set should be flagged as unknown on page save.

#### Returns

`Set`\<`string`\>

Lower-cased tag names

***

### getFrontPage()

> __getFrontPage__(): `string`

Defined in: src/managers/ConfigurationManager.ts:1141

Get front page name

#### Returns

`string`

Front page name (defaults to 'Welcome')

***

### getInstallCompletePath()

> __getInstallCompletePath__(): `string`

Defined in: src/managers/ConfigurationManager.ts:1269

This site's install marker (see [installCompletePath](../../../utils/configFiles/functions/installCompletePath.md)).

#### Returns

`string`

***

### getInstanceDataFolder()

> __getInstanceDataFolder__(): `string`

Defined in: src/managers/ConfigurationManager.ts:1264

Get the instance data folder path

Returns the base folder for all instance-specific data (pages, users,
attachments, logs, etc.). This can be configured via the INSTANCE_DATA_FOLDER
environment variable, allowing instance data to be stored anywhere on the
filesystem.

#### Returns

`string`

Absolute path to the instance data folder

#### Example

```ts
const dataFolder = configManager.getInstanceDataFolder();
// Returns '/var/lib/ngdpbase/data' if INSTANCE_DATA_FOLDER=/var/lib/ngdpbase/data
// Returns resolved './data' path if not set
```

***

### getLoggingConfig()

> __getLoggingConfig__(): `object`

Defined in: src/managers/ConfigurationManager.ts:1410

Get logging configuration

#### Returns

`object`

Logging configuration

##### dir

> __dir__: `unknown`

##### level

> __level__: `unknown`

##### maxFiles

> __maxFiles__: `number`

##### maxSize

> __maxSize__: `unknown`

***

### getManagerConfig()

> __getManagerConfig__(`managerName`): `object`

Defined in: src/managers/ConfigurationManager.ts:1369

Get manager-specific configuration

Retrieves all configuration properties for a specific manager,
including enabled status and manager-specific settings.

#### Parameters

##### managerName

`string`

Name of the manager

#### Returns

`object`

Manager configuration object with enabled flag and settings

##### enabled

> __enabled__: `boolean`

#### Example

```ts
const searchConfig = configManager.getManagerConfig('SearchManager');
if (searchConfig.enabled) {
  // Use search manager
}
```

***

### getManagerStats()

> __getManagerStats__(): `Promise`\<[`ManagerStats`](../../BaseManager/interfaces/ManagerStats.md)\>

Defined in: src/managers/BaseManager.ts:799

What this manager holds (#1006).

__Counts and health only — never item contents.__ That is the whole safety
property, and it is why this is not the `getAll()` the question originally
asked for. `AgentTokenManager` holds bearer credentials, `UserManager`
holds users, `ShareManager` holds capability tokens; a generic enumeration
on the base class means the first generic caller — an admin dump panel, a
search indexer, a debug route — reaches all of it by default. A count
cannot leak what it counts.

Optional by override, with a safe default, exactly like `backup()` and
`toMarqueeText()` above. A manager holding no countable collection omits
`count` rather than reporting `0`, because "nothing to count" and "none"
are different answers and an admin row that shows `0` for
`RenderingManager` is noise.

__Never throws.__ A broken manager reports `healthy: false`; it does not
take down the page rendering every other manager. The base wraps nothing,
so an override that can fail must catch its own errors — see the note on
`safeGetManagerStats()`.

__Named `getManagerStats`, not `getStats`.__ Two managers already have a
`getStats()` returning their own domain shape — `FilterManager` (pipeline
statistics, #615) and `NotificationManager` (`NotificationStats`, read by
a live route). Both are correct for what they do, and taking the name from
them would either break those callers or leave `getStats()` meaning two
different things depending on the manager, which is the exact confusion
this contract exists to remove. A generic caller needs a name that means
one thing everywhere.

#### Returns

`Promise`\<[`ManagerStats`](../../BaseManager/interfaces/ManagerStats.md)\>

#### Example

```ts
async getManagerStats(): Promise<ManagerStats> {
  const active = this.list('').filter((r) => !r.revokedAt);
  return { ...await super.getManagerStats(), count: active.length };
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`getManagerStats`](../../BaseManager/classes/default.md#getmanagerstats)

***

### getManagerStatus()

> __getManagerStatus__(): [`ManagerStatus`](../../BaseManager/interfaces/ManagerStatus.md)

Defined in: src/managers/BaseManager.ts:528

What this manager is doing (#1155).

Not `getStatus()`: that name is already taken by `AddonsManager` and
`BackgroundJobManager` for entirely different things, and a base-class
method silently overridden by two subclasses would be worse than a longer
name.

#### Returns

[`ManagerStatus`](../../BaseManager/interfaces/ManagerStatus.md)

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`getManagerStatus`](../../BaseManager/classes/default.md#getmanagerstatus)

***

### getMaskedProperty()

> __getMaskedProperty__(`key`, `defaultValue?`): `unknown`

Defined in: src/managers/ConfigurationManager.ts:879

Get a config property with secrets masked to `"***"` for safe logging
(#775). Returns the unmasked value for plain literals and brace-form
resolved values; only the bare-form `$VAR` secrets return the mask.

Use this on any log path that may print a config value. Boot banners,
admin /config endpoint listings, debug-level config dumps.

#### Parameters

##### key

`string`

Config key

##### defaultValue?

`unknown` = `null`

Default when key absent

#### Returns

`unknown`

The unmasked value, OR `"***"` if the raw config value was a
         bare-form `$VAR` reference (indicating it carries a secret).

***

### getProperty()

> __getProperty__(`key`, `defaultValue?`): `unknown`

Defined in: src/managers/ConfigurationManager.ts:643

Get a configuration property value

Retrieves a property from the merged configuration with optional default value.
Checks environment variables first for specific keys (Docker/Traefik support).

Priority order:

1. Environment variables (for Docker/Traefik deployments)
2. Merged configuration (from config files)
3. Default value parameter

#### Parameters

##### key

`string`

Configuration property key

##### defaultValue?

`unknown` = `null`

Default value if property not found

#### Returns

`unknown`

Configuration value or default

#### Example

```ts
const appName = configManager.getProperty('ngdpbase.application-name', 'MyWiki');
```

***

### getResolvedDataPath()

> __getResolvedDataPath__(`key`, `defaultValue`): `string`

Defined in: src/managers/ConfigurationManager.ts:1332

Get a resolved configuration property for data paths

Convenience method that gets a configuration property and resolves it
if it appears to be a data path (starts with './data' or 'data/').

#### Parameters

##### key

`string`

Configuration property key

##### defaultValue

`string`

Default value if property not found

#### Returns

`string`

Resolved path or original value

#### Example

```ts
const pagesDir = configManager.getResolvedDataPath(
  'ngdpbase.page.provider.filesystem.storagedir',
  './data/pages'
);
```

***

### getRevision()

> __getRevision__(): `number`

Defined in: src/managers/ConfigurationManager.ts:507

A number that changes whenever the configuration in force changes (#2279):
a load or reload, a save, a reset, a restore, a runtime value an add-on
sets. Equal numbers mean nothing was changed through this manager, so
what a reader derived from `getProperty` then still holds. A value
returned by `getProperty` must not be changed in place; that is the one
change this cannot see.

#### Returns

`number`

***

### getRSSConfig()

> __getRSSConfig__(): `object`

Defined in: src/managers/ConfigurationManager.ts:1511

Get RSS settings

#### Returns

`object`

RSS configuration

##### channelDescription

> __channelDescription__: `unknown`

##### channelTitle

> __channelTitle__: `unknown`

##### fileName

> __fileName__: `unknown`

##### generate

> __generate__: `unknown`

##### interval

> __interval__: `unknown`

***

### getSearchConfig()

> __getSearchConfig__(): `object`

Defined in: src/managers/ConfigurationManager.ts:1428

Get search configuration

#### Returns

`object`

Search configuration

##### enabled

> __enabled__: `boolean`

##### indexDir

> __indexDir__: `unknown`

***

### getServerHost()

> __getServerHost__(): `string`

Defined in: src/managers/ConfigurationManager.ts:1174

Get server host

#### Returns

`string`

Server host

***

### getServerPort()

> __getServerPort__(): `number`

Defined in: src/managers/ConfigurationManager.ts:1157

Get server port

#### Returns

`number`

Server port

***

### getSessionHttpOnly()

> __getSessionHttpOnly__(): `boolean`

Defined in: src/managers/ConfigurationManager.ts:1225

Get session httpOnly flag. Defaults to true — the safe direction.

#### Returns

`boolean`

Session httpOnly flag

***

### getSessionMaxAge()

> __getSessionMaxAge__(): `number`

Defined in: src/managers/ConfigurationManager.ts:1199

Get session max age in milliseconds

#### Returns

`number`

Session max age

***

### getSessionSecret()

> __getSessionSecret__(): `string`

Defined in: src/managers/ConfigurationManager.ts:1191

Get session secret.

# 1194: no literal fallback. `ngdpbase.session.secret` is env-owned and
`src/bootstrap-env.ts` guarantees `NGDPBASE_SESSION_SECRET` is set (or
exits) before this class loads, so the env-keys path in getProperty()
always answers. The shipped config value is a public string and must
never be what this returns; an empty string is the honest answer if the
guarantee is somehow broken. `app.ts` does not call this — it reads
`resolveSessionSecret(process.env)` directly — and nothing else does.

#### Returns

`string`

Session secret

***

### getSessionSecure()

> __getSessionSecure__(): `boolean`

Defined in: src/managers/ConfigurationManager.ts:1217

Get session secure flag.

# 1043: these two compared against the STRING `'true'` while the config
values are real booleans, so `getSessionSecure()` returned false even when
the key was set to `true`. Nothing called either one — the session cookie
is configured in `app.ts`, which reads the keys directly — so the bug was
invisible until someone tried to use the accessor the config key advertises.

Kept (public API, an embedder may call them) and made boolean-aware, so the
next caller gets the answer the config actually holds.

#### Returns

`boolean`

Session secure flag

***

### getSystemCategoryProblems()

> __getSystemCategoryProblems__(): readonly `string`[]

Defined in: src/managers/ConfigurationManager.ts:705

# 1559: what was wrong with the system-categories add-ons declare — each
entry refused, and each operator value an owner's declaration overrode —
one line per problem, naming the entry and the field. #1860: the same for
add-on database declarations.

#### Returns

readonly `string`[]

***

### getUnresolvedProperty()

> __getUnresolvedProperty__(`key`, `defaultValue?`): `unknown`

Defined in: src/managers/ConfigurationManager.ts:673

# 1889: a value as configured, every `$NAME` reference in it unresolved,
for the one kind of reader that must see that a secret IS a reference:
AuthManager refuses an outside provider whose client secret is written
into configuration rather than named in the environment. Never for
display: a literal secret would come back as itself.

#### Parameters

##### key

`string`

##### defaultValue?

`unknown` = `null`

#### Returns

`unknown`

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: src/managers/ConfigurationManager.ts:137

Initialize the configuration manager

Loads and merges all configuration files in the correct priority order.

#### Parameters

##### config?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

If default configuration file is not found

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`initialize`](../../BaseManager/classes/default.md#initialize)

***

### invalidateHandlerCache()

> `protected` __invalidateHandlerCache__(`pageUuid`): `void`

Defined in: src/managers/BaseManager.ts:463

A page's data changed outside savePage: its cached content goes, and every cached render re-renders (#1751).

#### Parameters

##### pageUuid

`string`

#### Returns

`void`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`invalidateHandlerCache`](../../BaseManager/classes/default.md#invalidatehandlercache)

***

### isAddonSiteCritical()

> __isAddonSiteCritical__(`slug`): `boolean`

Defined in: src/managers/ConfigurationManager.ts:735

# 1883: whether this add-on's failure to load puts the whole site in
maintenance mode — `ngdpbase.addons.<slug>.site-critical`, from the
operator's file or else the add-on's own, read even when the add-on was
refused. A value that is not exactly true or false counts as true (and
refuses the add-on, [getAddonRefusal](#getaddonrefusal)).

#### Parameters

##### slug

`string`

#### Returns

`boolean`

***

### isBaseUrlExplicit()

> __isBaseUrlExplicit__(): `boolean`

Defined in: src/managers/ConfigurationManager.ts:166

# 642: returns true if `ngdpbase.application.base-url` was explicitly
configured (in customConfig or via the NGDPBASE_BASE_URL env var), as
opposed to falling through to the default. Consumers that need to emit
absolute URLs to outside parties (magic-link auth, schema.org @ids,
email templates) read this to decide whether the configured base URL
is trustworthy or whether they should bail out / disable themselves.

The migration shim in `migrateLegacyBaseUrl()` writes the canonical key
into customConfig before this is called, so legacy `ngdpbase.base-url`
and `ngdpbase.baseURL` configs return true here too.

#### Returns

`boolean`

***

### isInitialized()

> __isInitialized__(): `boolean`

Defined in: src/managers/BaseManager.ts:446

Check if manager has been initialized

#### Returns

`boolean`

True if manager is initialized

#### Example

```ts
if (manager.isInitialized()) {
  // Safe to use manager
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`isInitialized`](../../BaseManager/classes/default.md#isinitialized)

***

### markDegraded()

> `protected` __markDegraded__(`reason`, `configKey?`, `opts?`): `boolean`

Defined in: src/managers/BaseManager.ts:540

Record that this manager is configured, wanted, and not working.

#### Parameters

##### reason

`string`

##### configKey?

`string`

##### opts?

[`AttentionOptions`](../../BaseManager/type-aliases/AttentionOptions.md) = `{}`

#### Returns

`boolean`

true when this is a TRANSITION — a state or reason that differs
  from the current one. Only a transition is an event: a manager that
  starts degraded and stays degraded must not re-emit on every boot, or
  the signal is buried in its own noise.

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markDegraded`](../../BaseManager/classes/default.md#markdegraded)

***

### markDisabled()

> `protected` __markDisabled__(`reason`): `boolean`

Defined in: src/managers/BaseManager.ts:555

Record that this manager is deliberately off. Not a problem (#1155).

#### Parameters

##### reason

`string`

#### Returns

`boolean`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markDisabled`](../../BaseManager/classes/default.md#markdisabled)

***

### markFailed()

> `protected` __markFailed__(`reason`, `configKey?`, `opts?`): `boolean`

Defined in: src/managers/BaseManager.ts:560

Record that this manager could not initialise at all (#1155).

#### Parameters

##### reason

`string`

##### configKey?

`string`

##### opts?

[`AttentionOptions`](../../BaseManager/type-aliases/AttentionOptions.md) = `{}`

#### Returns

`boolean`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markFailed`](../../BaseManager/classes/default.md#markfailed)

***

### markNeedsAttention()

> `protected` __markNeedsAttention__(`reason`, `configKey?`, `opts?`): `boolean`

Defined in: src/managers/BaseManager.ts:550

Record that this manager works, but an administrator has something to do
(#1946). Still `degraded` — it stays on the dashboard, is audited, and
clears with `markReadyIfDegradedBy` — but shown as needing attention, not
as down.

#### Parameters

##### reason

`string`

##### configKey?

`string`

##### opts?

[`AttentionOptions`](../../BaseManager/type-aliases/AttentionOptions.md) = `{}`

#### Returns

`boolean`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markNeedsAttention`](../../BaseManager/classes/default.md#markneedsattention)

***

### markReady()

> `protected` __markReady__(): `boolean`

Defined in: src/managers/BaseManager.ts:571

Record that this manager is working.

Clears the reason rather than leaving a stale one behind — a recovered
manager still carrying "the directory is not writable" is a worse lie than
no reason at all.

#### Returns

`boolean`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markReady`](../../BaseManager/classes/default.md#markready)

***

### markReadyIfDegradedBy()

> `protected` __markReadyIfDegradedBy__(`reason`): `boolean`

Defined in: src/managers/BaseManager.ts:580

Record that this manager is working again, but only while it is still
degraded for `reason` — the one a check set, now cleared by re-running
it (#1842). A different fault set since stays reported.

#### Parameters

##### reason

`string`

#### Returns

`boolean`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markReadyIfDegradedBy`](../../BaseManager/classes/default.md#markreadyifdegradedby)

***

### preflightConfiguredPath()

> `protected` __preflightConfiguredPath__(`configKey`, `path`, `options?`): [`PathPreflightResult`](../../../utils/PathPreflight/interfaces/PathPreflightResult.md)

Defined in: src/managers/BaseManager.ts:495

Preflight a configured filesystem path before any mkdir/write happens.

Wraps `checkConfiguredPath()` with a standardized warning log that names
the manager (`this.constructor.name`) and the originating config key.
Useful for paths that may live on volumes the OS has unmounted (notably
macOS `/Volumes/<X>/...`), where `fs.ensureDir` would otherwise crash
the engine with an opaque `EACCES`.

The caller decides what to do on failure (degrade, fall back to a
default, or treat as fatal).

#### Parameters

##### configKey

`string`

The config key that supplied this path — included in
                  the warning so operators know what to fix.

##### path

`string` \| `null` \| `undefined`

The resolved path to check.

##### options?

[`PathPreflightOptions`](../../../utils/PathPreflight/interfaces/PathPreflightOptions.md) = `{}`

#### Returns

[`PathPreflightResult`](../../../utils/PathPreflight/interfaces/PathPreflightResult.md)

The preflight result. `result.ok === true` means safe
                  to proceed.

#### Example

```ts
const preflight = this.preflightConfiguredPath(
  'ngdpbase.backup.directory',
  this.backupDirectory
);
if (!preflight.ok) {
  // degrade — disable feature, fall back to default, etc.
  return;
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`preflightConfiguredPath`](../../BaseManager/classes/default.md#preflightconfiguredpath)

***

### reload()

> __reload__(): `Promise`\<`void`\>

Defined in: src/managers/ConfigurationManager.ts:417

Reload configuration from disk

#### Returns

`Promise`\<`void`\>

***

### resetToDefaults()

> __resetToDefaults__(`ctx`): `Promise`\<`void`\>

Defined in: src/managers/ConfigurationManager.ts:1540

Reset configuration to defaults (admin only)

Clears all custom configuration and resets to default values.
This operation persists the empty custom configuration to disk.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`void`\>

#### Async

#### Example

```ts
await configManager.resetToDefaults();
console.log('Configuration reset to defaults');
```

***

### resolveDataPath()

> __resolveDataPath__(`relativePath`): `string`

Defined in: src/managers/ConfigurationManager.ts:1295

Resolve a data path relative to the instance data folder

Takes a path that may contain './data/' prefix and resolves it relative
to the configured INSTANCE_DATA_FOLDER. This allows all data paths in
configuration to work correctly regardless of where instance data is stored.

#### Parameters

##### relativePath

`string`

Path to resolve (may include './data/' prefix)

#### Returns

`string`

Absolute resolved path under instance data folder

#### Example

```ts
// With INSTANCE_DATA_FOLDER=/var/lib/ngdpbase/data
configManager.resolveDataPath('./data/pages');     // '/var/lib/ngdpbase/data/pages'
configManager.resolveDataPath('data/users');       // '/var/lib/ngdpbase/data/users'
configManager.resolveDataPath('./data/logs/audit.log'); // '/var/lib/ngdpbase/data/logs/audit.log'
configManager.resolveDataPath('pages');            // '/var/lib/ngdpbase/data/pages'
```

***

### resolveValueAs()

> __resolveValueAs__(`key`, `value`): `unknown`

Defined in: src/managers/ConfigurationManager.ts:754

`value` with its environment references resolved as `getProperty` would
resolve it under `key`, for checking a value before it is saved (#2195).
Throws, as `getProperty` would, on a bare `$VAR` that is not set.

#### Parameters

##### key

`string`

##### value

`unknown`

#### Returns

`unknown`

***

### restore()

> __restore__(`backupData`): `Promise`\<`void`\>

Defined in: src/managers/ConfigurationManager.ts:1652

Restore configuration from backup data

Restores the custom configuration (user overrides) from backup data.
This will overwrite the current custom configuration file and reload
all configurations to rebuild the merged config.

#### Parameters

##### backupData

`ConfigManagerBackupData`

Backup data from backup() method

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`restore`](../../BaseManager/classes/default.md#restore)

***

### restoreIsStaged()

> __restoreIsStaged__(): `boolean`

Defined in: src/managers/BaseManager.ts:707

Whether this manager's `restore()` stages for the next start instead of
writing into the running site (#1723, #1876). BackupManager stages every
such manager in a site restore together, all or nothing, after a backup
of the live data. The default: true when it declares folders or files
(#1985), which BackupManager stages; otherwise false, the restore writes
live.

#### Returns

`boolean`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`restoreIsStaged`](../../BaseManager/classes/default.md#restoreisstaged)

***

### safeGetManagerStats()

> __safeGetManagerStats__(): `Promise`\<[`ManagerStats`](../../BaseManager/interfaces/ManagerStats.md)\>

Defined in: src/managers/BaseManager.ts:819

`getManagerStats()` that cannot break the page it is rendered on.

The contract says an override must not throw, and saying so does not make
it true — an override reads a store, and a store can fail. This is what an
admin surface iterating every manager should call: one manager throwing
becomes one unhealthy row rather than a 500 for all of them.

#### Returns

`Promise`\<[`ManagerStats`](../../BaseManager/interfaces/ManagerStats.md)\>

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`safeGetManagerStats`](../../BaseManager/classes/default.md#safegetmanagerstats)

***

### setProperty()

> __setProperty__(`key`, `value`, `ctx`): `Promise`\<`void`\>

Defined in: src/managers/ConfigurationManager.ts:921

Set a configuration property (updates custom config)

Sets a property value and persists it to the custom configuration file.
This allows runtime configuration changes that survive restarts.

#### Parameters

##### key

`string`

Configuration property key

##### value

`unknown`

Configuration value to set

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who is changing it (#1179): the request's subject, or a
  JobContext for a change no request drove. Mandatory and positional — a
  config change is a security event and its record is read from this.

#### Returns

`Promise`\<`void`\>

#### Async

#### Example

```ts
await configManager.setProperty('ngdpbase.application-name', 'My Custom Wiki', wikiContext.userContext);
```

***

### setRuntimeProperty()

> __setRuntimeProperty__(`key`, `value`): `void`

Defined in: src/managers/ConfigurationManager.ts:1005

Apply a runtime-only config value (not persisted to custom config).

Used by AddonsManager to inject domainDefaults without polluting
the operator's app-custom-config.json. Because this only updates
mergedConfig, the value disappears on next restart unless the addon
is still loaded and re-injects it.

#### Parameters

##### key

`string`

Configuration property key

##### value

`unknown`

Value to apply

#### Returns

`void`

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: src/managers/BaseManager.ts:638

Shutdown the manager and cleanup resources

Override this method in subclasses to perform cleanup logic.
Always call super.shutdown() at the end of overridden implementations.

#### Returns

`Promise`\<`void`\>

#### Example

```ts
async shutdown(): Promise<void> {
  // Your cleanup logic here
  await this.closeConnections();
  await super.shutdown();
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`shutdown`](../../BaseManager/classes/default.md#shutdown)

***

### stagedRestoreAtStart()

> `protected` __stagedRestoreAtStart__(): [`StagedRestoreAtStart`](../../BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`

Defined in: src/managers/BaseManager.ts:398

What this start did with a staged restore of this manager's declared parts (#1985): null when there was none.

#### Returns

[`StagedRestoreAtStart`](../../BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`stagedRestoreAtStart`](../../BaseManager/classes/default.md#stagedrestoreatstart)

***

### toFormOptions()

> __toFormOptions__(`_options?`, `_viewer?`): `Promise`\<[`FormOption`](../../../utils/pluginFormatters/interfaces/FormOption.md)[]\>

Defined in: src/managers/BaseManager.ts:758

Return the choices for a form dropdown, for the forms add-on's
`"optionsSource": "fetch:ManagerName.toFormOptions(list=funds)"`.

The same convention and the same safety rules as `toMarqueeText()`: it is
the one other method page content may reach (`resolveManagerOptions`), it
runs on every render for every viewer, and it must have no side effect.
Offer only what `_viewer` may see. The forms add-on calls it again when the
form is submitted and refuses a value that is not among the choices.

#### Parameters

##### \_options?

`Record`\<`string`, `string`\> = `{}`

Parsed args from the spec, as raw `{ key: value }` strings.

##### \_viewer?

`unknown`

The viewer's context.

#### Returns

`Promise`\<[`FormOption`](../../../utils/pluginFormatters/interfaces/FormOption.md)[]\>

`{ value, label }` choices (plain strings are accepted too), or `[]`.

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`toFormOptions`](../../BaseManager/classes/default.md#toformoptions)

***

### toMarqueeText()

> __toMarqueeText__(`_options?`, `_viewer?`): `Promise`\<`string`\>

Defined in: src/managers/BaseManager.ts:740

Return a plain-text string suitable for use as MarqueePlugin banner text.

Override in subclasses to expose live manager data as a scrolling banner:

  [{MarqueePlugin fetch='PageManager.toMarqueeText()'}]
  [{MarqueePlugin fetch='PageManager.toMarqueeText(limit=5,sort=date-desc)'}]

The default returns '' (no output). Subclasses should return a concise,
single-line summary. Common options (limit, sortBy, sortOrder, since, before)
are available via ManagerFetchOptions; domain-specific keys are read directly
from the raw options object passed by the caller.

#### Parameters

##### \_options?

[`ManagerFetchOptions`](../../../utils/managerUtils/interfaces/ManagerFetchOptions.md) = `{}`

Parsed fetch args from the plugin invocation.

##### \_viewer?

`unknown`

The viewer's context (#1556): show only what they may see.
                 Page text reaches this method, and only this method, on
                 every render for every viewer.

#### Returns

`Promise`\<`string`\>

Plain text, or '' if this manager has nothing to display.

#### Example

```ts
async toMarqueeText(options: ManagerFetchOptions = {}): Promise<string> {
  const pages = await this.getRecentChanges(options.limit ?? 5);
  return 'Recent: ' + pages.map(p => p.name).join('  •  ');
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`toMarqueeText`](../../BaseManager/classes/default.md#tomarqueetext)
