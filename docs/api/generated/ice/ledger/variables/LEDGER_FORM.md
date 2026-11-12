[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/ledger](../README.md) / LEDGER\_FORM

# Variable: LEDGER\_FORM

> `const` __LEDGER\_FORM__: `2` = `2`

Defined in: src/ice/ledger.ts:28

The ledger file form (#2013). A scope is bound to its receiver and user
(`boundScope`); a file without this form was written before that binding,
under a scope any caller could name, so it belongs to nobody: it is read
as empty, never as anyone's history, and its files are imported once more.
