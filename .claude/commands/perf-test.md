# Performance Baseline Capture

Capture a performance baseline snapshot for the current install — memory, response times, and (optionally) cold-start timing. Useful any time you want to check current state without running through the whole `/semver` release flow.

The same script is also wired into `/semver` Step 5a, so a fresh baseline lands with every release. Use this command for ad-hoc checks between releases, or to verify a specific change didn't regress.

## Usage

`/perf-test` — capture a warm-server baseline (fast).

`/perf-test cold` — also stop and start the server first, including cold-start time in the report. Slower (~30-60s extra).

## Steps

### Step 1: Confirm the server is up

The script measures a running instance. If the server isn't up:

- Run `./server.sh start` and wait for `http://localhost:3000` (or the instance's configured port) to respond.
- If the user wants `cold` mode, you can skip this — Step 2 will restart the server itself.

### Step 2: Run the baseline

For warm mode:

```bash
npm run test:baseline
```

For cold mode:

```bash
npm run test:baseline:cold
```

Either writes `docs/performance/baseline-v<VERSION>-<DATE>.md`. Same file path as `/semver` Step 5a, so a same-day cold run will overwrite the warm one — that's fine; whichever ran more recently is the source of truth.

### Step 3: Show the result

Print the generated markdown table to the user. Highlight anything that looks off:

- __Memory__ materially different from the previous baseline file (compare against `ls -t docs/performance/*.md | head -2` and diff).
- __Response times__ above ~500 ms on simple routes.

### Step 4 (optional): Commit

If the user is on a clean branch and wants the snapshot tracked, ask whether to commit:

```bash
git add docs/performance/baseline-v<VERSION>-<DATE>.md
git commit -m "chore(perf): baseline snapshot <DATE>"
```

Don't commit by default — between-release snapshots are more useful as ephemeral checks than as committed artifacts. If the user is doing a release, they should use `/semver` instead, which handles this in Step 5a.

## Rules

- Never run with `cold` while the user is mid-task on the server (they'd lose state). Confirm before stopping.
- Never assert hard thresholds — local-machine timings vary. Treat the output as observational, not a pass/fail gate.
- Don't replace `/semver` Step 5a's baseline run; this command is for ad-hoc use only.
