[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / utils/sensitiveValues

# utils/sensitiveValues

Which configuration values may be shown, and to whom (#1750).

One declaration, `ngdpbase.config.sensitive-values` (renamed from
`ngdpbase.config.secret-keys`, still read as an alias), maps a key to a level:

- `secret`    — never shown except to a holder of `secret-reveal` (which
                  asks for a fresh sign-in), never written to the audit log
                  or a log line;
- `sensitive` — shown only to a holder of `admin-read`: how the instance is
                  run (the access policies, storage paths, outside services).

A key that isn't listed but whose name looks like a secret is treated as
`secret` — a backstop, so a forgotten entry fails closed. The same backstop
hides secret-looking fields nested inside an object value (an OIDC client's
`client_secret` inside `oidc-auth-server.clients`).

An entry may also name something inside a key's value by its path (#1889):
`ngdpbase.addons.accounting.accounts.*.account-number`, where `*` stands for
any one map key (or list index). It hides what sits there, at the entry's
level, wherever a value is shown, except a bare `$NAME` reference, which is
a pointer to the environment, not the secret. The paths are walked by
`utils/configPaths.ts`, the same walk that resolves `$NAME` inside a value.

Hidden values are replaced on the server, before any HTML is built: they
never reach a page, its source or the parse cache.

## Interfaces

- [ValueViewer](interfaces/ValueViewer.md)

## Type Aliases

- [ValueLevel](type-aliases/ValueLevel.md)

## Variables

- [HIDDEN](variables/HIDDEN.md)
- [LEGACY\_SECRET\_KEYS\_KEY](variables/LEGACY_SECRET_KEYS_KEY.md)
- [NO\_SECRETS](variables/NO_SECRETS.md)
- [SENSITIVE\_VALUES\_KEY](variables/SENSITIVE_VALUES_KEY.md)

## Functions

- [hideDeclaredPaths](functions/hideDeclaredPaths.md)
- [keepHiddenValues](functions/keepHiddenValues.md)
- [levelOf](functions/levelOf.md)
- [looksSecret](functions/looksSecret.md)
- [secretKeys](functions/secretKeys.md)
- [secretValuesBelow](functions/secretValuesBelow.md)
- [sensitiveValueProblems](functions/sensitiveValueProblems.md)
- [shownValue](functions/shownValue.md)
- [usesLegacyName](functions/usesLegacyName.md)
- [valueLevels](functions/valueLevels.md)
