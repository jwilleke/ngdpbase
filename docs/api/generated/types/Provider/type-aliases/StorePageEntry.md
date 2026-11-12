[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Provider](../README.md) / StorePageEntry

# Type Alias: StorePageEntry

> __StorePageEntry__ = [`UserCatalogPage`](../../../utils/privateStoreCatalogs/interfaces/UserCatalogPage.md)

Defined in: src/types/Provider.ts:741

A page in a private store (#1456): its entry in the store's OWN page index,
beside `store.json` — never in the global `page-index.json`. The same shape
the user-level sealed catalogue used (#1385), which the store index replaces.
