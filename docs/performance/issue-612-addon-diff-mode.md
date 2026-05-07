# Issue #612 — `baseline-profile.sh --addon-diff` mode

**Date:** 2026-05-04
**Issue:** [#612 — `[FEATURE] baseline-profile.sh: per-addon overhead diff`](https://github.com/jwilleke/ngdpbase/issues/612)
**Commit:** b569b3dd
**Outcome:** New `--addon-diff` mode in `scripts/baseline-profile.sh` (and `npm run test:baseline:addondiff`). For each addon listed under `ngdpbase.addons.*.enabled` in the running install's custom config: disable, restart, re-measure, restore. Emits a per-addon memory + route-time delta table.

## Why

[#486](https://github.com/jwilleke/ngdpbase/issues/486) (accounting addon) and [#602](https://github.com/jwilleke/ngdpbase/issues/602) (person-contacts) will each add to runtime cost. Target deployments are small non-profit installs where memory is precious. We need a number — "how much does enabling X actually cost on this install?" — before committing to bundling something with the default install. Manual measurement (edit config, restart, re-run baseline, diff by hand) is the kind of thing nobody actually does, so the data ends up missing from the decision.

## What it does

```text
npm run test:baseline:addondiff      # writes baseline-v<V>-<DATE>-addondiff.md
./scripts/baseline-profile.sh --addon-diff
```

1. Read `${FAST_STORAGE}/config/app-custom-config.json` (the running install's overrides).
2. Enumerate keys matching `ngdpbase.addons.*.enabled: true`.
3. Capture an "all addons enabled" baseline (memory + route timings).
4. For each addon: write a config copy with that single addon disabled, `./server.sh restart`, wait for the engine-ready marker in `pm2-out.log` plus a successful HTTP probe, re-measure.
5. Restore the original config and restart cleanly via an EXIT trap.
6. Write `baseline-v<V>-<DATE>-addondiff.md` with both an "all enabled" baseline and a per-addon delta table.

Memory measurement reuses the telemetry-first / pm2-fallback path from #610. Route timings are mean-of-10 curl iterations, same as the standard snapshot.

## Output shape

```markdown
## Per-addon delta

Each row reflects the cost of having that addon enabled, computed as
(all-enabled metric) − (this-addon-disabled metric). Positive values mean
the addon adds that much overhead.

| Addon | Memory Δ | `/` Δ | `/view/Welcome` Δ | `/search?q=test` Δ | `/login` Δ |
| --- | --- | --- | --- | --- | --- |
| template | +12.3 MB | +1 ms | +0 ms | +2 ms | +0 ms |
| calendar | +18.7 MB | +0 ms | +1 ms | +0 ms | +1 ms |
| elasticsearch | +145.2 MB | -2 ms | -1 ms | -85 ms | -1 ms |
| journal | +8.4 MB | +0 ms | +0 ms | +1 ms | +0 ms |
| forms | +5.1 MB | +1 ms | +0 ms | +0 ms | +0 ms |
```

Negative deltas can be real (the addon makes a route faster — e.g. elasticsearch displacing lunr on `/search`) or noise.

## Cost

- **One restart per enabled addon, plus one final restart for cleanup.** For jimstest's 5 addons that's ~6 restarts.
- **~30s per restart** is realistic on this dev machine; large installs with many pages can run longer.
- Total for jimstest: **~3–5 minutes** wall-clock.
- During the run jimstest is unavailable in short bursts as it cycles. Don't run during a session you care about.

The script prints a runtime estimate up front so a long run isn't mistaken for a hang. It also prints `[i/N]` progress markers per iteration.

## Safety

- **Original config is backed up** to a `mktemp` file before any modification.
- **EXIT trap** restores the backup and runs a final `./server.sh restart` regardless of how the script exits — clean exit, error, or **Ctrl-C**.
- **Do not `kill -9`** the script. SIGKILL bypasses the trap; the config will be left in a modified state. Recovery in that case: copy any sibling `baseline-v*-addondiff*.md` (which contains the original addon settings in the "all enabled" baseline) or restore the custom config from git history.

## How to interpret the numbers

- **Memory deltas** are reasonably stable run-to-run on a warm install (~5 MB noise floor). Anything above ~10 MB is signal.
- **Route deltas** are noisier — single-digit ms swings are within measurement noise on already-fast routes (`/`, `/login`, `/view/Welcome` are all ~15–20 ms warm). Treat <5 ms as noise, 50ms+ as a real signal. The same threshold convention as `--compare`.
- **Negative memory delta** is suspicious — usually means the disabled addon's startup work was deferred, not actually freed; or that GC happened during the iteration. Re-run if it matters.
- **Sums should approximate** the all-enabled-vs-none-enabled delta (within noise). If they don't, something is interacting between addons (e.g. shared cache that was warm in run 1, cold in run 2).

## Known limitations (future work)

### 1. Only enumerates addons from `app-custom-config.json`

Today the enumeration step `jq`s only the custom config. If a sister install enables addons via `app-default-config.json` (or doesn't override them in custom), they won't show up. Currently:

- `app-default-config.json` has only `"ngdpbase.addons.forms.enabled": false` — the other addons aren't there at all
- jimstest's custom config has all 5 addons set explicitly, so the script works correctly for jimstest

**Proper fix** (small): merge default + custom in jq, enumerate from the effective merged state, still write toggles to the custom config only (defaults stay clean). Tracked separately when needed.

### 2. Restart-only — no in-process toggle

Each iteration is a full server restart. Many addons could in principle be hot-toggled, but the AddonsManager lifecycle doesn't currently support that, and even if it did, hot-toggle wouldn't catch memory held by long-lived structures the addon registered on startup. Restart is the honest measurement.

### 3. Single-shot, not statistical

Each iteration captures one pass of memory + 10-iteration route mean. For a noisy install, a single pass can mislead. A `--addon-diff --runs N` mode that averages across N independent restarts per addon would tighten the numbers — but at N× the runtime cost, so probably only worth wiring up if a specific decision is on the line.

### 4. Doesn't capture the `--addon-diff` baseline against the regular `--compare` history

The addon-diff output goes to `baseline-v<V>-<DATE>-addondiff.md`, deliberately separate from the per-release `baseline-v<V>-<DATE>.md` files that `--compare` walks. This is intentional (the addon-diff baseline is captured under disturbed conditions: server restarting repeatedly, cache state varies) but means addon-diff numbers don't show up in release-to-release drift. If we want that, file a follow-up.

## Related

- Builds on #603 (baseline profile first pass)
- #610 (memory observable + telemetry-aware baseline) — `--addon-diff` reuses the same memory path
- Will inform default-bundling decisions for #486 and #602
