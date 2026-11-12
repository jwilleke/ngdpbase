[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/orgFilename](../README.md) / filenameFromOrg

# Function: filenameFromOrg()

> __filenameFromOrg__(`__namedParameters`): `string`

Defined in: src/utils/orgFilename.ts:19

URL-first filename derivation for organization JSON-LD files (#617,
locked decision #9).

Domain names are guaranteed unique by registry, so URL-derived slugs are
the strongest uniqueness anchor for the on-disk filename. Falls back to
the org name when no URL is available, then to a literal `organization`
last-ditch default.

  filenameFromOrg({ url: '<https://fairwayscondos.org/>' })
    → 'fairwayscondos-org.json'
  filenameFromOrg({ url: 'www.fairwayscondos.org' })
    → 'www-fairwayscondos-org.json'
  filenameFromOrg({ name: 'The Fairways' })
    → 'the-fairways.json'
  filenameFromOrg({})
    → 'organization.json'

## Parameters

### \_\_namedParameters

#### name?

`string`

#### url?

`string`

## Returns

`string`
