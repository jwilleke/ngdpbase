[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AgentTokenManager](../README.md) / AgentTokenRecord

# Interface: AgentTokenRecord

Defined in: src/managers/AgentTokenManager.ts:122

## Properties

### aal?

> `optional` __aal?__: `1` \| `2` \| `3`

Defined in: src/managers/AgentTokenManager.ts:150

# 2261: the assurance level (1 to 3) of the minting session when the token
was made, which is `subject:aal` for every request the token makes. Taken
from the session, never from the request, so it cannot exceed it. Absent
on a token made before this was stored: its `subject:aal` is missing and a
condition on it fails closed.

***

### approvedBy?

> `optional` __approvedBy?__: `string`

Defined in: src/managers/AgentTokenManager.ts:140

# 1762 slice 6: the person who minted it while acting for `owner` under a
proxy grant. Absent when the owner minted it themselves.

***

### createdAt

> __createdAt__: `string`

Defined in: src/managers/AgentTokenManager.ts:131

***

### expiresAt

> __expiresAt__: `string`

Defined in: src/managers/AgentTokenManager.ts:132

***

### hash

> __hash__: `string`

Defined in: src/managers/AgentTokenManager.ts:127

`sha256:<hex>` — never the cleartext

***

### id

> __id__: `string`

Defined in: src/managers/AgentTokenManager.ts:123

***

### lastUsedAt

> __lastUsedAt__: `string` \| `null`

Defined in: src/managers/AgentTokenManager.ts:133

***

### name

> __name__: `string`

Defined in: src/managers/AgentTokenManager.ts:125

***

### owner

> __owner__: `string`

Defined in: src/managers/AgentTokenManager.ts:124

***

### prefix

> __prefix__: `string`

Defined in: src/managers/AgentTokenManager.ts:129

Leading characters, kept for display in listings

***

### proxyGrantId?

> `optional` __proxyGrantId?__: `string`

Defined in: src/managers/AgentTokenManager.ts:142

The proxy grant it was minted under. Ending that grant ends this token; it works only while the grant is in force.

***

### revokedAt

> __revokedAt__: `string` \| `null`

Defined in: src/managers/AgentTokenManager.ts:134

***

### revokedBy

> __revokedBy__: `string` \| `null`

Defined in: src/managers/AgentTokenManager.ts:135

***

### scopes

> __scopes__: `string`[]

Defined in: src/managers/AgentTokenManager.ts:130
