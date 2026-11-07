# Bulk update for ./server.sh update all. Sourced by server.sh; not a second entrypoint.
# Discovers ngdpbase checkouts from PM2 and runs each one's own ./server.sh update,
# one at a time, this checkout last. A checkout that is not online, or that fails
# a git check in ngdp_update_all_gate, is skipped with its reason. Does not pull
# on its own (it fetches origin/master so the ahead check is current), and never
# calls update's rollback (checkout -f / reset --hard) on a skipped checkout.

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
  local canon
  canon="$(ngdp_update_all_canon "$cwd")" || return 1
  # The real path is printed. One that resolves through a symlink to a name
  # with control characters (which a terminal acts on) is not a checkout here.
  ngdp_update_all_has_control "$canon" && return 1
  printf '%s\n' "$canon"
}

# True when the text holds a C0 control, DEL, or a UTF-8 encoded C1 control.
ngdp_update_all_has_control() {
  local LC_ALL=C
  case "$1" in
    *[[:cntrl:]]*|*$'\xc2'[$'\x80'-$'\x9f']*) return 0 ;;
  esac
  return 1
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
  # Trim the PM2 app name, as sanitize-pm2 does, so one app is listed once.
  name="${name#"${name%%[![:space:]]*}"}"
  name="${name%"${name##*[![:space:]]}"}"
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

# Prints "ok", or the one-line reason the checkout is skipped. Nothing here
# changes the checkout, so a skipped one is never reset by update's rollback.
ngdp_update_all_gate() {
  local root="$1"
  # The checkout must be the top of its own repository. Inside another repo,
  # git would act on the parent.
  local top
  top="$(git -C "$root" rev-parse --show-toplevel 2>/dev/null || true)"
  top="$(ngdp_update_all_canon "$top" 2>/dev/null || true)"
  if [ -z "$top" ] || [ "$top" != "$(ngdp_update_all_canon "$root")" ]; then
    printf 'not the top of its own git repository'
    return 0
  fi
  if [ -z "$(find "$root" -maxdepth 0 -user "$(id -u)" 2>/dev/null)" ]; then
    printf 'owned by another user'
    return 0
  fi
  # index.lock is checked before status: status itself fails while another git
  # command holds the index, and update all must not join that operation.
  local gitdir dirty count first ahead branch
  gitdir="$(git -C "$root" rev-parse --absolute-git-dir 2>/dev/null || true)"
  if [ -n "$gitdir" ] && [ -e "$gitdir/index.lock" ]; then
    printf 'git index is locked (another git command is running)'
    return 0
  fi
  if ! git -C "$root" symbolic-ref -q HEAD >/dev/null 2>&1; then
    printf 'detached HEAD, not on a branch'
    return 0
  fi
  branch="$(git -C "$root" symbolic-ref --short -q HEAD 2>/dev/null || true)"
  if [ "$branch" != "master" ]; then
    printf 'on branch %s, not master' "$branch"
    return 0
  fi
  if ! dirty="$(git -C "$root" status --porcelain --untracked-files=all 2>/dev/null)"; then
    printf 'git status failed, so uncommitted changes could not be ruled out'
    return 0
  fi
  if [ -n "$dirty" ]; then
    count="$(printf '%s\n' "$dirty" | wc -l | tr -d ' ')"
    first="$(printf '%s\n' "$dirty" | head -n 1)"
    first="${first:3}"
    printf '%s uncommitted or untracked file(s), first: %s' "$count" "$first"
    return 0
  fi
  # git status does not show edits to files marked assume-unchanged (lowercase
  # tag) or skip-worktree (S). update's rollback would overwrite them.
  local tags
  if ! tags="$(git -C "$root" ls-files -v 2>/dev/null)"; then
    printf 'git ls-files failed, so hidden changes could not be ruled out'
    return 0
  fi
  if printf '%s\n' "$tags" | grep -q '^[a-zS] '; then
    printf 'files hidden from git status (assume-unchanged or skip-worktree)'
    return 0
  fi
  # Refresh origin/master first: a stale ref can hide local commits.
  # A dry run fetches nothing and compares against the last fetch.
  if [ "${_UA_DRY:-0}" -eq 0 ] && ! GIT_TERMINAL_PROMPT=0 git -C "$root" fetch --quiet origin master >/dev/null 2>&1; then
    printf 'could not fetch origin/master to check for local commits'
    return 0
  fi
  if ! git -C "$root" rev-parse --verify --quiet refs/remotes/origin/master >/dev/null 2>&1 \
    || ! ahead="$(git -C "$root" rev-list --count refs/remotes/origin/master..HEAD 2>/dev/null)" \
    || [ -z "$ahead" ]; then
    printf 'cannot compare with origin/master, so local commits could not be ruled out'
    return 0
  fi
  if [ "$ahead" -gt 0 ]; then
    printf '%s commit(s) ahead of origin/master' "$ahead"
    return 0
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
  # An empty ref stays in its slot when env is given, so env is never read as a ref.
  if [ -n "$envname" ]; then
    update_args+=("$ref" "$envname")
  elif [ -n "$ref" ]; then
    update_args+=("$ref")
  fi
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
  # An inherited GIT_DIR, GIT_INDEX_FILE or GIT_WORK_TREE (from a git hook, a
  # shell or a .env) would make every git -C below read some other repository.
  local gitvar
  while IFS= read -r gitvar; do
    case "$gitvar" in
      GIT_SSH|GIT_SSH_COMMAND|GIT_TERMINAL_PROMPT) ;;
      GIT_*) unset "$gitvar" 2>/dev/null ;;
    esac
  done < <(compgen -e)
  # unset fails on a readonly variable (readonly GIT_DIR=... in a .env).
  while IFS= read -r gitvar; do
    case "$gitvar" in
      GIT_SSH|GIT_SSH_COMMAND|GIT_TERMINAL_PROMPT) ;;
      GIT_*)
        echo "❌ Refusing: ${gitvar} is set read-only and cannot be cleared, so git checks would read another repository. Nothing was updated."
        exit 2
        ;;
    esac
  done < <(compgen -e)
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

  local updated=0 failed=0 skipped=0 held=0 number=0
  local -a cmd_show
  index=0
  while [ "$index" -lt "${#order[@]}" ]; do
    local row="${order[$index]}"
    index=$((index + 1))
    number=$((number + 1))
    local root="${_UA_ROOTS[$row]}"
    local display
    display="$(ngdp_update_all_display_name "${_UA_NAMES[$row]}")"
    echo ""
    echo "[${number}/${total}] ${display}"
    echo "    ${root}"
    if [ "${_UA_WATCH[$row]}" = "1" ]; then
      echo "    pm2 watch is on; that restarts on file changes and is not release updating"
    fi
    if [ "${_UA_ONLINE[$row]}" != "1" ]; then
      echo "    skip: not online in PM2"
      skipped=$((skipped + 1))
      continue
    fi
    local gate
    gate="$(ngdp_update_all_gate "$root")"
    if [ "$gate" != "ok" ]; then
      echo "    skip: ${gate}"
      held=$((held + 1))
      continue
    fi
    cmd_show=(./server.sh update)
    if [ -n "$envname" ]; then
      cmd_show+=("${ref:-\"\"}" "$envname")
    elif [ -n "$ref" ]; then
      cmd_show+=("$ref")
    fi
    if [ "$dry" -eq 1 ]; then
      echo "    dry-run: would run: ${cmd_show[*]}"
      echo "    (origin/master was not refreshed in this dry run; the ahead check used the last fetch)"
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
  echo "  not online    ${skipped}"
  echo "  held by git   ${held}"
  echo "  failed        ${failed}"
  if [ "$dry" -eq 1 ]; then
    echo "Dry run: no checkout was updated."
  fi

  if [ "$failed" -gt 0 ] || [ "$held" -gt 0 ]; then
    exit 1
  fi
  exit 0
}
