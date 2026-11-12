[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [security/PolicyInformationPoint](../README.md) / systemPrincipalFromConfig

# Function: systemPrincipalFromConfig()

> __systemPrincipalFromConfig__(`configManager`): `string`

Defined in: src/security/PolicyInformationPoint.ts:48

The system principal's name from configuration, or a refusal (#631, #1953).

`ngdpbase.system.principal` ships as the bare env-ref `$NGDPBASE_SYSTEM_USER`,
which throws when the variable is unset; an empty value is refused the same
way. One rule for both readers: the PIP at run time, and `WikiEngine` right
after configuration loads, before any manager writes — so a first boot
without a principal refuses before the admin account exists, not after it
was written without its person (#1953).

## Parameters

### configManager

\{ `getProperty`(`key`, `defaultValue`): `unknown`; \} \| `null` \| `undefined`

## Returns

`string`
