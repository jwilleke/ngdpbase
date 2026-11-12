[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / converters/ncm/images

# converters/ncm/images

NCM embedded-image → attachment rule (#728 spec §2.2, Phase 2 Slice 4)

`normalizeToNcm` stays synchronous and dependency-free; image localization
is inherently async (outbound fetch) and engine-coupled (AttachmentManager,
a target page), so it is a __separate post-pass__ with __injected I/O__.
That keeps S1/S2 pure and this slice unit-testable with fakes; S5 wires the
real fetch (`ngdpbase.fetch-timeout-ms`) + `AttachmentManager.uploadAttachment`.

For every `![alt](src)` whose `src` is a remote `http(s)` URL or a `data:`
URI:

- host on the ad/tracker deny-list  → drop  (`img-rejected: adhost`)
- fetch fails / times out           → drop  (`img-rejected: fetch`)
- magic-byte sniff not in the strict raster allowlist (jpeg/png/gif/webp;
   __SVG/RAW excluded — never trust the extension or `Content-Type`__)
                                     → drop  (`img-rejected: type`)
- decoded bytes exceed the size cap → drop  (`img-rejected: size`)
- otherwise → store + rewrite to the local ref (`img-attached`)
Every drop also leaves a deterministic §3.3 placeholder. Local/relative
srcs are left untouched, so the pass is idempotent.

## Interfaces

- [NcmImageConfig](interfaces/NcmImageConfig.md)
- [NcmImageDeps](interfaces/NcmImageDeps.md)

## Functions

- [localizeNcmImages](functions/localizeNcmImages.md)
