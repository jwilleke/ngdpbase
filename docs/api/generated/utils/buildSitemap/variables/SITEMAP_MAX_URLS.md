[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/buildSitemap](../README.md) / SITEMAP\_MAX\_URLS

# Variable: SITEMAP\_MAX\_URLS

> `const` __SITEMAP\_MAX\_URLS__: `50000` = `50_000`

Defined in: src/utils/buildSitemap.ts:24

sitemaps.org caps a single file at 50,000 URLs (and 50MB uncompressed).
Past this the caller must emit a sitemap index pointing at several files.
