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
- Maps merge per entry. `id` arrays merge by id. A plain array replaces wholesale — do not use a plain array for a catalog an addon or operator must extend.
- Environment-owned keys are declared in `ngdpbase.config.env-keys`. The admin screen must not persist edits that cannot take effect.
- Secrets are named in `ngdpbase.config.secret-keys`. They are reported as set, never rendered.

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
