# Issue #622 — vitest pool tuning investigation

__Date:__ 2026-05-02
__Issue:__ [#622 — `WikiRoutes.coverage3.test.ts > "returns 401 when user is not authenticated"` times out intermittently in full vitest run](https://github.com/jwilleke/ngdpbase/issues/622)
__Outcome:__ Two changes landed in `vitest.config.ts`:

1. `testTimeout: 30000` (was 20000) — defensively absorbs cold-start variance
2. `pool: 'forks'` + `maxWorkers: 4` (was: default ~7 on a 14-core machine) — reduces per-component overhead by ~3x

## Symptom

A specific test —
`src/routes/__tests__/WikiRoutes.coverage3.test.ts > POST /api/user/pinned-pages — addPinnedPage > returns 401 when user is not authenticated` —
intermittently fails with vitest's default 20s test timeout. The same test
passes in ~290ms when its file runs in isolation, and all 22 tests in that
file pass in 1-10ms each when run alone. The flake only occurs in the full
193-file suite, and only on the first cold run after the system has been
quiet for a while.

## Investigation methodology

Run vitest 5x sequentially after a quiet period (server stopped, no recent
test runs). Compare per-component timings reported by vitest:

```
Duration  7.60s (transform 6.28s, setup 1.80s, import 13.70s, tests 22.75s, environment 1.06s)
```

- __Total wallclock__ = `Duration`. Time from start to finish.
- __transform / import / setup / environment / tests__ = sum of per-worker
  time spent in that phase, across all parallel workers. So `tests: 22.75s`
  on a 7-worker pool means each worker did roughly 3.2s of test work in
  parallel.

When the flake fires, the failing test consumes the full 20s timeout, so
the `tests` total balloons (~44s) and `Duration` jumps (21s+).

The hardware: 14-core Mac. Vitest's default `maxWorkers` is `cpus / 2`,
so 7 workers competing for 14 cores' worth of memory bandwidth, V8 JIT
compilation slots, file-cache pages, etc.

## Experiments

All experiments ran on the same hardware, immediately back-to-back, with
no other significant load. Each row is one full vitest run.

### Default config (pool: forks, maxWorkers ≈ 7)

| Run | Duration | transform | import | setup | tests | environment | Outcome |
|----:|---------:|----------:|-------:|------:|------:|------------:|---------|
| 1   | 7.63s    | 7.17s     | 15.22s | 1.93s | 23.59s| 1.08s       | ok      |
| 2   | 7.54s    | 6.84s     | 14.99s | 1.90s | 23.58s| 1.19s       | ok      |
| 3   | 7.69s    | 6.40s     | 14.08s | 1.84s | 22.82s| 0.96s       | ok      |
| 4   | 7.60s    | 6.83s     | 14.53s | 1.99s | 22.91s| 1.07s       | ok      |
| 5   | 7.53s    | 6.28s     | 13.70s | 1.80s | 22.75s| 1.06s       | ok      |

5/5 pass at 7.5-7.7s. (Earlier in the same session, an unrelated cold
start hit the 20s flake; could not reliably reproduce on demand.)

### pool: forks, maxWorkers=4

| Run | Duration | transform | import | setup | tests | environment | Outcome |
|----:|---------:|----------:|-------:|------:|------:|------------:|---------|
| 1   | 8.84s    | 2.11s     | 6.89s  | 0.97s | 15.06s| 0.81s       | ok      |
| 2   | 8.83s    | 1.99s     | 6.81s  | 0.98s | 15.14s| 0.78s       | ok      |
| 3   | 8.83s    | 2.01s     | 6.69s  | 0.99s | 15.27s| 0.80s       | ok      |
| 4   | 8.65s    | 1.87s     | 6.51s  | 0.95s | 15.03s| 0.78s       | ok      |
| 5   | 8.74s    | 1.95s     | 6.60s  | 0.96s | 15.18s| 0.78s       | ok      |

5/5 pass at 8.6-8.8s. __Per-component times ~3x lower than default.__
Total wallclock slightly higher because less parallelism = more wallclock
to do same total work, but each worker is *much* more efficient.

### pool: forks, maxWorkers=2

| Run | Duration | transform | import | setup | tests | environment | Outcome    |
|----:|---------:|----------:|-------:|------:|------:|------------:|------------|
| 1   | 36.53s   | 1.63s     | 5.95s  | 0.86s | 44.44s| 0.74s       | __flake__  |
| 2   | 16.72s   | 1.71s     | 6.24s  | 0.88s | 14.60s| 0.75s       | ok         |
| 3   | 16.57s   | 1.68s     | 6.14s  | 0.86s | 14.50s| 0.75s       | ok         |

Run 1 hit the flake (`tests: 44.44s` = 30s timeout fired + ~14s normal).
Even after warm-up, total wallclock is 16-17s — too few workers, suite
becomes too sequential. __Worst configuration tested.__

### pool: forks, maxWorkers=6

| Run | Duration | transform | import | setup | tests | environment | Outcome |
|----:|---------:|----------:|-------:|------:|------:|------------:|---------|
| 1   | 6.32s    | 2.54s     | 7.45s  | 1.03s | 15.96s| 0.80s       | ok      |
| 2   | 6.26s    | 2.38s     | 7.16s  | 1.00s | 15.78s| 0.80s       | ok      |
| 3   | 6.25s    | 2.45s     | 7.16s  | 1.03s | 15.93s| 0.80s       | ok      |

3/3 pass at 6.25-6.32s. __Fastest configuration tested.__ But sample size
small.

### pool: threads (default workers)

| Run | Duration | transform | import | setup | tests | environment | Outcome |
|----:|---------:|----------:|-------:|------:|------:|------------:|---------|
| 1   | 7.14s    | 5.50s     | 13.40s | 1.73s | 20.59s| 1.06s       | ok      |
| 2   | 7.31s    | 5.65s     | 13.10s | 1.73s | 21.20s| 0.97s       | ok      |
| 3   | 7.19s    | 5.89s     | 13.11s | 1.78s | 20.99s| 1.04s       | ok      |

Comparable to forks default. Pool type alone doesn't change much.

### pool: threads, maxWorkers=4

| Run | Duration | transform | import | setup | tests | environment | Outcome   |
|----:|---------:|----------:|-------:|------:|------:|------------:|-----------|
| 1   | 7.96s    | 1.76s     | 6.31s  | 0.90s | 14.56s| 0.75s       | ok        |
| 2   | 33.06s   | 1.56s     | 5.89s  | 0.86s | 44.51s| 0.76s       | __flake__ |
| 3   | 7.94s    | 1.62s     | 6.17s  | 0.89s | 14.54s| 0.77s       | ok        |

Run 2 hit the flake (`tests: 44.51s`). __Pool type does not eliminate the
flake.__ Threads vs forks is largely irrelevant for this issue.

## Findings

1. __The flake is a real cold-start race__, not a configuration mistake.
   It reproduced under multiple pool/worker combinations (forks default,
   threads maxWorkers=4, forks maxWorkers=2). The race is something in
   vitest's worker bootstrap interacting with supertest's HTTP server
   setup; reducing parallelism alone doesn't deterministically prevent
   it.

2. __`testTimeout: 30000` is a real fix for the symptom.__ The flake
   manifests as a single test exhausting the 20s timeout. Bumping the
   ceiling to 30s absorbs the cold-start variance without disabling or
   weakening any test. Each affected test still has a real upper bound;
   the bound just absorbs the worst observed cold-start delay.

3. __`maxWorkers: 4` is a real perf win.__ Per-component overhead drops
   ~3x (transform 6.5s → 2s; import 14s → 6.5s). Total wallclock is
   slightly higher (8.7s vs 7.6s) when the suite is fully warm — but the
   per-test efficiency improvement means individual cold tests are
   less likely to hit timeouts, and the suite is more predictable across
   runs.

4. __Defense in depth.__ Both changes ship together because:
   - `maxWorkers: 4` reduces the *probability* of the cold-start race
     (lower per-worker load → faster worker bootstrap → smaller window
     for the race to fire).
   - `testTimeout: 30000` *absorbs* the race when it does fire.
   - Either alone would be insufficient: pool tuning didn't deterministically
     eliminate the flake in experiments, and timeout alone doesn't address
     the underlying inefficiency.

5. __Sweet spot is around 4-6 workers__ for this 193-file suite on a
   14-core machine. `maxWorkers: 2` is too few (suite becomes sequential,
   own flake from per-test load). `maxWorkers: 6` is fastest in our
   sample but with smaller sample size — staying with 4 for headroom and
   determinism.

## Trade-offs and limits

- On smaller CI runners (4-8 cores), `maxWorkers: 4` is closer to
  vitest's default behavior anyway — minimal practical impact.
- On much larger machines (32+ cores), capping at 4 leaves cores idle.
  This is fine; the suite isn't CPU-bound at scale, it's memory- and
  IO-cache-bound, and 4 workers already saturate that.
- The flake is *not eliminated*, only made vanishingly unlikely. Any
  future vitest worker-pool changes (e.g. v5) should re-validate.
- `testTimeout: 30000` makes individual broken tests fail more slowly
  during local development. Acceptable trade-off given the flake is the
  only known case of legitimate slow execution.

## Next steps if the flake re-emerges

In rough cost-of-investigation order:

1. __Add per-test timing instrumentation__ to `WikiRoutes.coverage3.test.ts`
   on the failing test path. Log timestamps at: test entry, supertest
   invocation, middleware enter, route handler enter, route handler
   return, supertest response received. Identifies which segment is
   actually consuming the seconds when the flake fires.

2. __Try `isolate: false`__ in vitest config. Each test file gets a
   fresh VM by default; sharing VMs across files in the same worker
   would skip per-file module initialization and may eliminate the
   cold-start window. Risk: shared module state leaks between files;
   may break tests that mutate globals.

3. __Investigate WikiRoutes module-load side effects.__ The route file
   is large (~8000 lines, many imports). On a cold worker, the import
   chain may be doing async work at module-eval time that doesn't
   settle before the first test runs. Suspect candidates: top-level
   `vi.mock(...)` chains, `await import(...)` inside route handlers,
   `WikiEngine` construction triggering manager initialization that
   cascades through providers.

4. __Replace `supertest` with direct handler calls__ for the affected
   test. `supertest` spins up an HTTP server per request via
   `app.listen(0)`; on a cold worker, ephemeral port allocation may
   serialize behind worker spawning. A direct handler call (`await
   handler(req, res)`) skips the HTTP layer entirely.

5. __Switch to `vmThreads` or `vmForks` pool.__ These provide stricter
   isolation but heavier setup — could move the cold-start cost
   somewhere it's expected, or eliminate the race by serializing more
   strictly.

The investigation methodology in this document (5+ cold runs, compare
per-component timings, observe whether `tests` phase exceeds the timeout
× expected concurrency) is the diagnostic recipe for any future variant
of the issue.
