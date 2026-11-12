[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/redactSecrets](../README.md) / refreshRedactedSecrets

# Function: refreshRedactedSecrets()

> __refreshRedactedSecrets__(`configManager`): [`RefreshResult`](../interfaces/RefreshResult.md)

Defined in: src/utils/redactSecrets.ts:121

Rebuild the redaction table from the current configuration.

Call after ConfigurationManager is initialized, and again after any change to
the secret keys or their values. Safe to call repeatedly — it replaces the
table wholesale rather than accumulating.

## Parameters

### configManager

[`SecretConfigReader`](../interfaces/SecretConfigReader.md) \| `null` \| `undefined`

anything exposing `getProperty` (ConfigurationManager)

## Returns

[`RefreshResult`](../interfaces/RefreshResult.md)

what is now active, and which listed keys were skipped and why
