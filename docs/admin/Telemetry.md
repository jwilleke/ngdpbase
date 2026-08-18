# Telemetry

ngdpbase uses [OpenTelemetry](https://opentelemetry.io/) to collect application metrics and export them in [Prometheus](https://prometheus.io/) format. The `MetricsManager` owns all metric creation and recording; when telemetry is disabled, every recording method is a no-op.

## Configuration

All settings live in the configuration hierarchy (`app-default-config.json`, overridden by custom config).

| Property | Default | Description |
|----------|---------|-------------|
| `ngdpbase.telemetry.enabled` | `false` | Enable or disable metrics collection |
| `ngdpbase.telemetry.service-name` | `""` | OTLP `service.name` resource attribute (falls back to metric prefix if empty) |
| `ngdpbase.telemetry.metrics.port` | `9464` | Port for the standalone Prometheus exporter |
| `ngdpbase.telemetry.metrics.host` | `0.0.0.0` | Bind address for the Prometheus exporter |
| `ngdpbase.telemetry.metrics.path` | `/metrics` | HTTP path for metrics endpoint |
| `ngdpbase.telemetry.metrics.interval` | `15000` | Collection interval in milliseconds |
| `ngdpbase.telemetry.otlp.enabled` | `false` | Enable OTLP HTTP push-based export |
| `ngdpbase.telemetry.otlp.endpoint` | `""` | OTLP collector URL (e.g., `https://otel.example.com/v1/metrics`) |
| `ngdpbase.telemetry.otlp.headers` | `{}` | Custom headers for OTLP requests (e.g., auth tokens) |
| `ngdpbase.telemetry.otlp.interval` | `30000` | Push interval in milliseconds (must be >= timeout) |
| `ngdpbase.telemetry.otlp.timeout` | `30000` | Export timeout in milliseconds |

To enable telemetry, add the following to your custom config (`data/config/app-custom-config.json`):

```json
"ngdpbase.telemetry.enabled": true
```

Restart the server after changing telemetry settings.

## Endpoints

When enabled, metrics are available at two endpoints:

| Endpoint | Port | Auth | Purpose |
|----------|------|------|---------|
| `http://<host>:9464/metrics` | 9464 | None | Prometheus scraping (internal/Docker network) |
| `http://<host>:3000/metrics` | 3000 | Admin role required | Browser access on the main app |

The standalone exporter on port 9464 is intended for Prometheus scrape targets. The main app endpoint on port 3000 requires an authenticated session with the `admin` role.

## Metrics Reference

All metric names are prefixed with the application name from `ngdpbase.application-name`, sanitized for Prometheus (lowercased, non-alphanumeric characters replaced with underscores). For example, if `applicationName` is `jimstest`, metrics are prefixed `jimstest_`. The default prefix is `ngdpbase_`.

The tables below use `{app}` as a placeholder for the prefix.

### Counters

Counters are monotonically increasing values that reset on restart.

| Metric | Description | Labels |
|--------|-------------|--------|
| `{app}_page_views_total` | Total page views | -- |
| `{app}_page_saves_total` | Total page saves | -- |
| `{app}_page_deletes_total` | Total page deletions | -- |
| `{app}_search_rebuilds_total` | Total search index rebuilds | -- |
| `{app}_page_index_saves_total` | Total page-index.json writes | -- |
| `{app}_login_attempts_total` | Total login attempts | -- |
| `{app}_http_requests_total` | Total HTTP requests | `method`, `route`, `status` |

### Histograms

Histograms track the distribution of durations (in milliseconds).

| Metric | Description | Labels |
|--------|-------------|--------|
| `{app}_page_view_duration_ms` | Time to render a page view | -- |
| `{app}_page_save_duration_ms` | Time to save a page | -- |
| `{app}_page_delete_duration_ms` | Time to delete a page | -- |
| `{app}_search_rebuild_duration_ms` | Time to rebuild the search index | -- |
| `{app}_page_index_save_duration_ms` | Time to write page-index.json | -- |
| `{app}_engine_init_duration_ms` | Time for engine initialization | -- |
| `{app}_http_request_duration_ms` | Time to handle an HTTP request | `method`, `route`, `status` |

### HTTP Request Labels

The `http_requests_total` counter and `http_request_duration_ms` histogram include:

- __method__ -- HTTP method (`GET`, `POST`, etc.)
- __route__ -- Normalized path (e.g., `/wiki/:page`, `/edit/:page`) to avoid high-cardinality page names
- __status__ -- HTTP status code as a string (`200`, `404`, `500`, etc.)

## OTLP Export (Push-Based)

In addition to the Prometheus pull-based exporter, MetricsManager can push metrics to a remote [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/) via OTLP HTTP. This is useful when the remote Prometheus instance cannot scrape the local host directly.

To enable OTLP export alongside Prometheus, add to your custom config:

```json
"ngdpbase.telemetry.otlp.enabled": true,
"ngdpbase.telemetry.otlp.endpoint": "https://otel.example.com/v1/metrics"
```

If the collector requires authentication, pass headers:

```json
"ngdpbase.telemetry.otlp.headers": { "Authorization": "Bearer <token>" }
```

Both exporters run simultaneously -- Prometheus for local scraping and OTLP for centralized collection.

## Architecture

```
MetricsManager (src/managers/MetricsManager.ts)
  ├── PrometheusExporter              →  standalone HTTP server on port 9464
  ├── PeriodicExportingMetricReader   →  OTLP HTTP push (optional)
  │     └── OTLPMetricExporter        →  sends to remote collector
  ├── MeterProvider                   →  OpenTelemetry SDK meter provider
  └── Meter ('{app}')                 →  creates all counters and histograms
```

MetricsManager extends `BaseManager` and is registered in WikiEngine after CacheManager. Other code records metrics by calling methods like:

```typescript
engine.getManager<MetricsManager>('MetricsManager')?.recordPageView?.(durationMs);
```

The double optional chaining (`?.recordPageView?.()`) ensures no errors when metrics are disabled or the manager isn't registered.

### Instrumented Code Paths

| Operation | File | Method |
|-----------|------|--------|
| Page view | `src/routes/WikiRoutes.ts` | `viewPage()` |
| Page save | `src/routes/WikiRoutes.ts` | `savePage()` |
| Page delete | `src/routes/WikiRoutes.ts` | `deletePage()` |
| Login attempt | `src/routes/WikiRoutes.ts` | `processLogin()` |
| Search rebuild | `src/providers/LunrSearchProvider.ts` | `buildIndex()` |
| Page index save | `src/providers/VersioningFileProvider.ts` | `savePageIndex()` |
| HTTP requests | `app.js` | Express middleware |
| Engine init | `src/WikiEngine.ts` | `initialize()` |

## Prometheus Integration

Add a scrape target to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'ngdpbase'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:9464']
```

For Docker deployments, use the container hostname or service name instead of `localhost`.

### Example Queries

Replace `{app}` with your actual prefix (e.g., `jimstest`, `ngdpbase`).

```promql
# Average page view duration over the last 5 minutes
rate({app}_page_view_duration_ms_sum[5m]) / rate({app}_page_view_duration_ms_count[5m])

# Request rate by route
sum(rate({app}_http_requests_total[5m])) by (route)

# Search rebuild duration (last value)
{app}_search_rebuild_duration_ms_sum

# Error rate (5xx responses)
sum(rate({app}_http_requests_total{status=~"5.."}[5m]))
```

## Dependencies

The telemetry system adds three npm packages:

- `@opentelemetry/api` -- OpenTelemetry API
- `@opentelemetry/sdk-metrics` -- Metrics SDK
- `@opentelemetry/exporter-prometheus` -- Prometheus exporter
- `@opentelemetry/exporter-metrics-otlp-http` -- OTLP HTTP metric exporter

These are production dependencies but only initialize when `ngdpbase.telemetry.enabled` is `true`.

## Disabling Telemetry

Set `ngdpbase.telemetry.enabled` to `false` (the default). When disabled:

- No OpenTelemetry SDK is initialized
- No ports are opened
- All `record*()` calls are no-ops (null instrument handles with optional chaining)
- The `/metrics` route is not registered on the main app
- No measurable performance overhead

## Grafana

With OTLP export enabled, the following panel queries work against a Grafana data source pointed at your OpenTelemetry collector. Replace `{app}` with your prefix (e.g., `jimstest`).

### Useful panels

Page save latency (p95 over 5 min):

```promql
histogram_quantile(0.95,
  sum(rate({app}_page_save_duration_ms_bucket[5m])) by (le)
)
```

Search rebuild duration trend:

```promql
rate({app}_search_rebuild_duration_ms_sum[10m])
/ rate({app}_search_rebuild_duration_ms_count[10m])
```

Request rate by route:

```promql
sum(rate({app}_http_requests_total[5m])) by (route)
```

Error rate (5xx responses):

```promql
sum(rate({app}_http_requests_total{status=~"5.."}[5m]))
```

Engine init duration (useful after restarts):

```promql
{app}_engine_init_duration_ms_sum
```

Login attempts per minute:

```promql
rate({app}_login_attempts_total[1m]) * 60
```

## Troubleshooting

### Health check warning on startup

```
Search provider LunrSearchProvider health check failed after initialization
```

This is expected on every cold start. The health check runs immediately after `initialize()` completes, before `buildIndex()` has been called. The index is empty at that point, so the check fails. Once `buildIndex()` finishes and the engine logs `Wiki engine ready`, the provider is healthy and the warning can be ignored.

### Metrics showing zero after restart

Counters reset to zero on every restart. Histograms also reset. If you are graphing rates (`rate()`) in Prometheus/Grafana, the graph will show a gap at the restart boundary — this is normal Prometheus counter-reset behavior.

### Port 9464 already in use

If another process is on port 9464, MetricsManager will fail to initialize and log an error. Either stop the conflicting process or change the port:

```json
"ngdpbase.telemetry.metrics.port": 9465
```

### OTLP export silently failing

If OTLP export is enabled but metrics are not appearing in your collector:

1. Check the endpoint URL includes the full path: `https://collector.example.com/v1/metrics`
2. Verify any required auth headers are set in `ngdpbase.telemetry.otlp.headers`
3. Confirm `ngdpbase.telemetry.otlp.interval` is less than or equal to `ngdpbase.telemetry.otlp.timeout`
4. Look for OTLP export errors in the server log — MetricsManager logs failed exports at `error` level

### No data on port 3000 /metrics

The `/metrics` route on port 3000 requires an authenticated session with the `admin` role. Unauthenticated requests receive `403 Admin access required`. Use port 9464 for unauthenticated Prometheus scraping.
