[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreCrypto](../README.md) / UserKeyEnvelope

# Interface: UserKeyEnvelope

Defined in: src/utils/privateStoreCrypto.ts:53

## Properties

### kdf

> __kdf__: [`ScryptKdf`](ScryptKdf.md) & `object`

Defined in: src/utils/privateStoreCrypto.ts:55

#### Type Declaration

##### salt

> __salt__: `string`

***

### passwordWrap

> __passwordWrap__: [`WrappedBlob`](WrappedBlob.md)

Defined in: src/utils/privateStoreCrypto.ts:56

***

### personKey?

> `optional` __personKey?__: [`PersonKey`](PersonKey.md)

Defined in: src/utils/privateStoreCrypto.ts:64

The person's key pair (#1762 slice 5). Made with the KEK at enrolment, or
the first time the store is unlocked after this field existed; absent
until then.

***

### recoveryKdf

> __recoveryKdf__: `object`

Defined in: src/utils/privateStoreCrypto.ts:57

#### alg

> __alg__: `"bip39-pbkdf2"`

***

### recoveryWrap

> __recoveryWrap__: [`WrappedBlob`](WrappedBlob.md)

Defined in: src/utils/privateStoreCrypto.ts:58

***

### version

> __version__: `1`

Defined in: src/utils/privateStoreCrypto.ts:54
