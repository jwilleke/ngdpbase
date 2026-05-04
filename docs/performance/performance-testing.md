# Performance Testing

Index and current-status overview for performance measurement, telemetry, and tuning work in ngdpbase. New contributors should start here. Per-release baselines, methodology deep-dives, and operator/developer guides for the telemetry stack are linked below rather than duplicated.

---

## Current status (as of v3.9.0 — 2026-05-04)

**Latest baseline:** [`baseline-v3.9.0-2026-05-04.md`](./baseline-v3.9.0-2026-05-04.md) — 2098.8 MB resident (telemetry-sourced), `/` 26 ms, `/view/Welcome` 18 ms, `/search?q=test` 129 ms, `/login` 17 ms.

**Drift since v3.8.0:** memory dropped −1.5 GB / −42.7 % — partially real, partially a measurement-source change (v3.8.0 was pm2-RSS, v3.9.0 is `process.memoryUsage().rss` via `/metrics` since telemetry is now on by default on jimstest). v3.10.0+ will be telemetry-vs-telemetry, removing the confound. Routes within noise.

**What works today:**

- Per-release baselines (`scripts/baseline-profile.sh`): memory + 4 route timings, optionally cold-start, optionally authenticated routes, drift-vs-previous via `--compare`, per-addon overhead via `--addon-diff`.
- Live telemetry (`MetricsManager`): 7 counters + 7 histograms + 5 process-memory gauges. Pull via `:9464/metrics` (Prometheus) or push via OTLP.
- Release flow integration: `/semver` runs `npm run test:baseline:compare`, prints the drift table, halts on threshold trips for human review.

**What's in flight (`in review`, OPEN):**

| # | Title | Status |
|---|---|---|
| [#610](https://github.com/jwilleke/ngdpbase/issues/610) | Memory observable in MetricsManager + telemetry-aware baseline | Implemented; telemetry-on end-to-end run pending user confirmation |
| [#612](https://github.com/jwilleke/ngdpbase/issues/612) | baseline-profile.sh: per-addon overhead diff | Implemented + first live capture; data noise larger than predicted (see `issue-612-addon-diff-mode.md` § known limitations) |
| [#613](https://github.com/jwilleke/ngdpbase/issues/613) | baseline-profile.sh: authenticated route timings | Implemented; valid-cred login path not yet exercised end-to-end |

**Open performance work without an `in review` label:**

- [#259](https://github.com/jwilleke/ngdpbase/issues/259) Storage migration tool for attachment + data path changes — original umbrella issue, predates the baseline-profile work
- [#642](https://github.com/jwilleke/ngdpbase/issues/642) Two divergent base-url config keys (`ngdpbase.base-url` vs `ngdpbase.baseURL`) — not strictly a performance bug but surfaces noise in the telemetry-aware path

---

## How to measure

### The standard baseline (`npm run test:baseline`)

`scripts/baseline-profile.sh` captures a snapshot of the running install and writes `docs/performance/baseline-v<VERSION>-<DATE>.md`. Default fields:

| Field | Source |
|---|---|
| Resident memory | `/metrics` (`{app}_process_resident_memory_bytes`) when telemetry is on, else `pm2 jlist` |
| Heap used / total | `/metrics` only (telemetry-on installs) |
| Engine init duration (mean) | `/metrics` (`engine_init_duration_ms_sum` / `_count`) |
| Pages on disk | `find ${SLOW_STORAGE}/pages -name '*.md'` (excludes `versions/`) |
| Link-graph entries | `pm2-out.log` "Link graph built with N entries" line |
| Route timings | `curl -L --time_total`, mean of 10 iterations, against `/`, `/view/Welcome`, `/search?q=test`, `/login` |

Read `${FAST_STORAGE}` / `${SLOW_STORAGE}` from `.env` automatically — no need to source it manually.

### Variant modes

| Command | Use when |
|---|---|
| `npm run test:baseline` | Casual capture, no diff, no restarts |
| `npm run test:baseline:cold` | Want cold-start timing (stops + starts the server first; slower) |
| `npm run test:baseline:compare` | **Used by `/semver`.** Captures + auto-diffs against the most recent prior baseline + halts on regression thresholds |
| `npm run test:baseline:addondiff` | Per-addon overhead measurement (#612). Disables each enabled addon one at a time, restarts, re-measures. ~35 s per addon + 1 — see [`issue-612-addon-diff-mode.md`](./issue-612-addon-diff-mode.md) |

### Authenticated route timings (#613)

Set `BASELINE_USER` + `BASELINE_PASS` env vars before running any of the modes above. The script POSTs to `/login`, verifies the session via `/profile`, and samples `/edit/Welcome`, `/profile`, `/my/pages`, `/admin` (10 iterations each). Skipped silently when env vars are unset or login fails.

`/admin` only renders the dashboard for admin-level creds; for non-admin users it 302s to `/login` and the timing reflects the redirect — flagged in the markdown methodology section so it isn't misread as a regression.

### Regression thresholds (`--compare`)

Override via env var:

| Var | Default | Meaning |
|---|---|---|
| `BASELINE_MEM_DELTA_PCT` | 25 | Memory % regression |
| `BASELINE_RT_DELTA_PCT` | 50 | Route % regression (must trip together with the ms threshold) |
| `BASELINE_RT_DELTA_MS` | 50 | Route absolute regression (avoids 1 ms-on-already-fast-route false positives) |

Memory and route thresholds need both % AND ms to trip together for routes — a 100 % delta on a 1 ms route doesn't flag. The script exits non-zero when any threshold trips so the release flow halts for human review before tagging.

### Vitest test-suite performance

Separate concern from runtime baselines. The vitest cold-start race (#622) is documented in [`issue-622-vitest-pool-tuning.md`](./issue-622-vitest-pool-tuning.md) — set `pool: 'forks'` + `maxWorkers: 4` in `vitest.config.ts` to absorb cold-start variance.

---

## Telemetry stack

ngdpbase ships an OpenTelemetry SDK with Prometheus pull export and optional OTLP push export. **Disabled by default**: when telemetry is off, `MetricsManager` is a no-op with zero overhead.

For configuration, scrape endpoints, security model, and the full metric reference, see:

- [**`docs/admin/Telemetry.md`**](../admin/Telemetry.md) — operator-facing setup guide
- [**`docs/managers/MetricsManager.md`**](../managers/MetricsManager.md) — manager API summary
- [**`docs/managers/MetricsManager-Complete-Guide.md`**](../managers/MetricsManager-Complete-Guide.md) — full guide with OTLP setup, Grafana dashboards, alerting rules

### Metrics relevant to performance baselines

| Metric | Type | Used by |
|---|---|---|
| `{app}_process_resident_memory_bytes` | Gauge | `baseline-profile.sh` (memory snapshot) |
| `{app}_process_heap_used_bytes` | Gauge | baseline (heap detail when telemetry on) |
| `{app}_process_heap_total_bytes` | Gauge | baseline |
| `{app}_process_external_memory_bytes` | Gauge | reserved (not surfaced in baseline) |
| `{app}_process_array_buffers_bytes` | Gauge | reserved |
| `{app}_engine_init_duration_ms` | Histogram | baseline (mean from `_sum` / `_count`) |
| `{app}_page_view_duration_ms` | Histogram | live monitoring |
| `{app}_page_save_duration_ms` | Histogram | live monitoring |
| `{app}_search_rebuild_duration_ms` | Histogram | live monitoring |
| `{app}_http_request_duration_ms` | Histogram | live monitoring (per-route) |

The five `process_*` gauges share a single `BatchObservableCallback` so `process.memoryUsage()` is called **once per scrape interval** regardless of gauge count.

---

## Per-release baseline history

Every release tagged via `/semver` writes a baseline file to `docs/performance/baseline-v<VERSION>-<DATE>.md`. Same-day re-runs of the same version suffix `-r2.md`, `-r3.md` so the canonical release-time capture is never overwritten.

Recent (sorted by version):

- [`baseline-v3.9.0-2026-05-04.md`](./baseline-v3.9.0-2026-05-04.md) — current
- [`baseline-v3.8.0-2026-05-03.md`](./baseline-v3.8.0-2026-05-03.md)
- [`baseline-v3.7.0-2026-05-03.md`](./baseline-v3.7.0-2026-05-03.md)
- [`baseline-v3.6.0-2026-05-02.md`](./baseline-v3.6.0-2026-05-02.md)
- earlier: `baseline-v3.5.x-*.md`, `baseline-v3.4.0-*.md`, `baseline-v3.3.7-*.md` in this directory

Files matching `baseline-v*-addondiff*.md` are excluded from `--compare` auto-detection — they capture per-addon overhead (#612) under disturbed conditions (server restarted N times) and are not comparable to per-release steady-state baselines. Example: [`baseline-v3.8.0-2026-05-04-addondiff.md`](./baseline-v3.8.0-2026-05-04-addondiff.md).

---

## Methodology deep-dives

- [`issue-612-addon-diff-mode.md`](./issue-612-addon-diff-mode.md) — per-addon overhead methodology, runtime cost, output shape, safety contract (EXIT-trap config restoration), known limitations including the observed memory noise floor (~2 GB on jimstest, far higher than the predicted ~5 MB)
- [`issue-622-vitest-pool-tuning.md`](./issue-622-vitest-pool-tuning.md) — vitest cold-start race investigation; `pool: 'forks' + maxWorkers: 4` in `vitest.config.ts`

---

## Recently closed performance work (for context)

- [#611](https://github.com/jwilleke/ngdpbase/issues/611) — `--compare` mode for release-to-release regression detection (shipped in v3.9.0)
- [#603](https://github.com/jwilleke/ngdpbase/issues/603) — establish baseline performance / memory profile (the original baseline-profile.sh)
- [#637](https://github.com/jwilleke/ngdpbase/issues/637) — resolve user roles once per session
- [#636](https://github.com/jwilleke/ngdpbase/issues/636) — memoize wikiContext.hasPermission / canAccess per request
- [#608](https://github.com/jwilleke/ngdpbase/issues/608) — RecentChangesPlugin slow on large installs
- [#590](https://github.com/jwilleke/ngdpbase/issues/590) — inline footnote/comment updates without `location.reload()`
- [#558](https://github.com/jwilleke/ngdpbase/issues/558) — footnote/comment delay (root-caused under #590)
- [#477](https://github.com/jwilleke/ngdpbase/issues/477) — MarkupParser slow-parse alert
- [#438](https://github.com/jwilleke/ngdpbase/issues/438) — pageAssets reverse index

---

## Adding to this index

- **New release baseline** — appears automatically when `/semver` runs `--compare`. The "Current status" block at the top should be updated by hand, ideally as part of the release commit
- **New deep-dive** — file as `issue-<NNN>-<slug>.md` in this directory and link from the "Methodology deep-dives" section
- **Closed perf issue** — add a one-line entry to "Recently closed performance work"
- **Existing perf doc found elsewhere in `docs/`** — link from the appropriate section here rather than duplicating
