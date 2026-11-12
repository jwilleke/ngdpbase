[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/SectionUtils](../README.md) / headingSlug

# Function: headingSlug()

> __headingSlug__(`text`): `string`

Defined in: src/utils/SectionUtils.ts:28

Convert heading text to its anchor slug. This IS the heading-id format:
the page converter uses it via markdown-it-anchor (#1273, decision R2), so
section links (#500) and rendered ids cannot drift apart.

Algorithm mirrors GitHub Flavored Markdown:

  1. Lowercase
  2. Remove any character that is not a letter, digit, space, or hyphen
  3. Replace whitespace runs with a single hyphen
  4. Trim leading/trailing hyphens

Examples:
  "PLA (Polylactic Acid)"  → "pla-polylactic-acid"
  "3D Printing Filaments"  → "3d-printing-filaments"
  "Hello World"            → "hello-world"

## Parameters

### text

`string`

## Returns

`string`
