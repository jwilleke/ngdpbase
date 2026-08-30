---
name: FilterManager
description: 'Owns the content-filter pipeline: registration, lifecycle, and the one chain both save and render paths use'
dateModified: '2026-08-30'
category: managers
code: src/managers/FilterManager.ts
---

# FilterManager

Owner of the content-filter capability ([#1117](https://github.com/jwilleke/ngdpbase/issues/1117)). Before it, `MarkupParser` constructed the `FilterChain` and hardcoded the three built-in filters, while the save path reached the same chain through `ValidationManager` — same filters, two entry points, owned by nobody in particular, and no way for an addon to contribute one.

## The one chain, two consumers

```text
SAVE     PageManager.assertContentPasses
           → ValidationManager.collectContentErrors → FilterManager
RENDER   RenderingManager → MarkupParser            → FilterManager
```

`MarkupParser` holds a read-only reference to the manager's chain, resolved at initialization (WikiEngine initializes FilterManager first). The parser neither registers filters nor shuts the chain down.

## Contributed path

An addon contributes a filter by subclassing `BaseFilter` and registering during its own initialization:

```typescript
import BaseFilter from 'src/parsers/filters/BaseFilter';

class HouseStyleFilter extends BaseFilter {
  constructor() { super(42, { description: 'house style', phase: 'markup' }); }
  async process(content) { /* … */ return content; }
}

const filterManager = engine.getManager('FilterManager');
await filterManager.registerFilter(new HouseStyleFilter());
```

The built-ins (`SecurityFilter`, `SpamFilter`, `ValidationFilter`) register through this same `registerFilter()` — the extension path is the path the built-ins use, so it is the path that stays tested. Ordering is the filter's `priority`; phases are `markup` (raw source, before Showdown) and `html` (rendered output).

A failed contributed filter is logged and skipped (`registerFilter` returns `false`) — one broken addon filter must not take the pipeline down.

## Configuration

Read at initialization, currently from the historical `ngdpbase.markup.filters.*` namespace (migration to `ngdpbase.filters.*` is #1117 slice 2; the reads are concentrated in this manager so that migration touches one file):

| Key | Default | Meaning |
|---|---|---|
| `ngdpbase.markup.filters.enabled` | `true` | Pipeline master switch — off means no chain at all |
| `ngdpbase.markup.filters.security.enabled` | `false` | SecurityFilter on the render path |
| `ngdpbase.markup.filters.security.block-on-save` | `true` | Save-time gate — registers SecurityFilter even when render filtering is off (#1037) |
| `ngdpbase.markup.filters.spam.enabled` | `false` | SpamFilter |
| `ngdpbase.markup.filters.validation.enabled` | `true` | ValidationFilter |

Pipeline-level policy (`max-filters`, `timeout`, `enable-profiling`, `fail-on-error`, per-filter settings) is read by `FilterChain` itself.

## API

- `registerFilter(filter)` — the contributed path; initializes and adds one filter
- `getFilterChain()` — the chain, or `null` when the pipeline is disabled
- `collectErrors(content, context)` — save-time blocking errors (#596), used by `ValidationManager`
- `getStats()` — pipeline statistics for the admin endpoint (#615)
- `shutdown()` — shuts the chain down; consumers only drop their references
