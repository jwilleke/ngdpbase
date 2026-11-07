# Bulk update for ./server.sh update all. Sourced by server.sh; not a second entrypoint.
# Discovers ngdpbase checkouts from PM2, skips ones an automatic updater already
# updates and ones marked pinned, then runs each remaining checkout's own
# ./server.sh update. Does not pull on its own (it fetches origin/master so the
# ahead check is current), and does not call update's rollback
# (checkout -f / reset --hard) on a tree that fails the safety checks below.

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  echo "Run ./server.sh update all" >&2
  exit 2
fi

_NGDP_UPDATE_ALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_NGDP_UPDATE_ALL_LOCK=""
_NGDP_UPDATE_ALL_TMPDIR=""

ngdp_update_all_release() {
  if [ -n "$_NGDP_UPDATE_ALL_LOCK" ]; then
    [ -L "$_NGDP_UPDATE_ALL_LOCK" ] && rm -f "$_NGDP_UPDATE_ALL_LOCK"
    _NGDP_UPDATE_ALL_LOCK=""
  fi
  if [ -n "$_NGDP_UPDATE_ALL_TMPDIR" ]; then
    rm -rf "$_NGDP_UPDATE_ALL_TMPDIR"
    _NGDP_UPDATE_ALL_TMPDIR=""
  fi
}

# Must run in the main shell (not in $(...)) so the EXIT trap sees the directory.
ngdp_update_all_tmpdir() {
  [ -n "$_NGDP_UPDATE_ALL_TMPDIR" ] && return 0
  _NGDP_UPDATE_ALL_TMPDIR="$(mktemp -d "${TMPDIR:-/tmp}/ngdp-update-all.XXXXXX")" || return 1
}

# Prints the path of a named file inside the private temp directory.
ngdp_update_all_tmp() {
  printf '%s/%s\n' "$_NGDP_UPDATE_ALL_TMPDIR" "$1"
}

# The lock is a symlink whose target is the holder's pid: creating it is one
# atomic step that also records the pid, so there is never a lock without one.
# A lock that is anything else (an old-format directory, a file) is not ours to
# take over. A dead holder's lock is replaced under a second mkdir mutex, after
# re-reading it, so two runs cannot both reclaim it.
ngdp_update_all_lock() {
  local base="${XDG_CONFIG_HOME:-$HOME/.config}/ngdpbase"
  mkdir -p "$base" || return 1
  local lock="$base/update-all.lock"
  # ln -s into an existing directory would create the link inside it, so only
  # try when nothing is at the path.
  if [ ! -e "$lock" ] && [ ! -L "$lock" ] && ln -s "$$" "$lock" 2>/dev/null; then
    _NGDP_UPDATE_ALL_LOCK="$lock"
    return 0
  fi
  local pid=""
  if [ -L "$lock" ]; then
    pid="$(readlink "$lock" 2>/dev/null || true)"
  fi
  case "$pid" in
    ''|*[!0-9]*)
      echo "❌ ${lock} exists but holds no pid, so it was not taken over. Nothing was updated."
      echo "   If no update all is running, remove it and try again."
      return 1
      ;;
  esac
  if kill -0 "$pid" 2>/dev/null; then
    echo "❌ Another update all is already running (pid $pid). Nothing was updated."
    return 1
  fi
  local mutex="$lock.reclaim"
  if ! mkdir "$mutex" 2>/dev/null; then
    echo "❌ Another update all is reclaiming ${lock} (or died doing so; remove ${mutex}). Nothing was updated."
    return 1
  fi
  local now got=1
  now="$(readlink "$lock" 2>/dev/null || true)"
  if [ "$now" = "$pid" ] && rm -f "$lock" && ln -s "$$" "$lock" 2>/dev/null; then
    got=0
    _NGDP_UPDATE_ALL_LOCK="$lock"
  else
    echo "❌ Another update all took the lock first. Nothing was updated."
  fi
  rmdir "$mutex" 2>/dev/null || true
  return "$got"
}

ngdp_update_all_canon() {
  (CDPATH= cd -- "$1" 2>/dev/null && pwd -P)
}

ngdp_update_all_is_root() {
  local dir="$1"
  [ -n "$dir" ] && [ -d "$dir" ] && [ -f "$dir/server.sh" ] || return 1
  grep -q "ngdpbase Server Management Script" "$dir/server.sh" 2>/dev/null
}

# The PM2 working directory must itself be a checkout. The script path is not
# walked upward: an unrelated app whose script sits under a checkout is not one.
ngdp_update_all_root_from() {
  local cwd="$1"
  case "$cwd" in
    /*) ;;
    *) return 1 ;;
  esac
  ngdp_update_all_is_root "$cwd" || return 1
  ngdp_update_all_canon "$cwd"
}

# Parallel arrays, one row per canonical checkout.
_UA_ROOTS=()
_UA_NAMES=()
_UA_ONLINE=()
_UA_WATCH=()
_UA_IGNORED=()

ngdp_update_all_add_process() {
  local name="$1" cwd="$2" status="$4" watch="$5"
  local root index
  root="$(ngdp_update_all_root_from "$cwd" 2>/dev/null || true)"
  if [ -z "$root" ]; then
    [ -n "$name" ] && _UA_IGNORED+=("$name")
    return 0
  fi
  index=0
  while [ "$index" -lt "${#_UA_ROOTS[@]}" ]; do
    if [ "${_UA_ROOTS[$index]}" = "$root" ]; then
      local known="" have=0
      while IFS= read -r known; do
        if [ "$known" = "$name" ]; then
          have=1
          break
        fi
      done <<EOF
$(ngdp_update_all_name_list "${_UA_NAMES[$index]}")
EOF
      if [ "$have" -eq 0 ]; then
        _UA_NAMES[$index]="${_UA_NAMES[$index]}"$'\036'"$name"
      fi
      if [ "$status" = "online" ]; then
        _UA_ONLINE[$index]=1
      fi
      if [ "$watch" = "1" ]; then
        _UA_WATCH[$index]=1
      fi
      return 0
    fi
    index=$((index + 1))
  done
  _UA_ROOTS+=("$root")
  _UA_NAMES+=("$name")
  if [ "$status" = "online" ]; then
    _UA_ONLINE+=(1)
  else
    _UA_ONLINE+=(0)
  fi
  if [ "$watch" = "1" ]; then
    _UA_WATCH+=(1)
  else
    _UA_WATCH+=(0)
  fi
}

ngdp_update_all_display_name() {
  local raw="$1" first rest
  first="${raw%%$'\036'*}"
  if [ "$first" = "$raw" ]; then
    printf '%s' "$first"
    return 0
  fi
  rest="${raw#*$'\036'}"
  rest="${rest//$'\036'/, }"
  printf '%s (+ %s)' "$first" "$rest"
}

ngdp_update_all_name_list() {
  local raw="$1"
  printf '%s\n' "${raw//$'\036'/$'\n'}"
}

# policy file and detected ownership, matched by canonical path or PM2 name.
_UA_POL_PATH=()
_UA_POL_KIND=()
_UA_OWN_PATH=()
_UA_OWN_KIND=()
_UA_OWN_SRC=()
_UA_OWN_NAME=()
_UA_OWN_NAME_SRC=()
_UA_BASE_PIN=()
_UA_BASE_PIN_SRC=()
_UA_UPDATER=0
_UA_BLOCK=0
_UA_BLOCK_WHY=""

ngdp_update_all_read_policy_file() {
  local file="${NGDP_UPDATE_POLICY_FILE:-${XDG_CONFIG_HOME:-$HOME/.config}/ngdpbase/update-policy}"
  [ -f "$file" ] || return 0
  local line number=0 trimmed kind rest canon
  while IFS= read -r line || [ -n "$line" ]; do
    number=$((number + 1))
    trimmed="${line#"${line%%[![:space:]]*}"}"
    trimmed="${trimmed%"${trimmed##*[![:space:]]}"}"
    case "$trimmed" in
      ''|'#'*) continue ;;
    esac
    kind="${trimmed%%[[:space:]]*}"
    rest="${trimmed#"$kind"}"
    rest="${rest#"${rest%%[![:space:]]*}"}"
    rest="${rest%"${rest##*[![:space:]]}"}"
    case "$kind" in
      auto|pinned|manual) ;;
      *)
        echo "⚠️  ${file}:${number} ignored (want: auto, pinned, or manual, then an absolute path)"
        continue
        ;;
    esac
    case "$rest" in
      \"*\") rest="${rest#\"}"; rest="${rest%\"}" ;;
      \'*\') rest="${rest#\'}"; rest="${rest%\'}" ;;
    esac
    case "$rest" in
      /*) ;;
      *)
        echo "⚠️  ${file}:${number} ignored (path is not absolute)"
        continue
        ;;
    esac
    if [ ! -d "$rest" ]; then
      echo "⚠️  ${file}:${number} ignored (not a directory)"
      continue
    fi
    canon="$(ngdp_update_all_canon "$rest" || true)"
    if [ -z "$canon" ]; then
      echo "⚠️  ${file}:${number} ignored (path could not be resolved)"
      continue
    fi
    _UA_POL_PATH+=("$canon")
    _UA_POL_KIND+=("$kind")
  done < "$file"
}

ngdp_update_all_scan_ownership() {
  local names_file crontab scan home
  names_file="$(ngdp_update_all_tmp names)"
  local index=0
  while [ "$index" -lt "${#_UA_NAMES[@]}" ]; do
    ngdp_update_all_name_list "${_UA_NAMES[$index]}" >> "$names_file"
    index=$((index + 1))
  done
  crontab="$(ngdp_update_all_tmp crontab)"
  if [ -n "${NGDP_UPDATE_CRONTAB_FILE+x}" ]; then
    if [ -n "$NGDP_UPDATE_CRONTAB_FILE" ] && [ -f "$NGDP_UPDATE_CRONTAB_FILE" ]; then
      cp "$NGDP_UPDATE_CRONTAB_FILE" "$crontab"
    fi
  else
    crontab -l > "$crontab" 2>/dev/null || true
  fi
  scan="$(ngdp_update_all_tmp ownership)"
  home="${HOME:-}"
  if [ -z "$home" ] || [ ! -d "$home" ]; then
    echo "⚠️  HOME is unset; automatic-updater scripts were not looked up."
    return 0
  fi
  if ! node "$_NGDP_UPDATE_ALL_DIR/update-all-scan.mjs" scan-ownership \
      --home "$home" \
      --xdg "${XDG_CONFIG_HOME:-}" \
      --crontab "$crontab" \
      --names "$names_file" > "$scan"; then
    echo "⚠️  Could not read updater ownership. Unlisted checkouts will not be updated."
    _UA_BLOCK=1
    _UA_BLOCK_WHY="${_UA_BLOCK_WHY}${_UA_BLOCK_WHY:+; }ownership scan failed"
    return 0
  fi
  local kind policy value source
  while true; do
    IFS= read -r -d '' kind || break
    IFS= read -r -d '' policy || break
    IFS= read -r -d '' value || break
    IFS= read -r -d '' source || break
    case "$kind" in
      path)
        _UA_OWN_PATH+=("$value")
        _UA_OWN_KIND+=("$policy")
        _UA_OWN_SRC+=("$source")
        ;;
      name)
        _UA_OWN_NAME+=("$value")
        _UA_OWN_NAME_SRC+=("$source")
        ;;
      basename)
        _UA_BASE_PIN+=("$value")
        _UA_BASE_PIN_SRC+=("$source")
        ;;
      note)
        if [ "$policy" = "updater" ]; then
          _UA_UPDATER=1
        elif [ "$policy" = "block" ]; then
          _UA_BLOCK=1
          _UA_BLOCK_WHY="${_UA_BLOCK_WHY}${_UA_BLOCK_WHY:+; }${source}: ${value}"
        fi
        ;;
    esac
  done < "$scan"
  ngdp_update_all_resolve_basenames
}

# A "(pinned)" directory basename applies only when one running checkout has
# that basename. Two checkouts with it are ambiguous: neither is pinned, and
# unlisted checkouts stay untouched. A checkout the site list already names
# stays automatic.
ngdp_update_all_resolve_basenames() {
  local i=0 base source root base_name r k already named
  local -a matches all_matches
  while [ "$i" -lt "${#_UA_BASE_PIN[@]}" ]; do
    base="${_UA_BASE_PIN[$i]}"
    source="${_UA_BASE_PIN_SRC[$i]}"
    i=$((i + 1))
    matches=()
    all_matches=()
    named=0
    r=0
    while [ "$r" -lt "${#_UA_ROOTS[@]}" ]; do
      root="${_UA_ROOTS[$r]}"
      base_name="$(basename -- "$root")"
      if [ "$base_name" = "$base" ]; then
        all_matches+=("$root")
        # A stopped PM2 entry is not a running checkout.
        if [ "${_UA_ONLINE[$r]}" = "1" ]; then
          matches+=("$root")
        fi
      fi
      if ngdp_update_all_name_list "${_UA_NAMES[$r]}" | grep -F -x -q -- "$base"; then
        named=1
      fi
      r=$((r + 1))
    done
    # "name (pinned)" can also name a PM2 app, as it did before basename pins.
    if [ "$named" -eq 1 ]; then
      _UA_OWN_NAME+=("$base")
      _UA_OWN_NAME_SRC+=("$source")
    fi
    if [ "${#matches[@]}" -eq 0 ] && [ "${#all_matches[@]}" -gt 0 ]; then
      matches=("${all_matches[@]}")
    fi
    if [ "${#matches[@]}" -gt 1 ]; then
      _UA_BLOCK=1
      _UA_BLOCK_WHY="${_UA_BLOCK_WHY}${_UA_BLOCK_WHY:+; }basename ${base} matches ${#matches[@]} checkouts (${source})"
      echo "⚠️  Directory name ${base} is pinned, but ${#matches[@]} running checkouts use it. None of them is pinned, and unlisted checkouts are left alone."
      continue
    fi
    if [ "${#matches[@]}" -eq 0 ]; then
      if [ "$named" -eq 0 ]; then
        _UA_BLOCK=1
        _UA_BLOCK_WHY="${_UA_BLOCK_WHY}${_UA_BLOCK_WHY:+; }pin ${base} matches no checkout or PM2 app name (${source})"
        echo "⚠️  Directory name ${base} is pinned, but no checkout or PM2 app has that name (check case, a trailing dot, symlink aliases and typos). Unlisted checkouts are left alone."
      fi
      continue
    fi
    root="${matches[0]}"
    already=""
    k=0
    while [ "$k" -lt "${#_UA_OWN_PATH[@]}" ]; do
      if [ "${_UA_OWN_PATH[$k]}" = "$root" ] && [ "${_UA_OWN_KIND[$k]}" = "auto" ]; then
        already="auto"
      fi
      k=$((k + 1))
    done
    if [ "$already" = "auto" ]; then
      echo "⚠️  Directory name ${base} is marked pinned, and the updater lists ${root}. The site list stays authoritative."
      continue
    fi
    _UA_OWN_PATH+=("$root")
    _UA_OWN_KIND+=("pinned")
    _UA_OWN_SRC+=("$source")
  done
}

ngdp_update_all_checkout_word() {
  local root="$1" word
  [ -f "$root/.ngdpbase-update-policy" ] || return 0
  word="$(tr -d '[:space:]' < "$root/.ngdpbase-update-policy" 2>/dev/null || true)"
  case "$word" in
    auto|pinned|manual) printf '%s' "$word" ;;
    '') ;;
    *) echo "⚠️  ${root}/.ngdpbase-update-policy is not auto, pinned, or manual; ignoring it" >&2 ;;
  esac
}

# Sets _UA_DECISION to pinned, auto, manual, eligible, or unknown, and
# _UA_WHY to a short reason. Pinned wins, then automatic, then an explicit
# manual mark. A parsed updater that is not blocked makes a checkout it does
# not mention eligible. A policy file does not: it only names the lines it has.
ngdp_update_all_decide() {
  local root="$1" names="$2"
  local saw_pin=0 saw_auto=0 saw_manual=0
  local why_pin="" why_auto="" why_manual="" word index list
  _UA_WHY=""
  word="$(ngdp_update_all_checkout_word "$root")"
  case "$word" in
    pinned) saw_pin=1; why_pin="checkout policy file" ;;
    auto) saw_auto=1; why_auto="checkout policy file" ;;
    manual) saw_manual=1; why_manual="checkout policy file" ;;
  esac
  index=0
  while [ "$index" -lt "${#_UA_POL_PATH[@]}" ]; do
    if [ "${_UA_POL_PATH[$index]}" = "$root" ]; then
      case "${_UA_POL_KIND[$index]}" in
        pinned) saw_pin=1; why_pin="update-policy" ;;
        auto) saw_auto=1; why_auto="update-policy" ;;
        manual) saw_manual=1; why_manual="update-policy" ;;
      esac
    fi
    index=$((index + 1))
  done
  index=0
  while [ "$index" -lt "${#_UA_OWN_PATH[@]}" ]; do
    if [ "${_UA_OWN_PATH[$index]}" = "$root" ]; then
      case "${_UA_OWN_KIND[$index]}" in
        pinned) saw_pin=1; why_pin="updater ${_UA_OWN_SRC[$index]}" ;;
        auto) saw_auto=1; why_auto="updater ${_UA_OWN_SRC[$index]}" ;;
      esac
    fi
    index=$((index + 1))
  done
  list="$(ngdp_update_all_name_list "$names")"
  index=0
  while [ "$index" -lt "${#_UA_OWN_NAME[@]}" ]; do
    if printf '%s\n' "$list" | grep -F -x -q -- "${_UA_OWN_NAME[$index]}"; then
      saw_pin=1
      why_pin="updater names ${_UA_OWN_NAME_SRC[$index]}"
    fi
    index=$((index + 1))
  done
  if [ "$saw_pin" -eq 1 ]; then
    _UA_WHY="$why_pin"
    _UA_DECISION="pinned"
    return 0
  fi
  if [ "$saw_auto" -eq 1 ]; then
    _UA_WHY="$why_auto"
    if [ "$saw_manual" -eq 1 ]; then
      _UA_WHY="${_UA_WHY}; also marked manual, still skipped"
    fi
    _UA_DECISION="auto"
    return 0
  fi
  if [ "$saw_manual" -eq 1 ]; then
    _UA_WHY="$why_manual"
    _UA_DECISION="manual"
    return 0
  fi
  if [ "$_UA_UPDATER" -eq 1 ] && [ "$_UA_BLOCK" -eq 0 ]; then
    _UA_WHY="not listed by the automatic updater"
    _UA_DECISION="eligible"
    return 0
  fi
  _UA_WHY="ownership was not identified"
  _UA_DECISION="unknown"
}

ngdp_update_all_gate() {
  local root="$1" ref="$2"
  # The checkout must be the top of its own repository. Inside another repo,
  # git would act on the parent.
  local top
  top="$(git -C "$root" rev-parse --show-toplevel 2>/dev/null || true)"
  top="$(ngdp_update_all_canon "$top" 2>/dev/null || true)"
  if [ -z "$top" ] || [ "$top" != "$(ngdp_update_all_canon "$root")" ]; then
    printf 'not-git'
    return 0
  fi
  if [ -z "$(find "$root" -maxdepth 0 -user "$(id -u)" 2>/dev/null)" ]; then
    printf 'not-owned'
    return 0
  fi
  # index.lock is checked before status: status itself fails while another git
  # command holds the index, and bulk mode must not join that operation.
  local gitdir dirty branch ahead behind
  gitdir="$(git -C "$root" rev-parse --absolute-git-dir 2>/dev/null || true)"
  if [ -n "$gitdir" ] && [ -e "$gitdir/index.lock" ]; then
    printf 'index-locked'
    return 0
  fi
  if ! git -C "$root" symbolic-ref -q HEAD >/dev/null 2>&1; then
    printf 'detached'
    return 0
  fi
  dirty="$(git -C "$root" status --porcelain --untracked-files=all 2>/dev/null || echo "status-failed")"
  if [ "$dirty" = "status-failed" ]; then
    printf 'status-failed'
    return 0
  fi
  if [ -n "$dirty" ]; then
    printf '%s\n' "$dirty" > "${_UA_DIRTY_FILE:-/dev/null}" 2>/dev/null || true
    printf 'dirty'
    return 0
  fi
  if [ -n "$ref" ]; then
    printf 'ok'
    return 0
  fi
  branch="$(git -C "$root" symbolic-ref --short HEAD 2>/dev/null || true)"
  if [ "$branch" != "master" ]; then
    printf 'not-on-master'
    return 0
  fi
  # Refresh origin/master first: a stale ref can hide local commits. If the
  # fetch fails the answer is unknown, and the checkout is held.
  # A dry run fetches nothing and compares against the last fetch.
  if [ "${_UA_DRY:-0}" -eq 0 ] && ! GIT_TERMINAL_PROMPT=0 git -C "$root" fetch --quiet origin master >/dev/null 2>&1; then
    printf 'ahead-unknown'
    return 0
  fi
  if git -C "$root" rev-parse --verify --quiet origin/master >/dev/null 2>&1; then
    ahead="$(git -C "$root" rev-list --count origin/master..HEAD 2>/dev/null || echo 0)"
    behind="$(git -C "$root" rev-list --count HEAD..origin/master 2>/dev/null || echo 0)"
    if [ "${ahead:-0}" -gt 0 ] && [ "${behind:-0}" -gt 0 ]; then
      printf 'divergent'
      return 0
    fi
    if [ "${ahead:-0}" -gt 0 ]; then
      printf 'ahead'
      return 0
    fi
  fi
  printf 'ok'
}

ngdp_update_all_child_env() {
  # Only the child's own server.sh may load that checkout's .env. The parent
  # process has already exported its .env (set -a), including storage paths.
  local -a args
  args=(env -i "PATH=${PATH:-/usr/bin:/bin}" "HOME=${HOME:-}" "TMPDIR=${TMPDIR:-/tmp}" "NGDP_UPDATE_ALL_PARENT=1")
  local key
  for key in USER LOGNAME SHELL LANG LC_ALL LC_CTYPE TERM PM2_HOME \
    SSH_AUTH_SOCK GIT_SSH_COMMAND GIT_SSH \
    HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy \
    UPDATE_READY_TIMEOUT; do
    if [ -n "${!key+x}" ] && [ -n "${!key}" ]; then
      args+=("${key}=${!key}")
    fi
  done
  printf '%s\0' "${args[@]}"
}

ngdp_update_all_run_one() {
  local root="$1" ref="$2" envname="$3"
  local -a update_args env_args
  update_args=(update)
  [ -n "$ref" ] && update_args+=("$ref")
  [ -n "$envname" ] && update_args+=("$envname")
  local field
  env_args=()
  while IFS= read -r -d '' field; do
    env_args+=("$field")
  done < <(ngdp_update_all_child_env)
  (
    cd -- "$root" || exit 97
    exec "${env_args[@]}" ./server.sh "${update_args[@]}"
  ) < /dev/null
}

ngdp_update_all() {
  if [ -n "${NGDP_UPDATE_ALL_PARENT:-}" ]; then
    echo "❌ Refusing recursive update all. Nothing was updated."
    exit 2
  fi
  local dry=0
  local -a positionals=()
  local arg ref="" envname=""
  for arg in "$@"; do
    case "$arg" in
      --dry-run) dry=1 ;;
      --) ;;
      -*)
        echo "❌ Unknown option: $arg"
        echo "   Usage: ./server.sh update all [--dry-run] [ref] [env]"
        exit 2
        ;;
      *) positionals+=("$arg") ;;
    esac
  done
  if [ "${#positionals[@]}" -gt 2 ]; then
    echo "❌ Too many arguments."
    echo "   Usage: ./server.sh update all [--dry-run] [ref] [env]"
    exit 2
  fi
  _UA_DRY="$dry"
  ref="${positionals[0]:-}"
  envname="${positionals[1]:-}"
  if [ "$ref" = "all" ]; then
    echo "❌ 'all' is this command, not a git ref. Nothing was updated."
    exit 2
  fi
  case "$ref" in
    -*|*[[:space:]]*)
      echo "❌ Refusing ref. Nothing was updated."
      exit 2
      ;;
  esac
  case "$envname" in
    -*|*[[:space:]]*)
      echo "❌ Refusing env. Nothing was updated."
      exit 2
      ;;
  esac

  if [ "$(id -u)" = "0" ]; then
    echo "❌ Refusing to run as root: it would run npm and the build as root in checkouts owned by"
    echo "   another user. Run it as the user who owns the checkouts. Nothing was updated."
    exit 2
  fi
  trap ngdp_update_all_release EXIT
  if ! ngdp_update_all_tmpdir; then
    echo "❌ Could not create a temporary directory. Nothing was updated."
    exit 2
  fi
  # A dry run changes nothing, so it neither needs nor blocks on the lock.
  if [ "$dry" -eq 0 ] && ! ngdp_update_all_lock; then
    exit 2
  fi
  if ! command -v node >/dev/null 2>&1; then
    echo "❌ node is required to read the PM2 list. Nothing was updated."
    exit 2
  fi
  if [ ! -f "$_NGDP_UPDATE_ALL_DIR/update-all-scan.mjs" ]; then
    echo "❌ Missing $_NGDP_UPDATE_ALL_DIR/update-all-scan.mjs. Nothing was updated."
    exit 2
  fi

  local raw safe
  raw="$(ngdp_update_all_tmp pm2-raw)"
  safe="$(ngdp_update_all_tmp pm2-safe)"
  echo "Discovering PM2 processes..."
  if ! npx --no pm2 jlist > "$raw" 2>/dev/null; then
    echo "❌ Could not read the PM2 process list. Nothing was updated."
    exit 2
  fi
  if ! node "$_NGDP_UPDATE_ALL_DIR/update-all-scan.mjs" sanitize-pm2 < "$raw" > "$safe"; then
    echo "❌ The PM2 process list was not usable. Nothing was updated."
    rm -f "$raw"
    exit 2
  fi
  rm -f "$raw"

  local name cwd script status watch
  while true; do
    IFS= read -r -d '' name || break
    IFS= read -r -d '' cwd || break
    IFS= read -r -d '' script || break
    IFS= read -r -d '' status || break
    IFS= read -r -d '' watch || break
    ngdp_update_all_add_process "$name" "$cwd" "$script" "$status" "$watch"
  done < "$safe"

  local ignored_n="${#_UA_IGNORED[@]}"
  if [ "$ignored_n" -gt 0 ]; then
    local ignored_show="" item
    for item in "${_UA_IGNORED[@]}"; do
      ignored_show="${ignored_show}${ignored_show:+, }${item}"
    done
    echo "Ignored ${ignored_n} PM2 process(es) with no ngdpbase checkout: ${ignored_show}"
  fi
  local total="${#_UA_ROOTS[@]}"
  if [ "$total" -eq 0 ]; then
    if [ "$ignored_n" -gt 0 ]; then
      echo "❌ PM2 lists ${ignored_n} process(es) but none is an ngdpbase checkout. Nothing was updated."
      echo "   A checkout is recognised by the PM2 working directory holding its server.sh."
      exit 3
    fi
    echo "No ngdpbase checkouts in PM2. Nothing was updated."
    exit 0
  fi
  echo "Found ${total} ngdpbase checkout(s)."

  ngdp_update_all_read_policy_file
  ngdp_update_all_scan_ownership
  if [ "$_UA_UPDATER" -eq 0 ]; then
    echo "No automatic updater script found in LaunchAgents, systemd user units, or crontab."
  fi
  if [ "$_UA_BLOCK" -eq 1 ]; then
    echo "⚠️  Updater ownership is incomplete (${_UA_BLOCK_WHY})."
    echo "    Nothing that no updater clearly owns is updated. To update a checkout, list it explicitly"
    echo "    with a line 'manual <absolute path>' in:"
    echo "    ${NGDP_UPDATE_POLICY_FILE:-${XDG_CONFIG_HOME:-$HOME/.config}/ngdpbase/update-policy}"
  fi

  local policy_file="${NGDP_UPDATE_POLICY_FILE:-${XDG_CONFIG_HOME:-$HOME/.config}/ngdpbase/update-policy}"
  local self
  self="$(ngdp_update_all_canon "$SCRIPT_DIR" 2>/dev/null || true)"
  local -a order=()
  local index=0 self_index=-1
  while [ "$index" -lt "$total" ]; do
    if [ -n "$self" ] && [ "${_UA_ROOTS[$index]}" = "$self" ]; then
      self_index=$index
    else
      order+=("$index")
    fi
    index=$((index + 1))
  done
  if [ "$self_index" -ge 0 ]; then
    order+=("$self_index")
  fi

  local updated=0 failed=0 unknown=0 skipped=0 safety=0 number=0
  local -a cmd_show
  index=0
  while [ "$index" -lt "${#order[@]}" ]; do
    local row="${order[$index]}"
    index=$((index + 1))
    number=$((number + 1))
    local root="${_UA_ROOTS[$row]}"
    local display
    display="$(ngdp_update_all_display_name "${_UA_NAMES[$row]}")"
    ngdp_update_all_decide "$root" "${_UA_NAMES[$row]}"
    local decision="$_UA_DECISION"
    echo ""
    echo "[${number}/${total}] ${display}"
    echo "    ${root}"
    if [ "${_UA_WATCH[$row]}" = "1" ]; then
      echo "    pm2 watch is on; that restarts on file changes and is not release updating"
    fi
    case "$decision" in
      pinned)
        echo "    skip (pinned): ${_UA_WHY}"
        skipped=$((skipped + 1))
        continue
        ;;
      auto)
        echo "    skip (automatic): ${_UA_WHY}"
        skipped=$((skipped + 1))
        continue
        ;;
      unknown)
        echo "    unknown ownership — not updated"
        echo "    ${_UA_WHY}. To include it, add a line to ${policy_file}:"
        echo "      manual ${root}"
        unknown=$((unknown + 1))
        continue
        ;;
    esac
    if [ "${_UA_ONLINE[$row]}" != "1" ]; then
      echo "    skip (not online in PM2). Start it before including it."
      skipped=$((skipped + 1))
      continue
    fi
    case "$decision" in
      manual) echo "    included (${_UA_WHY})" ;;
      eligible) echo "    included (${_UA_WHY})" ;;
    esac
    local dirty_file
    dirty_file="$(ngdp_update_all_tmp "dirty.${number}")"
    _UA_DIRTY_FILE="$dirty_file"
    local gate
    gate="$(ngdp_update_all_gate "$root" "$ref")"
    case "$gate" in
      ok) ;;
      *)
        echo "    skip (${gate}): not running update, so nothing is reset"
        if [ "$gate" = "dirty" ] && [ -s "$dirty_file" ]; then
          sed 's/^/      /' "$dirty_file"
        fi
        safety=$((safety + 1))
        continue
        ;;
    esac
    cmd_show=(./server.sh update)
    [ -n "$ref" ] && cmd_show+=("$ref")
    [ -n "$envname" ] && cmd_show+=("$envname")
    if [ "$dry" -eq 1 ]; then
      echo "    dry-run: would run: ${cmd_show[*]}"
      [ -z "$ref" ] && echo "    (origin/master was not refreshed in this dry run; the ahead check used the last fetch)"
      updated=$((updated + 1))
      continue
    fi
    echo "    running: ${cmd_show[*]}"
    local code=0
    ngdp_update_all_run_one "$root" "$ref" "$envname" || code=$?
    if [ "$code" -eq 0 ]; then
      echo "    result: updated"
      updated=$((updated + 1))
    else
      echo "    result: failed (exit ${code})"
      failed=$((failed + 1))
    fi
  done

  echo ""
  echo "Summary"
  if [ "$dry" -eq 1 ]; then
    echo "  would update  ${updated}"
  else
    echo "  updated       ${updated}"
  fi
  echo "  skipped       ${skipped}"
  echo "  safety hold   ${safety}"
  echo "  unknown       ${unknown}"
  echo "  failed        ${failed}"
  if [ "$dry" -eq 1 ]; then
    echo "Dry run: no checkout was updated."
  fi

  if [ "$failed" -gt 0 ] || [ "$safety" -gt 0 ]; then
    exit 1
  fi
  if [ "$unknown" -gt 0 ]; then
    exit 3
  fi
  exit 0
}
