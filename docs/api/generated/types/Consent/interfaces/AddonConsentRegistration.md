[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Consent](../README.md) / AddonConsentRegistration

# Interface: AddonConsentRegistration

Defined in: src/types/Consent.ts:142

What an add-on registers at load (#1603).

## Properties

### documents

> __documents__: `string`[]

Defined in: src/types/Consent.ts:148

Page slugs of the add-on's documents, each starting `<slug>-`
(`phr-terms-of-service`, `phr-privacy-policy`). Shipped as the add-on's
own pages, with `version:` and `effective:` front matter.

***

### paths?

> `optional` __paths?__: `string`[]

Defined in: src/types/Consent.ts:155

URL path prefixes where a person uses the add-on in the browser
(`/phr`). A person who has it on and has not accepted a changed version
is asked there before going on. Optional: without it they are asked
only when they next turn it on.
