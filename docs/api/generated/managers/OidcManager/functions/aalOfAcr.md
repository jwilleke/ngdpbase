[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/OidcManager](../README.md) / aalOfAcr

# Function: aalOfAcr()

> __aalOfAcr__(`acr`): `1` \| `2` \| `3`

Defined in: src/managers/OidcManager.ts:97

The AAL a token's `acr` stands for (#1576). `acr` names the strongest
phishing resistance when there is one, hiding the level behind it, so
`phr` and `phrh` read conservatively as 2: `phrh` reaches AAL3 only with
more than a token says, and no shipped role needs AAL3. Unknown reads as 1.

## Parameters

### acr

`unknown`

## Returns

`1` \| `2` \| `3`
