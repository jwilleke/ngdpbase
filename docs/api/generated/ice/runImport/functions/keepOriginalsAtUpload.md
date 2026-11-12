[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/runImport](../README.md) / keepOriginalsAtUpload

# Function: keepOriginalsAtUpload()

> __keepOriginalsAtUpload__(`siteDeps`, `request`, `ctx`, `scope`): `Promise`\<[`UploadKeepResult`](../interfaces/UploadKeepResult.md)\>

Defined in: src/ice/runImport.ts:438

Keep the originals of a run whose receiver keeps into an encrypted store,
now, during the upload (#2034). `ctx` is the REQUEST's context: it holds
the user's unlocked key, so the receiver's `keepOriginal` seals the bytes
and the store's sealed index entry while the key is live. Each kept
original is recorded in the ledger by fingerprint and door (#2011), so the
queued run reuses it and never keeps again.

The files are decided exactly as the run decides them (planFile):
noise, a file too large, one nothing reads and one already imported are
not kept. An original already kept through this door is not kept again.
Stops at the first refusal (or failure) and says which file: the caller
then queues nothing. Originals kept before it stay kept, and recorded, so
the next try reuses them.

## Parameters

### siteDeps

[`IceRunDeps`](../interfaces/IceRunDeps.md)

### request

[`IceRunRequest`](../../types/interfaces/IceRunRequest.md)

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

### scope

`string`

## Returns

`Promise`\<[`UploadKeepResult`](../interfaces/UploadKeepResult.md)\>
