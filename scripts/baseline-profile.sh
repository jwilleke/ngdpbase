#!/usr/bin/env bash
#
# baseline-profile.sh — Capture a startup + memory + response-time snapshot.
#
# Fills the gaps left by scripts/performance-test.ts (#603):
#   - cold-start time to "Engine initialized"
#   - memory at idle (RSS via pm2)
#   - response-time samples for a few representative routes
#
# Usage:
#   scripts/baseline-profile.sh                    # measure current install
#   scripts/baseline-profile.sh --cold-start       # also stop/start the server
#   scripts/baseline-profile.sh --compare          # diff vs the most recent
#                                                  # prior baseline (#611)
#   scripts/baseline-profile.sh --compare <FILE>   # diff vs a specific file
#
# Set BASELINE_USER + BASELINE_PASS to also sample authenticated routes
# (#613). Skipped silently if either is unset, or if the login fails.
#
# When MetricsManager telemetry is enabled (`ngdpbase.telemetry.enabled`), the
# script reads memory + engine init duration from /metrics instead of pm2
# (#610). Override the endpoint with BASELINE_METRICS_URL (default
# http://localhost:9464/metrics); force the pm2 path with
# BASELINE_METRICS_DISABLE=1.
#
# `--addon-diff` mode (#612): for each addon listed under
# `ngdpbase.addons.*.enabled: true` in the running install's custom config,
# disable it one-at-a-time, restart the server, and emit a per-addon
# memory/route delta table. Restart cost: ~30s per addon + 1 (slow). The
# original config is restored on EXIT (Ctrl-C safe; do not kill -9).
#
# When --compare is set, the script appends a "Drift vs <previous>" section
# to the new baseline file AND prints the same table to stdout. Exits
# non-zero if any threshold trips:
#
#   BASELINE_MEM_DELTA_PCT  default 25  (memory % regression)
#   BASELINE_RT_DELTA_PCT   default 50  (route % regression)
#   BASELINE_RT_DELTA_MS    default 50  (route absolute regression — both
#                                       % and ms thresholds must trip
#                                       together to flag, so we don't
#                                       false-positive on already-fast
#                                       routes that wobble by 1 ms)
#
# Output:
#   docs/performance/baseline-<version>-<date>.md
#
# Requirements: ./server.sh, jq, gh, curl, pm2 available via npx.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

VERSION=$(node -p "require('./package.json').version")
TODAY=$(date +%Y-%m-%d)
OUT_DIR="$REPO_ROOT/docs/performance"
OUT_FILE="$OUT_DIR/baseline-v${VERSION}-${TODAY}.md"
mkdir -p "$OUT_DIR"

# #611: don't clobber an existing same-day baseline for the same version —
# that's almost certainly the release-time capture, and re-runs (especially
# under --compare during development) would silently replace it with whatever
# state the server is in now (often cold-cache, post-restart, with very
# different numbers). If the file exists, suffix the new one with -rN.
if [[ -f "$OUT_FILE" ]]; then
  i=2
  while [[ -f "$OUT_DIR/baseline-v${VERSION}-${TODAY}-r${i}.md" ]]; do
    i=$((i + 1))
  done
  OUT_FILE="$OUT_DIR/baseline-v${VERSION}-${TODAY}-r${i}.md"
fi

PORT=$(grep -E '^PORT=' .env 2>/dev/null | head -1 | cut -d= -f2 || echo "3000")
BASE_URL="http://localhost:${PORT}"

# Read FAST_STORAGE / SLOW_STORAGE from .env if not already in the env. The
# rest of the script consults `${FAST_STORAGE:-./data}` which silently falls
# through to repo-local `./data` (just seed fixtures) when these aren't set —
# fine for memory + route timings, but addon-diff needs the live config path.
if [[ -z "${FAST_STORAGE:-}" ]]; then
  FAST_STORAGE=$(grep -E '^FAST_STORAGE=' .env 2>/dev/null | head -1 | cut -d= -f2- || true)
  [[ -n "$FAST_STORAGE" ]] && export FAST_STORAGE
fi
if [[ -z "${SLOW_STORAGE:-}" ]]; then
  SLOW_STORAGE=$(grep -E '^SLOW_STORAGE=' .env 2>/dev/null | head -1 | cut -d= -f2- || true)
  [[ -n "$SLOW_STORAGE" ]] && export SLOW_STORAGE
fi

# ── Argument parsing ─────────────────────────────────────────────────────────

DO_COLD_START=0
DO_COMPARE=0
DO_ADDON_DIFF=0
COMPARE_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cold-start)
      DO_COLD_START=1
      shift
      ;;
    --compare)
      DO_COMPARE=1
      # Optional filename argument (must not start with --)
      if [[ $# -ge 2 && "${2:0:2}" != "--" ]]; then
        COMPARE_FILE="$2"
        shift 2
      else
        shift
      fi
      ;;
    --addon-diff)
      DO_ADDON_DIFF=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

INSTANCE_NAME=$(npx pm2 jlist 2>/dev/null \
  | jq -r --arg port "$PORT" '.[] | select(.pm2_env.PORT == $port or (.pm2_env.env.PORT // "") == $port) | .name' \
  | head -1)
INSTANCE_NAME="${INSTANCE_NAME:-jimstest}"

echo "Repo:      $REPO_ROOT"
echo "Version:   v${VERSION}"
echo "Instance:  $INSTANCE_NAME (port $PORT)"
echo "Output:    $OUT_FILE"
echo

# Common ROUTES list — referenced from both the regular snapshot and the
# addon-diff mode. Unauthenticated, so /edit/* and /admin are excluded.
ROUTES=("/" "/view/Welcome" "/search?q=test" "/login")

# ── Per-addon overhead diff (#612) ────────────────────────────────────────────

if [[ "$DO_ADDON_DIFF" -eq 1 ]]; then
  echo "→ Mode: --addon-diff (per-addon overhead measurement)"

  CONFIG_PATH="${FAST_STORAGE:-./data}/config/app-custom-config.json"
  if [[ ! -f "$CONFIG_PATH" ]]; then
    echo "❌ Custom config not found: $CONFIG_PATH" >&2
    echo "   Set FAST_STORAGE in .env or pass it via env, then retry." >&2
    exit 2
  fi
  if ! jq -e . "$CONFIG_PATH" >/dev/null 2>&1; then
    echo "❌ Custom config is not valid JSON: $CONFIG_PATH" >&2
    exit 2
  fi

  # Enumerate enabled addons (bash 3.2 compatible — no mapfile)
  ENABLED_KEYS=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && ENABLED_KEYS+=("$line")
  done < <(jq -r 'to_entries[] | select(.key | startswith("ngdpbase.addons.")) | select(.key | endswith(".enabled")) | select(.value == true) | .key' "$CONFIG_PATH")

  if [[ "${#ENABLED_KEYS[@]}" -eq 0 ]]; then
    echo "ℹ️  No enabled addons found in $CONFIG_PATH — nothing to measure"
    exit 0
  fi

  ADDON_NAMES_PREVIEW=""
  for k in "${ENABLED_KEYS[@]}"; do
    n=$(echo "$k" | sed -E 's/ngdpbase\.addons\.([^.]+)\.enabled/\1/')
    ADDON_NAMES_PREVIEW+="$n "
  done

  echo "  Enabled addons: ${#ENABLED_KEYS[@]} (${ADDON_NAMES_PREVIEW% })"
  echo "  This will restart the server $((${#ENABLED_KEYS[@]} + 1)) times. Estimated runtime: ~$(((${#ENABLED_KEYS[@]} + 1) * 35))s minimum."
  echo "  Ctrl-C is safe — config is restored via EXIT trap. Don't kill -9."
  echo

  # Backup config + EXIT trap (always runs, even on Ctrl-C)
  CONFIG_BACKUP=$(mktemp)
  cp "$CONFIG_PATH" "$CONFIG_BACKUP"
  trap '
    rc=$?
    if [[ -f "$CONFIG_BACKUP" ]]; then
      echo
      echo "→ Restoring original config: $CONFIG_PATH"
      cp "$CONFIG_BACKUP" "$CONFIG_PATH"
      rm -f "$CONFIG_BACKUP"
      echo "→ Restarting server to clean state"
      ./server.sh restart >/dev/null 2>&1 || true
    fi
    exit $rc
  ' EXIT

  # ── Helpers (telemetry-first memory; mean-of-10 route timing; restart) ──

  measure_memory_mb_inline() {
    local payload rss bytes
    payload=$(curl -sS --max-time 5 "${BASELINE_METRICS_URL:-http://localhost:9464/metrics}" 2>/dev/null || true)
    if [[ -n "$payload" && "$payload" == *"_process_resident_memory_bytes"* ]]; then
      rss=$(echo "$payload" | awk '/^[^#]/ && $1 ~ /_process_resident_memory_bytes$/ { print $2; exit }')
      if [[ -n "$rss" ]]; then
        awk -v b="$rss" 'BEGIN { printf "%.1f", b / 1024 / 1024 }'
        return
      fi
    fi
    bytes=$(npx pm2 jlist 2>/dev/null \
      | jq -r --arg name "$INSTANCE_NAME" '.[] | select(.name == $name) | .monit.memory' \
      | head -1)
    awk -v b="${bytes:-0}" 'BEGIN { printf "%.1f", b / 1024 / 1024 }'
  }

  measure_route_ms_inline() {
    local route="$1"
    local ms
    # #705: warm-up — N discarded hits so a cold cache / cold JIT on the
    # first requests after a restart don't pollute the timed samples. The
    # `/` false-flag clears at ~3; heavier routes (e.g. /search, lazy
    # index/JIT init) need more, so 5.
    for _ in {1..5}; do
      curl -sSL -o /dev/null --max-time 10 "${BASE_URL}${route}" >/dev/null 2>&1 || true
    done
    # #705: collect N timed samples and report the MEDIAN, not the mean —
    # robust to any single outlier (cold-start or transient), without
    # touching the regression threshold semantics.
    local samples=()
    for _ in {1..10}; do
      ms=$(curl -sSL -o /dev/null -w '%{time_total}' --max-time 10 "${BASE_URL}${route}" 2>/dev/null \
        | awk '{ printf "%d", $1 * 1000 }')
      [[ -n "$ms" ]] && samples+=("$ms")
    done
    local n=${#samples[@]}
    if [[ "$n" -eq 0 ]]; then
      echo "-"
      return
    fi
    local sorted
    sorted=$(printf '%s\n' "${samples[@]}" | sort -n)
    if (( n % 2 == 1 )); then
      # odd → middle element
      echo "$sorted" | sed -n "$(( n / 2 + 1 ))p"
    else
      # even → mean of the two middle elements
      local lo hi
      lo=$(echo "$sorted" | sed -n "$(( n / 2 ))p")
      hi=$(echo "$sorted" | sed -n "$(( n / 2 + 1 ))p")
      echo $(( (lo + hi) / 2 ))
    fi
  }

  # Detects a NEW engine-ready marker by counting before/after.
  restart_and_wait_inline() {
    local pm2_out="${FAST_STORAGE:-./data}/logs/pm2-out.log"
    local before_count after_count
    before_count=$(grep -c '✅ ngdpbase Engine initialized successfully' "$pm2_out" 2>/dev/null || echo 0)
    ./server.sh restart >/dev/null 2>&1 || true
    for _ in {1..90}; do
      sleep 1
      after_count=$(grep -c '✅ ngdpbase Engine initialized successfully' "$pm2_out" 2>/dev/null || echo 0)
      if [[ "$after_count" -gt "$before_count" ]]; then
        # Marker seen — verify route responds before returning
        for _ in {1..15}; do
          if curl -sS -o /dev/null --max-time 2 "${BASE_URL}/" 2>/dev/null; then
            return 0
          fi
          sleep 1
        done
        return 0
      fi
    done
    return 1
  }

  # ── Snapshot 1: all addons enabled (baseline) ──────────────────────────

  total_iterations=$((${#ENABLED_KEYS[@]} + 1))
  echo "→ [1/${total_iterations}] Measuring baseline (all addons enabled)…"
  ALL_MEM=$(measure_memory_mb_inline)
  ALL_TIMES=()
  for route in "${ROUTES[@]}"; do
    ALL_TIMES+=("$(measure_route_ms_inline "$route")")
  done
  echo "  memory: ${ALL_MEM} MB, routes: ${ALL_TIMES[*]} ms"

  # ── Per-addon iterations ────────────────────────────────────────────────

  ADDON_NAMES=()
  ADDON_MEM_DELTAS=()
  ADDON_ROUTE_DELTAS=()  # comma-packed strings, one per addon

  iter=2
  for key in "${ENABLED_KEYS[@]}"; do
    addon_name=$(echo "$key" | sed -E 's/ngdpbase\.addons\.([^.]+)\.enabled/\1/')
    echo "→ [${iter}/${total_iterations}] Disabling ${addon_name}…"
    iter=$((iter + 1))

    TMP=$(mktemp)
    if ! jq --arg k "$key" '.[$k] = false' "$CONFIG_BACKUP" > "$TMP"; then
      echo "  ❌ jq failed to modify config; skipping ${addon_name}" >&2
      rm -f "$TMP"
      ADDON_NAMES+=("$addon_name")
      ADDON_MEM_DELTAS+=("err")
      ADDON_ROUTE_DELTAS+=("err,err,err,err")
      continue
    fi
    mv "$TMP" "$CONFIG_PATH"

    if ! restart_and_wait_inline; then
      echo "  ❌ Server failed to come up cleanly within timeout — skipping ${addon_name}" >&2
      ADDON_NAMES+=("$addon_name")
      ADDON_MEM_DELTAS+=("err")
      ADDON_ROUTE_DELTAS+=("err,err,err,err")
      continue
    fi

    sleep 3  # let caches settle
    DIS_MEM=$(measure_memory_mb_inline)
    DIS_TIMES=()
    for route in "${ROUTES[@]}"; do
      DIS_TIMES+=("$(measure_route_ms_inline "$route")")
    done

    mem_delta=$(awk -v a="$ALL_MEM" -v b="$DIS_MEM" 'BEGIN { printf "%+.1f", a - b }')
    route_delta_str=""
    for j in "${!ROUTES[@]}"; do
      if [[ "${ALL_TIMES[$j]}" != "-" && "${DIS_TIMES[$j]}" != "-" ]]; then
        d=$((ALL_TIMES[j] - DIS_TIMES[j]))
        if [[ "$d" -ge 0 ]]; then
          route_delta_str+="+${d},"
        else
          route_delta_str+="${d},"
        fi
      else
        route_delta_str+="-,"
      fi
    done

    ADDON_NAMES+=("$addon_name")
    ADDON_MEM_DELTAS+=("$mem_delta")
    ADDON_ROUTE_DELTAS+=("${route_delta_str%,}")

    echo "  Δmem: ${mem_delta} MB, Δroutes: ${route_delta_str%,} ms"
  done

  # ── Write addon-diff baseline file ──────────────────────────────────────

  ADDON_OUT_FILE="${OUT_FILE%.md}-addondiff.md"
  if [[ -f "$ADDON_OUT_FILE" ]]; then
    j=2
    while [[ -f "${OUT_FILE%.md}-addondiff-r${j}.md" ]]; do
      j=$((j + 1))
    done
    ADDON_OUT_FILE="${OUT_FILE%.md}-addondiff-r${j}.md"
  fi

  {
    echo "# Per-addon overhead — v${VERSION}"
    echo
    echo "Captured ${TODAY} on instance \`${INSTANCE_NAME}\` (port ${PORT})."
    echo
    echo "## Baseline (all addons enabled)"
    echo
    echo "| Metric | Value |"
    echo "| --- | --- |"
    echo "| Resident memory | ${ALL_MEM} MB |"
    for j in "${!ROUTES[@]}"; do
      echo "| \`${ROUTES[$j]}\` | ${ALL_TIMES[$j]} ms |"
    done
    echo
    echo "## Per-addon delta"
    echo
    echo "Each row reflects the cost of having that addon enabled, computed as (all-enabled metric) − (this-addon-disabled metric). Positive values mean the addon adds that much overhead."
    echo

    header="| Addon | Memory Δ |"
    sep="| --- | --- |"
    for route in "${ROUTES[@]}"; do
      header+=" \`${route}\` Δ |"
      sep+=" --- |"
    done
    echo "$header"
    echo "$sep"

    for k in "${!ADDON_NAMES[@]}"; do
      printf "| %s | %s MB |" "${ADDON_NAMES[$k]}" "${ADDON_MEM_DELTAS[$k]}"
      IFS=',' read -ra deltas <<< "${ADDON_ROUTE_DELTAS[$k]}"
      for d in "${deltas[@]}"; do
        if [[ "$d" == "err" || "$d" == "-" ]]; then
          printf " %s |" "$d"
        else
          printf " %s ms |" "$d"
        fi
      done
      echo
    done

    echo
    echo "## Methodology"
    echo
    echo "Generated by \`scripts/baseline-profile.sh --addon-diff\` (#612). For each addon listed under \`ngdpbase.addons.*.enabled\` in the running install's custom config: (1) capture a baseline with all addons enabled; (2) for each addon, write a config copy with that single addon disabled, restart via \`./server.sh restart\`, wait for the engine-ready marker in \`pm2-out.log\` plus a successful HTTP probe, and re-measure; (3) restore the original config and restart cleanly via an EXIT trap. Memory uses the same telemetry-first / pm2-fallback path as the standard baseline. Route times are the mean of 10 curl iterations. Run-to-run noise can blur small deltas (~5 MB / ~5 ms); large addons (e.g. elasticsearch) should dominate."
  } > "$ADDON_OUT_FILE"

  echo
  echo "✅ Addon-diff baseline written to: $ADDON_OUT_FILE"
  echo
  cat "$ADDON_OUT_FILE"

  # EXIT trap fires here — restores config + final restart.
  exit 0
fi

# ── Cold-start timing (optional) ──────────────────────────────────────────────

COLD_START_MS=""
LINK_GRAPH_MS=""
LINK_GRAPH_ENTRIES=""

if [[ "$DO_COLD_START" -eq 1 ]]; then
  echo "→ Measuring cold start (./server.sh stop && start)…"
  ./server.sh stop >/dev/null 2>&1 || true
  sleep 2
  START_TS=$(date +%s%3N)
  ./server.sh start >/dev/null 2>&1 || true
  # Wait for the engine-ready marker
  for _ in {1..60}; do
    if grep -q '✅ ngdpbase Engine initialized successfully' "${FAST_STORAGE:-./data}/logs/pm2-out.log" 2>/dev/null; then
      break
    fi
    sleep 1
  done
  END_TS=$(date +%s%3N)
  COLD_START_MS=$((END_TS - START_TS))
  echo "  cold-start: ${COLD_START_MS} ms"
fi

# Always look back for the most recent link-graph entry-count + duration.
PM2_OUT="${FAST_STORAGE:-./data}/logs/pm2-out.log"
if [[ -f "$PM2_OUT" ]]; then
  # `|| true`: a rotated/fresh log may lack the line — under `set -euo pipefail`
  # an unguarded no-match grep silently kills the whole capture here.
  LINK_GRAPH_LINE=$(grep 'Link graph built with' "$PM2_OUT" | tail -1 || true)
  if [[ -n "$LINK_GRAPH_LINE" ]]; then
    LINK_GRAPH_ENTRIES=$(echo "$LINK_GRAPH_LINE" | grep -oE '[0-9]+ entries' | grep -oE '[0-9]+')
  fi
fi

# ── Memory snapshot — telemetry first (#610), pm2 fallback ────────────────────

# When MetricsManager is enabled, /metrics exposes process memory gauges that
# match what telemetry consumers see — single source of truth. Falls back to
# `pm2 jlist` when the endpoint is unreachable (telemetry off, default config).
#
# Override the endpoint with BASELINE_METRICS_URL.
# Force pm2 path with BASELINE_METRICS_DISABLE=1 (e.g. to capture identical
# numbers across pre/post telemetry-config diffs).

METRICS_URL="${BASELINE_METRICS_URL:-http://localhost:9464/metrics}"
MEM_SOURCE="pm2"
HEAP_USED_MB=""
HEAP_TOTAL_MB=""
ENGINE_INIT_MEAN_MS=""
METRICS_PAYLOAD=""

if [[ "${BASELINE_METRICS_DISABLE:-0}" != "1" ]]; then
  METRICS_PAYLOAD=$(curl -sS --max-time 5 "$METRICS_URL" 2>/dev/null || true)
  if [[ -n "$METRICS_PAYLOAD" && "$METRICS_PAYLOAD" == *"_process_resident_memory_bytes"* ]]; then
    MEM_SOURCE="telemetry"
  fi
fi

# Pull a metric value where the metric name ends with the given suffix.
# Skips comment lines (# HELP / # TYPE). Handles OTel-style label suffixes
# (`{otel_scope_name="...",...}`) — for labeled lines, the value is the
# whitespace-separated token after the closing `}`; for bare lines it's $2.
# Returns empty string if not found.
get_metric() {
  local suffix="$1"
  # Here-string instead of `echo | awk` — when the metric is found early
  # and awk exits, a long-running `echo` pipe races SIGPIPE under
  # `set -o pipefail`. The here-string buffers the payload via a temp.
  awk -v suffix="$suffix" '
      /^[^#]/ {
        line = $0
        # Strip {…} labels and capture both the metric name and the value
        # that follows. Robust to spaces inside label values.
        if (match(line, /\{[^}]*\}/) > 0) {
          name = substr(line, 1, RSTART - 1)
          rest = substr(line, RSTART + RLENGTH)
          # rest starts with whitespace + value (+ optional timestamp)
          sub(/^[ \t]+/, "", rest)
          split(rest, parts, /[ \t]+/)
          value = parts[1]
        } else {
          name = $1
          value = $2
        }
        if (name ~ suffix"$") { print value; exit }
      }
    ' <<< "$METRICS_PAYLOAD"
}

if [[ "$MEM_SOURCE" == "telemetry" ]]; then
  RSS_BYTES=$(get_metric "_process_resident_memory_bytes")
  HEAP_USED_BYTES=$(get_metric "_process_heap_used_bytes")
  HEAP_TOTAL_BYTES=$(get_metric "_process_heap_total_bytes")
  EI_SUM=$(get_metric "_engine_init_duration_ms_sum")
  EI_COUNT=$(get_metric "_engine_init_duration_ms_count")

  MEM_BYTES="${RSS_BYTES:-0}"
  MEM_MB=$(awk -v b="${MEM_BYTES:-0}" 'BEGIN { printf "%.1f", b / 1024 / 1024 }')
  if [[ -n "$HEAP_USED_BYTES" ]]; then
    HEAP_USED_MB=$(awk -v b="$HEAP_USED_BYTES" 'BEGIN { printf "%.1f", b / 1024 / 1024 }')
  fi
  if [[ -n "$HEAP_TOTAL_BYTES" ]]; then
    HEAP_TOTAL_MB=$(awk -v b="$HEAP_TOTAL_BYTES" 'BEGIN { printf "%.1f", b / 1024 / 1024 }')
  fi
  if [[ -n "$EI_SUM" && -n "$EI_COUNT" && "$EI_COUNT" != "0" ]]; then
    ENGINE_INIT_MEAN_MS=$(awk -v s="$EI_SUM" -v c="$EI_COUNT" 'BEGIN { printf "%.0f", s / c }')
  fi
else
  MEM_BYTES=$(npx pm2 jlist 2>/dev/null \
    | jq -r --arg name "$INSTANCE_NAME" '.[] | select(.name == $name) | .monit.memory' \
    | head -1)
  MEM_MB=$(awk -v b="${MEM_BYTES:-0}" 'BEGIN { printf "%.1f", b / 1024 / 1024 }')
fi

# Page count: actual live data lives at $SLOW_STORAGE/pages, not the in-repo
# data/pages (which is just seed/test fixtures). Exclude versions/ subdirs —
# those are stored historical revisions, not current pages.
PAGES_DIR="${SLOW_STORAGE:-./data}/pages"
PAGE_COUNT=$(find "$PAGES_DIR" -name '*.md' -not -path '*/versions/*' 2>/dev/null | wc -l | tr -d ' ')

echo "→ Memory snapshot: ${MEM_MB} MB resident (source: ${MEM_SOURCE})"
if [[ -n "$HEAP_USED_MB" ]]; then
  echo "  heap used:       ${HEAP_USED_MB} MB / ${HEAP_TOTAL_MB} MB"
fi
if [[ -n "$ENGINE_INIT_MEAN_MS" ]]; then
  echo "  engine init mean: ${ENGINE_INIT_MEAN_MS} ms (from telemetry histogram)"
fi
echo "→ Pages on disk:   ${PAGE_COUNT}"

# ── Response-time samples ─────────────────────────────────────────────────────

echo "→ Sampling response times (5 warm-up + median of 10 per route)…"

# Parallel arrays — macOS bash 3.2 has no associative arrays.
# ROUTES is defined at the top so addon-diff mode can reuse it. Routes are
# unauthenticated only — /edit/* and admin routes 302 to /login.
ROUTE_TIMES=()
for route in "${ROUTES[@]}"; do
  # Warm-up: N discarded hits so a cold cache / cold JIT does not pollute the
  # timed samples.
  #
  # #705 added exactly this to `measure_route_ms_inline`, but that helper is
  # scoped inside addon-diff mode and this — the loop that runs on EVERY
  # release — never got it. The result was four consecutive releases
  # (v3.67.1, v3.68.1, v3.68.2 and one prior) where the capture, taken right
  # after the restart that E2E requires, flagged a >50% "regression" that
  # vanished on a warm re-sample: `/` read 150 ms here against 8 ms warm.
  # Every one cost a manual judgement call to dismiss.
  for _ in {1..5}; do
    curl -sSL -o /dev/null --max-time 10 "${BASE_URL}${route}" >/dev/null 2>&1 || true
  done
  # Median, not mean — robust to a single transient outlier without changing
  # the regression-threshold semantics. Matches measure_route_ms_inline.
  route_samples=()
  for _ in {1..10}; do
    ms=$(curl -sSL -o /dev/null -w '%{time_total}' --max-time 10 "${BASE_URL}${route}" 2>/dev/null \
      | awk '{ printf "%d", $1 * 1000 }')
    [[ -n "$ms" ]] && route_samples+=("$ms")
  done
  n=${#route_samples[@]}
  if [[ "$n" -gt 0 ]]; then
    sorted=$(printf '%s\n' "${route_samples[@]}" | sort -n)
    ROUTE_TIMES+=("$(echo "$sorted" | awk -v n="$n" 'NR==int((n+1)/2){print; exit}')")
  else
    ROUTE_TIMES+=("-")
  fi
done

# ── Authenticated route sampling (#613) ──────────────────────────────────────

# Set BASELINE_USER + BASELINE_PASS to enable. Skipped silently if either is
# unset, or if the POST /login round-trip doesn't yield a session that can hit
# /profile with a 200. /admin will only return 200 for admin-level creds; for
# non-admin users it 302s to /login and the timing reflects the redirect, not
# the dashboard render — flagged in the markdown methodology section.

AUTH_ROUTES=()
AUTH_ROUTE_TIMES=()
AUTH_LOGGED_IN=0

if [[ -n "${BASELINE_USER:-}" && -n "${BASELINE_PASS:-}" ]]; then
  echo "→ Attempting login as ${BASELINE_USER} for authenticated route sampling…"
  COOKIE_JAR=$(mktemp)
  trap 'rm -f "$COOKIE_JAR"' EXIT

  # Prime the session cookie
  curl -sSL -c "$COOKIE_JAR" -o /dev/null --max-time 10 "${BASE_URL}/login" 2>/dev/null || true

  # POST credentials (processLogin reads username/password from req.body and
  # doesn't validate CSRF, so a direct form POST is sufficient).
  curl -sS -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    --max-time 10 -X POST \
    --data-urlencode "username=${BASELINE_USER}" \
    --data-urlencode "password=${BASELINE_PASS}" \
    -o /dev/null \
    "${BASE_URL}/login" 2>/dev/null || true

  # Verify: /profile is 200 when authenticated, 302 → /login when not.
  profile_code=$(curl -sS -b "$COOKIE_JAR" -o /dev/null -w '%{http_code}' \
    --max-time 10 "${BASE_URL}/profile" 2>/dev/null || echo "")

  if [[ "$profile_code" == "200" ]]; then
    AUTH_LOGGED_IN=1
    echo "  ✓ Logged in (verified via /profile = 200)"
    AUTH_ROUTES=("/edit/Welcome" "/profile" "/my/pages" "/admin")

    echo "→ Sampling authenticated route response times…"
    for route in "${AUTH_ROUTES[@]}"; do
      total=0
      samples=0
      for _ in {1..10}; do
        ms=$(curl -sSL -b "$COOKIE_JAR" -o /dev/null -w '%{time_total}' --max-time 10 "${BASE_URL}${route}" 2>/dev/null \
          | awk '{ printf "%d", $1 * 1000 }')
        if [[ -n "$ms" ]]; then
          total=$((total + ms))
          samples=$((samples + 1))
        fi
      done
      if [[ "$samples" -gt 0 ]]; then
        AUTH_ROUTE_TIMES+=("$((total / samples))")
      else
        AUTH_ROUTE_TIMES+=("-")
      fi
    done
  else
    echo "  ✗ Login failed (/profile returned ${profile_code:-no response}) — skipping auth routes"
  fi
fi

# ── Write the markdown report ─────────────────────────────────────────────────

{
  echo "# Performance baseline — v${VERSION}"
  echo
  echo "Captured ${TODAY} on instance \`${INSTANCE_NAME}\` (port ${PORT})."
  echo
  echo "## Snapshot"
  echo
  echo "| Metric | Value |"
  echo "| --- | --- |"
  echo "| Version | v${VERSION} |"
  echo "| Pages on disk | ${PAGE_COUNT} |"
  echo "| Resident memory (idle) | ${MEM_MB} MB |"
  echo "| Memory source | ${MEM_SOURCE} |"
  if [[ -n "$HEAP_USED_MB" ]]; then
    echo "| Heap used | ${HEAP_USED_MB} MB |"
  fi
  if [[ -n "$HEAP_TOTAL_MB" ]]; then
    echo "| Heap total | ${HEAP_TOTAL_MB} MB |"
  fi
  if [[ -n "$ENGINE_INIT_MEAN_MS" ]]; then
    echo "| Engine init duration (mean from telemetry) | ${ENGINE_INIT_MEAN_MS} ms |"
  fi
  if [[ -n "$LINK_GRAPH_ENTRIES" ]]; then
    echo "| Link-graph entries | ${LINK_GRAPH_ENTRIES} |"
  fi
  if [[ -n "$COLD_START_MS" ]]; then
    echo "| Cold-start time (./server.sh start → Engine initialized) | ${COLD_START_MS} ms |"
  fi
  echo
  echo "## Response times (mean across 10 samples)"
  echo
  echo "| Route | Time |"
  echo "| --- | --- |"
  for i in "${!ROUTES[@]}"; do
    echo "| \`${ROUTES[$i]}\` | ${ROUTE_TIMES[$i]} ms |"
  done
  echo
  if [[ "$AUTH_LOGGED_IN" -eq 1 ]]; then
    echo "## Authenticated route timings (mean across 10 samples)"
    echo
    echo "Logged in as \`${BASELINE_USER}\`. These routes 302 to \`/login\` when unauthenticated, so the unauth section can't measure them."
    echo
    echo "| Route | Time |"
    echo "| --- | --- |"
    for i in "${!AUTH_ROUTES[@]}"; do
      echo "| \`${AUTH_ROUTES[$i]}\` | ${AUTH_ROUTE_TIMES[$i]} ms |"
    done
    echo
  fi
  echo "## Methodology"
  echo
  echo "Generated by \`scripts/baseline-profile.sh\`. Memory read from \`/metrics\` (\`MetricsManager\` Prometheus exporter) when reachable — single source of truth across live telemetry and per-release baselines (#610). Falls back to \`pm2 jlist\` when telemetry is off (default). The \"Memory source\" row reflects which path was used. Heap used/total and engine init duration come from telemetry only. Override the metrics endpoint with \`BASELINE_METRICS_URL\`; force the pm2 path with \`BASELINE_METRICS_DISABLE=1\`. Response times measured with \`curl -L --time_total\` (follows redirects): 5 discarded warm-up hits per route, then the MEDIAN of 10 timed samples. Warm-up matters because the capture usually follows a server restart (E2E requires one) — without it a cold cache reads as a >50%% route regression that vanishes on a warm re-sample. The unauth section samples routes that don't require login. Authenticated routes are sampled separately when \`BASELINE_USER\`+\`BASELINE_PASS\` env vars are set — \`/admin\` only renders the dashboard for admin-level creds; for non-admin users it 302s to /login and the timing reflects the redirect. Cold-start time measured only when invoked with \`--cold-start\` — wraps \`./server.sh stop\` + \`./server.sh start\` and waits for the \"Engine initialized\" marker in \`pm2-out.log\`."
  echo
  echo "Re-run on each release to track drift over time. Compare against the previous baseline file in \`docs/performance/\` to spot regressions."
} > "$OUT_FILE"

echo
echo "✅ Baseline written to: $OUT_FILE"

# ── Drift comparison vs prior baseline (#611) ───────────────────────────────

if [[ "$DO_COMPARE" -eq 1 ]]; then
  if [[ -z "$COMPARE_FILE" ]]; then
    # Auto-detect: most recent baseline file other than the one we just
    # wrote. Skip *-addondiff*.md files — those are addon-overhead captures
    # taken under disturbed conditions (server restarted N times) and are
    # not comparable to the steady-state per-release baselines.
    COMPARE_FILE=$(ls -t "$OUT_DIR"/baseline-v*.md 2>/dev/null \
      | grep -v "^${OUT_FILE}$" \
      | grep -v -- '-addondiff' \
      | head -1)
  fi

  if [[ -z "$COMPARE_FILE" || ! -f "$COMPARE_FILE" ]]; then
    echo
    echo "ℹ️  --compare requested but no prior baseline found in $OUT_DIR"
    exit 0
  fi

  echo
  echo "→ Comparing against $(basename "$COMPARE_FILE")…"

  # Threshold env vars (with defaults)
  MEM_THRESHOLD_PCT="${BASELINE_MEM_DELTA_PCT:-25}"
  RT_THRESHOLD_PCT="${BASELINE_RT_DELTA_PCT:-50}"
  RT_THRESHOLD_MS="${BASELINE_RT_DELTA_MS:-50}"

  # Extract metric from a baseline file. Args: file, metric_name, unit_pattern.
  # Returns numeric value or empty string.
  extract_metric() {
    local file="$1" pattern="$2"
    grep -E "$pattern" "$file" | head -1 | sed -E 's/.*\| ([0-9]+(\.[0-9]+)?) [^|]*\|.*/\1/'
  }

  PREV_MEM=$(extract_metric "$COMPARE_FILE" '^\| Resident memory')
  CURR_MEM="$MEM_MB"

  declare -a PREV_TIMES=()
  for route in "${ROUTES[@]}"; do
    # Use grep -F (literal) to avoid regex-meta troubles with `?` etc.
    val=$(grep -F "| \`${route}\` " "$COMPARE_FILE" | head -1 | sed -E 's/.*\| ([0-9]+) ms.*/\1/')
    PREV_TIMES+=("${val:-}")
  done

  declare -a PREV_AUTH_TIMES=()
  if [[ "$AUTH_LOGGED_IN" -eq 1 ]]; then
    for route in "${AUTH_ROUTES[@]}"; do
      val=$(grep -F "| \`${route}\` " "$COMPARE_FILE" | head -1 | sed -E 's/.*\| ([0-9]+) ms.*/\1/')
      PREV_AUTH_TIMES+=("${val:-}")
    done
  fi

  # Build the diff table + warnings into one buffer
  REGRESSION_FLAGS=""
  DIFF_TABLE=""

  fmt_delta_mem() {
    local prev="$1" curr="$2"
    if [[ -z "$prev" || -z "$curr" ]]; then
      printf "n/a"
      return
    fi
    awk -v p="$prev" -v c="$curr" 'BEGIN {
      d = c - p
      pct = (p == 0 ? 0 : (d / p) * 100)
      sign = (d >= 0 ? "+" : "")
      printf "%s%.1f MB (%s%.1f%%)", sign, d, sign, pct
    }'
  }

  fmt_delta_ms() {
    local prev="$1" curr="$2"
    if [[ -z "$prev" || -z "$curr" || "$curr" == "-" ]]; then
      printf "n/a"
      return
    fi
    awk -v p="$prev" -v c="$curr" 'BEGIN {
      d = c - p
      pct = (p == 0 ? 0 : (d / p) * 100)
      sign = (d >= 0 ? "+" : "")
      printf "%s%d ms (%s%.1f%%)", sign, d, sign, pct
    }'
  }

  # Memory regression check
  if [[ -n "$PREV_MEM" && -n "$CURR_MEM" ]]; then
    mem_pct_delta=$(awk -v p="$PREV_MEM" -v c="$CURR_MEM" 'BEGIN { if (p==0) print 0; else printf "%.1f", ((c - p) / p) * 100 }')
    if awk -v pct="$mem_pct_delta" -v thresh="$MEM_THRESHOLD_PCT" 'BEGIN { exit !(pct > thresh) }'; then
      REGRESSION_FLAGS="${REGRESSION_FLAGS}memory (+${mem_pct_delta}%); "
    fi
  fi

  # Per-route regression check (factored so unauth + auth use the same logic)
  check_route_regression() {
    local route="$1" prev="$2" curr="$3"
    if [[ -n "$prev" && -n "$curr" && "$curr" != "-" && "$prev" != "0" ]]; then
      local pct ms
      pct=$(awk -v p="$prev" -v c="$curr" 'BEGIN { printf "%.1f", ((c - p) / p) * 100 }')
      ms=$((curr - prev))
      if awk -v pct="$pct" -v thresh="$RT_THRESHOLD_PCT" 'BEGIN { exit !(pct > thresh) }' \
        && [[ "$ms" -gt "$RT_THRESHOLD_MS" ]]; then
        REGRESSION_FLAGS="${REGRESSION_FLAGS}${route} (+${pct}%, +${ms}ms); "
      fi
    fi
  }

  for i in "${!ROUTES[@]}"; do
    check_route_regression "${ROUTES[$i]}" "${PREV_TIMES[$i]:-}" "${ROUTE_TIMES[$i]}"
  done

  if [[ "$AUTH_LOGGED_IN" -eq 1 ]]; then
    for i in "${!AUTH_ROUTES[@]}"; do
      check_route_regression "${AUTH_ROUTES[$i]}" "${PREV_AUTH_TIMES[$i]:-}" "${AUTH_ROUTE_TIMES[$i]}"
    done
  fi

  # Append the drift section to the new baseline file + print to stdout
  {
    echo
    echo "## Drift vs $(basename "$COMPARE_FILE")"
    echo
    if [[ -n "$REGRESSION_FLAGS" ]]; then
      echo "⚠️  **Regression candidate(s):** ${REGRESSION_FLAGS%; }"
      echo
    fi
    echo "| Metric | Previous | New | Δ |"
    echo "| --- | --- | --- | --- |"
    printf "| Memory (idle) | %s MB | %s MB | %s |\n" "$PREV_MEM" "$CURR_MEM" "$(fmt_delta_mem "$PREV_MEM" "$CURR_MEM")"
    for i in "${!ROUTES[@]}"; do
      prev="${PREV_TIMES[$i]:-}"
      curr="${ROUTE_TIMES[$i]}"
      printf "| \`%s\` | %s ms | %s ms | %s |\n" "${ROUTES[$i]}" "${prev:--}" "$curr" "$(fmt_delta_ms "$prev" "$curr")"
    done
    if [[ "$AUTH_LOGGED_IN" -eq 1 ]]; then
      for i in "${!AUTH_ROUTES[@]}"; do
        prev="${PREV_AUTH_TIMES[$i]:-}"
        curr="${AUTH_ROUTE_TIMES[$i]}"
        printf "| \`%s\` (auth) | %s ms | %s ms | %s |\n" "${AUTH_ROUTES[$i]}" "${prev:--}" "$curr" "$(fmt_delta_ms "$prev" "$curr")"
      done
    fi
    echo
    echo "Thresholds (override via env): memory ${MEM_THRESHOLD_PCT}% / route ${RT_THRESHOLD_PCT}% AND ${RT_THRESHOLD_MS}ms (both must trip)."
  } | tee -a "$OUT_FILE"

  # Exit non-zero if any threshold tripped (per #611 spec — release flow stops
  # so a human can review before tagging).
  if [[ -n "$REGRESSION_FLAGS" ]]; then
    echo
    echo "⚠️  Exiting 1 — at least one threshold tripped. Set thresholds higher via env vars or investigate."
    exit 1
  fi
fi
