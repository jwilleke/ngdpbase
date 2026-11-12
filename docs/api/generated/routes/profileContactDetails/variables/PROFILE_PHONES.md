[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [routes/profileContactDetails](../README.md) / PROFILE\_PHONES

# Variable: PROFILE\_PHONES

> `const` __PROFILE\_PHONES__: readonly \[\{ `autocomplete`: `"home tel-national"`; `contactType`: `"home"`; `key`: `"home"`; `label`: `"Home phone"`; \}, \{ `autocomplete`: `"mobile tel-national"`; `contactType`: `"mobile"`; `key`: `"mobile"`; `label`: `"Mobile phone"`; \}, \{ `autocomplete`: `"work tel-national"`; `contactType`: `"business"`; `key`: `"work"`; `label`: `"Work phone"`; \}, \{ `autocomplete`: `"tel-national"`; `contactType`: `"other"`; `key`: `"other"`; `label`: `"Other phone"`; \}\]

Defined in: src/routes/profileContactDetails.ts:19

The phones on the card: the form's field prefix, the label, and the
`contactType` of its ContactPoint — the kinds the association and
accommodation add-ons write too (a work phone is `business`).
