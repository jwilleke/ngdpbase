# MetricsManager Complete Guide

__Module:__ `src/managers/MetricsManager.ts`
__Quick Reference:__ [MetricsManager.md](MetricsManager.md)
__Admin Setup:__ [Telemetry.md](../admin/Telemetry.md)

---

## Table of Contents

1. [Architecture](#architecture)
2. [Initialization](#initialization)
3. [Configuration](#configuration)
4. [Recording Methods](#recording-methods)
5. [Disabled Mode](#disabled-mode)
6. [Instrumented Code Paths](#instrumented-code-paths)
7. [API Reference](#api-reference)
8. [Integration Examples](#integration-examples)

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                      MetricsManager                          │
│  recordPageView()   recordPageSave()   recordPageDelete()    │
│  recordSearchRebuild()                recordLoginAttempt()   │
│  recordPageIndexSave()  recordEngineInit()                   │
│  recordHttpRequest()    isEnabled()    getMetricsHandler()   │
└──────────────┬───────────────────────────────────────────────┘
               │
       ┌───────┴────────────────────┐
       ▼                            ▼
┌─────────────────┐     ┌──────────────────────────────┐
│ PrometheusExport│     │ PeriodicExportingMetricReader │
│ port 9464       │     │ OTLPMetricExporter (optional) │
└─────────────────┘     └──────────────────────────────┘
       │                            │
       └────────────┬───────────────┘
                    ▼
          ┌──────────────────┐
          │  MeterProvider   │
          │  Meter('{app}')  │
          │  7 counters      │
          │  7 histograms    │
          └──────────────────┘
```

### Properties

| Property | Type | Description |
| -------- | ---- | ----------- |
| `enabled` | `boolean` | Whether telemetry is active |
| `meter` | `Meter \| null` | OpenTelemetry meter instance |
| `meterProvider` | `MeterProvider \| null` | SDK meter provider |
| `prometheusExporter` | `PrometheusExporter \| null` | Standalone metrics server |
| `otlpReader` | `PeriodicExportingMetricReader \| null` | OTLP push reader |
| `counters` | `Record<string, Counter>` | All 7 counter instruments |
| `histograms` | `Record<string, Histogram>` | All 7 histogram instruments |

---

## Initialization

MetricsManager is registered in WikiEngine after CacheManager. Its `initialize()` reads all telemetry config, then conditionally creates the OpenTelemetry SDK components.

```typescript
// WikiEngine registration order
await cacheManager.initialize();
await metricsManager.initialize();   // ← here
// ... other managers
```

When `ngdpbase.telemetry.enabled` is `false`:

- No OpenTelemetry SDK is created
- No HTTP servers are opened
- All `record*()` methods become no-ops
- `getMetricsHandler()` returns `null`

When enabled, initialization creates:

1. A `PrometheusExporter` serving on the configured port/host/path
2. Optionally a `PeriodicExportingMetricReader` wrapping an `OTLPMetricExporter`
3. A `MeterProvider` with both readers
4. A `Meter` named after the application prefix
5. All 14 instruments (7 counters + 7 histograms)

---

## Configuration

All settings come from ConfigurationManager. See [Telemetry.md](../admin/Telemetry.md) for the complete configuration reference.

| Property | Type | Default | Description |
| -------- | ---- | ------- | ----------- |
| `ngdpbase.telemetry.enabled` | boolean | `false` | Enable metrics collection |
| `ngdpbase.telemetry.service-name` | string | `""` | OTLP `service.name` resource attribute |
| `ngdpbase.telemetry.metrics.port` | number | `9464` | Prometheus exporter port |
| `ngdpbase.telemetry.metrics.host` | string | `"0.0.0.0"` | Prometheus exporter bind address |
| `ngdpbase.telemetry.metrics.path` | string | `"/metrics"` | Prometheus scrape path |
| `ngdpbase.telemetry.metrics.interval` | number | `15000` | Collection interval (ms) |
| `ngdpbase.telemetry.otlp.enabled` | boolean | `false` | Enable OTLP push export |
| `ngdpbase.telemetry.otlp.endpoint` | string | `""` | OTLP collector URL |
| `ngdpbase.telemetry.otlp.headers` | object | `{}` | Auth headers for OTLP requests |
| `ngdpbase.telemetry.otlp.interval` | number | `30000` | OTLP push interval (ms) |
| `ngdpbase.telemetry.otlp.timeout` | number | `30000` | OTLP export timeout (ms) |

### Metric Prefix

The metric prefix is derived from `ngdpbase.application-name`:

- Value is lowercased
- Non-alphanumeric characters are replaced with underscores
- Used as the name for the OpenTelemetry `Meter` and as the metric name prefix

Examples:

| applicationName | Metric prefix |
| --------------- | ------------- |
| `ngdpbase` | `ngdpbase_` |
| `jimstest` | `jimstest_` |
| `My Wiki` | `my_wiki_` |

### Service Name

`ngdpbase.telemetry.service-name` sets the `service.name` [resource attribute](https://opentelemetry.io/docs/specs/semconv/resource/#service) on all exported metrics. This is what appears in Grafana's "Job" or "Service" filter when querying OTLP data. If empty, the metric prefix is used as a fallback.

---

## Recording Methods

All methods are safe to call even when disabled. The double optional chaining pattern (`?.method?.()`) also guards against the manager not being registered.

### recordPageView(durationMs)

Records a page view and its render duration.

```typescript
recordPageView(durationMs: number): void
```

- Increments: `{app}_page_views_total`
- Records: `{app}_page_view_duration_ms`
- Called from: `WikiRoutes.viewPage()`

---

### recordPageSave(durationMs)

Records a page save and its duration.

```typescript
recordPageSave(durationMs: number): void
```

- Increments: `{app}_page_saves_total`
- Records: `{app}_page_save_duration_ms`
- Called from: `WikiRoutes.savePage()`

---

### recordPageDelete(durationMs)

Records a page deletion and its duration.

```typescript
recordPageDelete(durationMs: number): void
```

- Increments: `{app}_page_deletes_total`
- Records: `{app}_page_delete_duration_ms`
- Called from: `WikiRoutes.deletePage()`

---

### recordSearchRebuild(durationMs)

Records a search index rebuild and its duration. Called for both the cold-path NAS rebuild and the fast-path in-memory rebuild.

```typescript
recordSearchRebuild(durationMs: number): void
```

- Increments: `{app}_search_rebuilds_total`
- Records: `{app}_search_rebuild_duration_ms`
- Called from: `LunrSearchProvider.buildIndex()`

---

### recordPageIndexSave(durationMs)

Records a write of the page index file (`page-index.json`) and its duration.

```typescript
recordPageIndexSave(durationMs: number): void
```

- Increments: `{app}_page_index_saves_total`
- Records: `{app}_page_index_save_duration_ms`
- Called from: `VersioningFileProvider.savePageIndex()`

---

### recordLoginAttempt()

Records a login attempt (both successful and failed).

```typescript
recordLoginAttempt(): void
```

- Increments: `{app}_login_attempts_total`
- Called from: `WikiRoutes.processLogin()`

---

### recordEngineInit(durationMs)

Records the total engine initialization duration. Called once per startup after all managers have initialized.

```typescript
recordEngineInit(durationMs: number): void
```

- Records: `{app}_engine_init_duration_ms`
- Called from: `WikiEngine.initialize()`

---

### recordHttpRequest(durationMs, attributes)

Records an HTTP request, its duration, and route/status labels. The `route` attribute uses normalized path patterns (e.g., `/wiki/:page`) rather than actual page names to avoid high-cardinality label values.

```typescript
recordHttpRequest(
  durationMs: number,
  attributes: { method: string; route: string; status: string }
): void
```

- Increments: `{app}_http_requests_total` (with attributes)
- Records: `{app}_http_request_duration_ms` (with attributes)
- Called from: Express middleware in `app.js`

---

### isEnabled()

Returns whether telemetry is active.

```typescript
isEnabled(): boolean
```

Use this before any setup work that should only run when metrics are on.

---

### getMetricsHandler()

Returns an Express `RequestHandler` that serves the Prometheus text format on the main app's `/metrics` route. Returns `null` when disabled.

```typescript
getMetricsHandler(): RequestHandler | null
```

The returned handler requires the caller to enforce authentication (admin role). The handler itself does not check auth — that is done by the route registration in `app.js`.

---

### shutdown()

Cleanly shuts down OTLP reader and MeterProvider. Called automatically by WikiEngine on SIGINT/SIGTERM.

```typescript
async shutdown(): Promise<void>
```

---

## Disabled Mode

When `ngdpbase.telemetry.enabled` is `false`:

- `initialize()` exits after reading config, before creating any SDK objects
- All `record*()` methods check `this.enabled` at the top and return immediately
- `getMetricsHandler()` returns `null` — the `/metrics` route is not registered
- `isEnabled()` returns `false`
- No ports are opened, no background threads started
- `shutdown()` is a no-op

This means disabling telemetry has no measurable runtime cost.

---

## Instrumented Code Paths

| Operation | File | Method | Metrics recorded |
| --------- | ---- | ------ | ---------------- |
| Page view | `src/routes/WikiRoutes.ts` | `viewPage()` | `recordPageView` |
| Page save | `src/routes/WikiRoutes.ts` | `savePage()` | `recordPageSave` |
| Page delete | `src/routes/WikiRoutes.ts` | `deletePage()` | `recordPageDelete` |
| Login attempt | `src/routes/WikiRoutes.ts` | `processLogin()` | `recordLoginAttempt` |
| Search rebuild | `src/providers/LunrSearchProvider.ts` | `buildIndex()` | `recordSearchRebuild` |
| Page index save | `src/providers/VersioningFileProvider.ts` | `savePageIndex()` | `recordPageIndexSave` |
| HTTP requests | `app.js` | Express middleware | `recordHttpRequest` |
| Engine init | `src/WikiEngine.ts` | `initialize()` | `recordEngineInit` |

---

## API Reference

### Recording Methods

| Method | Parameters | Returns |
| ------ | ---------- | ------- |
| `recordPageView(durationMs)` | number | void |
| `recordPageSave(durationMs)` | number | void |
| `recordPageDelete(durationMs)` | number | void |
| `recordSearchRebuild(durationMs)` | number | void |
| `recordPageIndexSave(durationMs)` | number | void |
| `recordLoginAttempt()` | -- | void |
| `recordEngineInit(durationMs)` | number | void |
| `recordHttpRequest(durationMs, attrs)` | number, object | void |

### Utility Methods

| Method | Parameters | Returns |
| ------ | ---------- | ------- |
| `isEnabled()` | -- | boolean |
| `getMetricsHandler()` | -- | `RequestHandler \| null` |
| `initialize(config)` | object? | `Promise<void>` |
| `shutdown()` | -- | `Promise<void>` |

---

## Integration Examples

### Recording from a route handler

```typescript
async savePage(req: Request, res: Response): Promise<void> {
  const start = Date.now();
  // ... save logic ...
  const durationMs = Date.now() - start;
  this.engine.getManager<MetricsManager>('MetricsManager')
    ?.recordPageSave?.(durationMs);
}
```

### Recording from a provider

```typescript
// Always use optional chaining — MetricsManager may not be registered
// in lightweight test environments
this.engine.getManager<MetricsManager>('MetricsManager')
  ?.recordSearchRebuild?.(Date.now() - metricsStart);
```

### Guarding setup code behind isEnabled()

```typescript
const metrics = engine.getManager<MetricsManager>('MetricsManager');
if (metrics?.isEnabled()) {
  // Only run this setup if telemetry is on
  setupDetailedProfiling();
}
```

### Registering the /metrics route (app.js pattern)

```typescript
const metricsHandler = metricsManager.getMetricsHandler();
if (metricsHandler) {
  app.get('/metrics', requireAdminRole, metricsHandler);
}
```

---

## Related Documentation

- [MetricsManager.md](MetricsManager.md) - Quick reference
- [Telemetry.md](../admin/Telemetry.md) - Admin configuration and Prometheus setup
- [ConfigurationManager.md](ConfigurationManager.md) - Configuration system
- [SearchManager.md](SearchManager.md) - Search index rebuild metrics
