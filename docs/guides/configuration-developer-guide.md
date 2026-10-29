---
name: Configuration developer guide
description: How to add or change a configuration key — one reader, three merge layers, maps not arrays
dateModified: 2026-10-29
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
- A request header that only a proxy in front of the site should set (Cloudflare's `cf-ipcity`, `cf-ipcountry`) is read only behind a key that says the site is behind it, shipped off: anyone can send that header to a site reached directly. `ngdpbase.server.behind-cloudflare` is the one such key ([#1532](https://github.com/jwilleke/ngdpbase/issues/1532); with `ngdpbase.server.geolite2-city-file`, documented in [AuthManager](../managers/AuthManager.md#two-step-sign-in-1523)). The client IP itself comes from `req.ip`, which `ngdpbase.server.trust-proxy` governs.
- Environment-owned keys are declared in `ngdpbase.config.env-keys`. The admin screen must not persist edits that cannot take effect.
- A secret is never written into a config file: the value is a bare, whole-string `$NAME` reference to an environment variable, and `getProperty` resolves it on every read, never writing the result back. Since [#1889](https://github.com/jwilleke/ngdpbase/issues/1889) this works anywhere inside a map or list too (`"account-number": "$CHECKING_ACCOUNT_NUMBER"` inside `ngdpbase.addons.accounting.accounts.checking`). The rule is the same everywhere: only the whole string, upper-case letters, digits and `_`; `"x$NAME"` is not a reference; `$$` escapes a leading dollar; an unset variable throws, naming the full path (`ngdpbase.addons.accounting.accounts.checking.account-number`). The `${NAME}` form, for a path inside a longer string, applies to a top-level value only. A reader that must see the reference itself, not the secret, uses `getUnresolvedProperty` (AuthManager's outside providers); never use it to display a value. The walk is `src/utils/configPaths.ts`.
- Which values may be shown is declared once, in `ngdpbase.config.sensitive-values` (#1750; `ngdpbase.config.secret-keys` is still read as an alias, with a startup warning). Each key is `secret` or `sensitive`. A `secret` value is shown only to a holder of `secret-reveal` and never logged or audited. A `sensitive` value (the access policies, storage paths, outside services) is shown only to a holder of `admin-read`. An unlisted key whose name looks like a secret and whose value is a string counts as `secret`. Everything that renders configuration (ConfigAccessor, VariablesPlugin, the admin screen, the security posture, log redaction, the audit log) reads this list through `utils/sensitiveValues.ts`, and hidden values are replaced on the server, so they never reach page source. An add-on declares its own entries in its `config/default-config.json`; the map merges per entry.
- An entry may name something inside a key's value by its path ([#1889](https://github.com/jwilleke/ngdpbase/issues/1889)): the key, then each map key or list index, dot-joined. `*` stands for exactly one map key or list index below the key, so `"ngdpbase.addons.accounting.accounts.*.account-number": "secret"` covers every account a site adds. What it names is hidden at the entry's level wherever a top-level value is (the admin screen, page plugins, the posture, log lines, config-change audit records). A bare `$NAME` reference there is shown, since it is not the secret, and saving the admin screen's edit puts a `(hidden)` placeholder back to the stored value. An entry with an empty segment, a `*` inside a segment, or a `*` before `ngdpbase.<category>` is ignored, as an entry with an unknown level is, and the engine warns at boot naming each one. The same matcher (`configPaths.ts`) walks the value for resolving and for hiding.
- An add-on classifies only its own keys: an entry in its `config/default-config.json` must be `ngdpbase.addons.<slug>` or under it. An entry for core's keys or another add-on's refuses the add-on (it is not loaded and none of its keys apply), as a database declared under another slug does (#1860), because `false` or `sensitive` there would unhide someone else's secret.

## How to add a key

- 1 Add the key and its shipped default to `config/app-default-config.json`.
- 2 If it is env-owned, add it to `ngdpbase.config.env-keys` and `.env.example`.
- 3 Read it with `ConfigurationManager.getProperty(key, shippedDefault)`.
- 4 If it is a security-related setting the instance should report, add it to `ngdpbase.security.posture` (see [security-posture.md](../security-posture.md) D15/D16). That change is an audited event.
- 5 Decide who may see its value, every time, and record it in `ngdpbase.config.sensitive-values` (an add-on in its own `config/default-config.json`):
  - `secret` — it lets someone act as the instance or a user: a password, salt, signing key, client secret, API key or token.
  - `sensitive` — it tells how the instance is run: a storage path, a program the site runs (`ngdpbase.export.pdf.provider.local-chrome.chromium-path`), an outside service's address or identifier, the access policies.
  - neither — leave it off the list; anyone who can read a page may see it. A key whose name looks like a secret (secret, password, token, credential, api-key, private-key) cannot be "neither": rename it, or declare it.
  - a map whose entries hold a secret: declare the path, with `*` for the map key (`ngdpbase.addons.<slug>.accounts.*.account-number`), and ship the value as a `$NAME` reference, never the secret.

  `npm run lint:sensitive` (part of `npm run lint`) fails on a secret-looking string setting that isn't declared; the other two choices are yours to make.
- 6 Document it next to the module that consumes it (`docs/managers/…`), not as a second catalog.

## How you know you are done

- The key appears in `config/app-default-config.json`.
- Its level is decided: declared in `ngdpbase.config.sensitive-values`, or deliberately left off because anyone may see it. `npm run lint:sensitive` passes.
- No new `JSON.parse` of a config file outside `ConfigurationManager` / `src/utils/configFiles.ts`.
- `npm test -- src/managers/__tests__/ConfigurationManager`

## See also

- [ConfigurationManager](../managers/ConfigurationManager.md)
- Keys added with [#1974](https://github.com/jwilleke/ngdpbase/issues/1974), documented with their module: `ngdpbase.export.pdf.*`, the PDF provider (`none`, `local-chrome`, `chrome-service`) and its settings, in [ExportManager](../managers/ExportManager.md#configuration) (read on every render, no restart; a `chrome-service` URL on a private address also needs its range in `ngdpbase.security.egress.allowed-ranges`), `ngdpbase.mail.attachments.max-bytes` in [EmailManager](../managers/EmailManager.md#configuration) (read at startup)
- `ngdpbase.share.public-base-url` ([#2117](https://github.com/jwilleke/ngdpbase/issues/2117)), the address share links are made with when it differs from `ngdpbase.application.base-url`, documented in [sharing.md](../sharing.md#configuration) (read on every link shown; an invalid value is ignored and named at startup)
- [bootstrap-developer-guide.md](bootstrap-developer-guide.md)
- [security-developer-guide.md](security-developer-guide.md) — addon merge of permissions and policies
- `src/utils/configFiles.ts`, `src/utils/configEnvKeys.ts`
- `config/app-default-config.json`

## Known gaps

- [#1190](https://github.com/jwilleke/ngdpbase/issues/1190)
- [#1193](https://github.com/jwilleke/ngdpbase/issues/1193)
- [#1028](https://github.com/jwilleke/ngdpbase/issues/1028)
- [#1889](https://github.com/jwilleke/ngdpbase/issues/1889) — secrets inside a map:
  - A value hidden at a path cannot be revealed from the admin screen: reveal works one top-level key at a time. Keep such values as `$NAME` references, which are shown.
  - A map key that contains a `.` cannot be named by a path.
  - An unset `$NAME` anywhere in a map makes the whole key unreadable (it throws), so an add-on's `register()` config omits that whole key, with a warning, not just the one field.
  - Log redaction is built once at boot, from the values in force then; a value changed later on the admin screen is not redacted until a restart (as for a top-level secret).
  - `getCustomProperty` and the configuration backup hold values as configured: a `$NAME` reference stays a reference, and a secret written as a literal is in them as it is in the file.
  - A variable whose own value looks like `$NAME` would be shown at a hidden path, since a reference is.
