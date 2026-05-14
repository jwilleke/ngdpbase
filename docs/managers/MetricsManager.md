---
name: MetricsManager
description: "OpenTelemetry-backed metrics: route latency histograms, engine init timing, cache hit ratios"
dateModified: '2026-05-14'
category: managers
code: src/managers/MetricsManager.ts
---

# MetricsManager

**Module:** `src/managers/MetricsManager.ts`
**Extends:** [BaseManager](BaseManager.md)
**Complete Guide:** [MetricsManager-Complete-Guide.md](MetricsManager-Complete-Guide.md)

---

## Overview

MetricsManager provides application-level observability using [OpenTelemetry](https://opentelemetry.io/). It exposes metrics in [Prometheus](https://prometheus.io/) format via a standalone HTTP server on port 9464 and optionally pushes to a remote OTLP collector. When telemetry is disabled (the default), every recording method is a no-op with zero performance overhead.

## Key Features

- 7 counters and 7 histograms covering page operations, search, HTTP requests, and engine init
- Prometheus pull-based export on a dedicated port (no auth required for scraping)
- Optional OTLP HTTP push export to a remote OpenTelemetry collector
- Dynamic metric prefix derived from `ngdpbase.application-name`
- Authenticated `/metrics` endpoint on the main app port for browser access
- Fully disabled mode: no SDK initialization, no ports opened, no overhead

## Quick Example

```typescript
// Recording from any manager or route — always use optional chaining
const metrics = engine.getManager<MetricsManager>('MetricsManager');
metrics?.recordPageView?.(durationMs);
metrics?.recordPageSave?.(durationMs);
metrics?.recordHttpRequest?.(durationMs, { method: 'GET', route: '/wiki/:page', status: '200' });
```

## Metrics Reference

All metric names are prefixed with the sanitized `ngdpbase.application-name` value (default: `ngdpbase_`).

### Counters

| Metric | Description | Labels |
| ------ | ----------- | ------ |
| `{app}_page_views_total` | Total page views | -- |
| `{app}_page_saves_total` | Total page saves | -- |
| `{app}_page_deletes_total` | Total page deletions | -- |
| `{app}_search_rebuilds_total` | Total search index rebuilds | -- |
| `{app}_page_index_saves_total` | Total page-index.json writes | -- |
| `{app}_login_attempts_total` | Total login attempts | -- |
| `{app}_http_requests_total` | Total HTTP requests | `method`, `route`, `status` |

### Histograms

| Metric | Description | Labels |
| ------ | ----------- | ------ |
| `{app}_page_view_duration_ms` | Time to render a page view | -- |
| `{app}_page_save_duration_ms` | Time to save a page | -- |
| `{app}_page_delete_duration_ms` | Time to delete a page | -- |
| `{app}_search_rebuild_duration_ms` | Time to rebuild the search index | -- |
| `{app}_page_index_save_duration_ms` | Time to write page-index.json | -- |
| `{app}_engine_init_duration_ms` | Time for engine initialization | -- |
| `{app}_http_request_duration_ms` | Time to handle an HTTP request | `method`, `route`, `status` |

## Endpoints

| Endpoint | Port | Auth | Purpose |
| -------- | ---- | ---- | ------- |
| `http://<host>:9464/metrics` | 9464 | None | Prometheus scraping |
| `http://<host>:3000/metrics` | 3000 | Admin role | Browser access |

## Related Managers

- [ConfigurationManager](ConfigurationManager.md) - Provides all telemetry config keys
- [SearchManager](SearchManager.md) - Calls `recordSearchRebuild()`

## Developer Documentation

For complete API reference, see:

- [MetricsManager-Complete-Guide.md](MetricsManager-Complete-Guide.md)
- [Admin: Telemetry Setup](../admin/Telemetry.md)
