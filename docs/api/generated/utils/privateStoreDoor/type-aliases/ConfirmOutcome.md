[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreDoor](../README.md) / ConfirmOutcome

# Type Alias: ConfirmOutcome

> __ConfirmOutcome__ = \{ `envelope`: [`UserKeyEnvelope`](../../privateStoreCrypto/interfaces/UserKeyEnvelope.md); `kek`: `Buffer`; `status`: `"confirmed"`; \} \| \{ `attemptsLeft`: `number`; `mnemonic`: `string`; `status`: `"retry"`; \} \| \{ `status`: `"exhausted"`; \} \| \{ `status`: `"none"`; \}

Defined in: src/utils/privateStoreDoor.ts:312
