#!/bin/sh
# npm ci, retried with backoff (#1450).
#
# ffmpeg-static's install script aborts the whole install when GitHub's
# release CDN flaps on one of its companion files (.LICENSE / .README), even
# with the binary downloaded. The failure is in a dependency's own install
# script, which runs before any root postinstall, so patch-package cannot
# reach it; a retry is what is left. Each attempt starts clean (npm ci
# removes node_modules), and the downloader's HTTP cache keeps the binary.
#
# Usage: scripts/npm-ci-retry.sh [npm ci args...]
set -u

attempts=3
delay=${NPM_CI_RETRY_DELAY:-20}
for i in $(seq 1 "$attempts"); do
  if npm ci "$@"; then
    exit 0
  fi
  if [ "$i" -lt "$attempts" ]; then
    echo "npm ci failed (attempt $i of $attempts); retrying in ${delay}s" >&2
    sleep "$delay"
    delay=$((delay * 2))
  fi
done
echo "npm ci failed $attempts times" >&2
exit 1
