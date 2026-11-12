[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / utils/configPaths

# utils/configPaths

Paths inside a configuration value (#1889).

A configuration key names a value; when the value is a map or a list, each
thing inside it has a path below the key: its map keys and list indices, in
order. `ngdpbase.addons.accounting.accounts` → `checking` → `account-number`
is written `ngdpbase.addons.accounting.accounts.checking.account-number`.

Two readers walk these paths, and they walk them here, the same way:

- `ConfigurationManager` resolves a bare `$NAME` environment reference
    wherever it sits in a value, naming the full path when the variable is
    unset;
- `sensitiveValues` hides what `ngdpbase.config.sensitive-values` names by
    a path, where `*` stands for any one map key (or list index).

## Variables

- [ENV\_REF\_PATTERN](variables/ENV_REF_PATTERN.md)
- [WILDCARD](variables/WILDCARD.md)

## Functions

- [envRefName](functions/envRefName.md)
- [keyOfEntry](functions/keyOfEntry.md)
- [mapConfigValue](functions/mapConfigValue.md)
- [parsePathEntry](functions/parsePathEntry.md)
- [pathMatches](functions/pathMatches.md)
- [pathString](functions/pathString.md)
- [patternBelow](functions/patternBelow.md)
- [valueAt](functions/valueAt.md)
