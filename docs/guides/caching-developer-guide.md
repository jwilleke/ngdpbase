---
name: Caching developer guide
description: One page cache, keyed by the viewer and their roles, that follows every input it renders through data versions
dateModified: 2026-10-21
category: guides
relatedModules: [CacheManager, MarkupParser, PluginManager, PageManager]
---

# Caching developer guide

A cached value is never "fine to be slightly stale". It is keyed by every input it was computed from, or it re-computes when one of those inputs changes. A cache that serves what the reader could see before a role was revoked is an access defect ([#1751](https://github.com/jwilleke/ngdpbase/issues/1751)).

## Standing rules

- __One page cache.__ A rendered page is cached in one place: the markup parser's `MarkupParser-ParseResults` region, read through `RegionCache.getOrSetVersioned`. No route, plugin or add-on keeps its own copy of rendered HTML. (The view route's separate `rendered-pages` cache was removed in #1751: it sat in front of the parser and served renders the parser had already invalidated.) Syntax handlers do not cache their own output: the `MarkupParser-HandlerResults` region was removed in #1751, because Include/If/UserCheck, plugin syntax, interwiki and style output was cached for 600 s outside the data versions, so a page including an edited page kept showing the old text.
- __The key holds who is looking.__ The parse-result key covers the page text, page name, the viewer's username __and roles__, the query string, the viewer's locale, time zone and date/time format preferences and their pinned pages (left menu), plus a 5-minute time bucket. Roles are in the key because they change without the username changing: a role revoked, or a session signed in below a role's required level.
- __Everything else is a data version.__ A data source is a __topic__, by convention the name of the manager that owns it. The owner bumps its topic after every write, at the one door its writes go through (`CacheManager.bump(topic)`). A cached entry remembers the version of each topic it read and is served only while they are all unchanged.
- __Every render reads page, configuration and account data.__ Any page can link, list or include pages, show configuration and name people, so the parser makes every render depend on `PageManager`, `ConfigurationManager` and `UserManager` (`BASE_RENDER_TOPICS` in `src/cache/CacheDependencies.ts`). Those three managers bump after every page change, saved configuration change and account change.
- __Plugins declare nothing.__ While a page is being cached, a plugin's `context.engine` records each manager it fetches with `getManager(name)` as data the render read (`PluginManager`). A plugin reaching data that isn't a manager calls `context.dependsOn(topic)`.
- __Time is a data source too.__ `CLOCK_TOPIC` (`'Clock'`) has the current minute as its version, so nothing writes it. A plugin whose output drifts with time (the time to the minute, uptime, who is signed in, health) calls `context.dependsOn(CLOCK_TOPIC)` and its page re-renders at most once a minute. Only output that differs on every request (seconds, a per-render counter) sets `volatile: true` or calls `context.markVolatile()`: that page is rendered on every request, so keep it off pages everyone sees, such as the left menu.
- __Sealed pages are never cached.__ A page in an encrypted store resolves only through its owner's session, so its render stays out of the shared cache (the parser asks `PageManager.isSharedIndexable`, #1423).

## How to add a manager whose data appears on pages

- Name the topic after the manager, and declare it once in `src/cache/CacheDependencies.ts` when core code refers to it.
- Route every write through one private helper that writes, then bumps the topic: see `UserManager.writeAccounts`, `AttachmentManager.writeAttachments` and `MediaManager.writeMedia`. A write that skips the helper leaves pages stale.
- Data that belongs to one page (its comments, its footnotes) bumps the page topic instead: after the write, call `invalidateHandlerCache(pageUuid)` (`BaseManager`), which goes through `PageManager.invalidatePageCache`. See `CommentManager` and `FootnoteManager`.
- Nothing else is needed: a plugin that fetches the manager already depends on it.

## How to add a plugin

- Fetch managers through the engine you are given for this render: `context.engine` in `execute`, or the engine passed to `fetch(engine)`. A reference kept from `initialize` is not tracked.
- If the output drifts with time, call `context.dependsOn(CLOCK_TOPIC)`. Set `volatile: true` only if it differs on every request.

## How you know you are done

- A test like `src/parsers/__tests__/MarkupParser.readThrough.test.ts`: the page is served from the cache while nothing changes, and re-renders after the owner bumps.
- `npm test -- src/parsers/__tests__/MarkupParser.readThrough`

## See also

- [CacheManager](../managers/CacheManager.md) and the [Complete Guide](../managers/CacheManager-Complete-Guide.md)
- [addons-developer-guide.md](addons-developer-guide.md): plugins and the page cache
- [managers-developer-guide.md](managers-developer-guide.md)

## Known gaps

- `[{$variable}]` values that change on their own (uptime, the time) are bounded only by the 5-minute bucket in the parse-result key; variables are not plugins, so they cannot be marked volatile.
