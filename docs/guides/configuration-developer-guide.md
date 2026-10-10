---
name: Configuration developer guide
description: How to add or change a configuration key — one reader, three merge layers, maps not arrays
dateModified: 2026-09-06
category: guides
relatedModules: [ConfigurationManager]
---

# Configuration developer guide

How to add or change a configuration key. Config selects and parameterises; it never expresses logic.

## Standing rules

- Read configuration only through `ConfigurationManager.getProperty`. Do not open `app-default-config.json` from application code.
- Keys are `ngdpbase.{category}.{property}`. Declare every key in `config/app-default-config.json` with a `_comment_*` when the default is not obvious.
- Merge is three layers, lowest first: shipped defaults; each enabled addon's `config/default-config.json`; the operator's `app-custom-config.json`.
- Maps merge per entry. Arrays of objects merge by `id` (or `authproviderid`). A plain array replaces wholesale — do not use a plain array for a catalog an addon or operator must extend.
- A set of names is a map of `"name": true` ([#1612](https://github.com/jwilleke/ngdpbase/issues/1612)). A later layer adds a name with `true`, removes one with `false`, or adds several with a plain list of names. Read it with `enabledEntries()` from `src/utils/configFiles.ts`, which accepts either form.
- Environment-owned keys are declared in `ngdpbase.config.env-keys`. The admin screen must not persist edits that cannot take effect.
- Which values may be shown is declared once, in `ngdpbase.config.sensitive-values` (#1750; `ngdpbase.config.secret-keys` is still read as an alias, with a startup warning). Each key is `secret` or `sensitive`. A `secret` value is shown only to a holder of `secret-reveal` and never logged or audited. A `sensitive` value (the access policies, storage paths, outside services) is shown only to a holder of `admin-read`. An unlisted key whose name looks like a secret and whose value is a string counts as `secret`. Everything that renders configuration (ConfigAccessor, VariablesPlugin, the admin screen, log redaction, the audit log) reads this list through `utils/sensitiveValues.ts`, and hidden values are replaced on the server, so they never reach page source. An add-on declares its own entries in its `config/default-config.json`; the map merges per entry.

## How to add a key

1. Add the key and its shipped default to `config/app-default-config.json`.
2. If it is env-owned, add it to `ngdpbase.config.env-keys` and `.env.example`.
3. Read it with `ConfigurationManager.getProperty(key, shippedDefault)`.
4. If it is a security-related setting the instance should report, add it to `ngdpbase.security.posture` (see [security-posture.md](../security-posture.md) D15/D16). That change is an audited event.
5. Document it next to the module that consumes it (`docs/managers/…`), not as a second catalog.

## How you know you are done

- The key appears in `config/app-default-config.json`.
- No new `JSON.parse` of a config file outside `ConfigurationManager` / `src/utils/configFiles.ts`.
- `npm test -- src/managers/__tests__/ConfigurationManager`

## See also

- [ConfigurationManager](../managers/ConfigurationManager.md)
- [bootstrap-developer-guide.md](bootstrap-developer-guide.md)
- [security-developer-guide.md](security-developer-guide.md) — addon merge of permissions and policies
- `src/utils/configFiles.ts`, `src/utils/configEnvKeys.ts`
- `config/app-default-config.json`

## Known gaps

- [#1190](https://github.com/jwilleke/ngdpbase/issues/1190)
- [#1191](https://github.com/jwilleke/ngdpbase/issues/1191)
- [#1193](https://github.com/jwilleke/ngdpbase/issues/1193)
- [#1028](https://github.com/jwilleke/ngdpbase/issues/1028)
