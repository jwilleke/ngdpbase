[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [upgradeChecks/wording](../README.md) / UPGRADE\_RESULTS

# Variable: UPGRADE\_RESULTS

> `const` __UPGRADE\_RESULTS__: `object`

Defined in: src/upgradeChecks/wording.ts:9

What the button's result says. The address carries only the key, never the text, and the page writes the words.

## Type Declaration

### already

> `readonly` __already__: `object`

#### already.ok

> `readonly` __ok__: `false` = `false`

#### already.text

> `readonly` __text__: `"Those pages were already fixed. There's nothing more to do."` = 'Those pages were already fixed. There\\'s nothing more to do.'

### failed

> `readonly` __failed__: `object`

#### failed.ok

> `readonly` __ok__: `false` = `false`

#### failed.text

> `readonly` __text__: `"Nothing was changed. Try the button again. If it still doesn't work, restart the site and try once more."` = 'Nothing was changed. Try the button again. If it still doesn\\'t work, restart the site and try once more.'

### fixed

> `readonly` __fixed__: `object`

#### fixed.ok

> `readonly` __ok__: `true` = `true`

#### fixed.text

> `readonly` __text__: `"Administrators can now edit those pages."` = `'Administrators can now edit those pages.'`
