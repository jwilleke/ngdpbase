# /semver — repo-specific additions

The kit overwrites `.claude/commands/semver.md` wholesale on every `install-kit.sh` run, so
corrections to it belong here. Read this as part of `/semver`.

## Step 4a — the container smoke test needs an admin password (#1142)

`semver.md` Step 4a says to run the smoke container with __no__ `NGDPBASE_ADMIN_PASSWORD`, and calls
that deliberate:

> Deliberately passes no `NGDPBASE_ADMIN_PASSWORD`. A fresh container with an empty volume must come
> up unattended on the shipped defaults; if it cannot, that is the regression this step exists to
> catch.

__That is no longer true, and following it fails every time.__ [#1087](https://github.com/jwilleke/ngdpbase/issues/1087)
made a headless install refuse to start when the resolved admin password is still the well-known
`admin123` shipped in this repository — it previously failed *open* onto a published credential
while `InstallService` documented that it failed *closed*. So an unconfigured headless container is
now supposed to refuse, and the kit's command asserts the opposite.

This cost a half-published release. On `v4.12.0` the local Step 4a failed, was read as a stale skill
rather than a stale workflow, and the release proceeded — then the CI image build failed at the same
point, after the tag and GitHub Release were already public. `4.12.0` and `latest` were pushed;
`4.12.0-devtools` never was.

__Run both halves instead.__ They mirror `.github/workflows/docker-build.yml`, so a local pass means
the CI step will pass too:

```bash
docker build -f docker/Dockerfile --target runtime --build-arg NODE_VERSION=24 \
  -t ngdpbase-release-smoke:local .

# Half 1 — an UNCONFIGURED headless install must REFUSE to boot (#1087).
docker rm -f ngdpbase-smoke-refuse 2>/dev/null
docker run -d --name ngdpbase-smoke-refuse \
  -e HEADLESS_INSTALL=true -e NODE_ENV=production ngdpbase-release-smoke:local
sleep 20
docker inspect --format='{{.State.Running}}' ngdpbase-smoke-refuse   # must be false
docker logs ngdpbase-smoke-refuse 2>&1 | grep "Refusing to create the bootstrap admin account"
docker rm -f ngdpbase-smoke-refuse

# Half 2 — a CONFIGURED headless install must become healthy.
# The config file is required: the guard compares the RESOLVED password rather
# than reading the variable, so the env var alone is still refused.
SM=$(mktemp -d); mkdir -p "$SM/config"
echo '{"ngdpbase.user.security.defaultpassword":"$NGDPBASE_ADMIN_PASSWORD"}' \
  > "$SM/config/app-custom-config.json"
docker rm -f ngdpbase-release-smoke 2>/dev/null
docker run -d --name ngdpbase-release-smoke -p 3099:3000 \
  -e HEADLESS_INSTALL=true -e NODE_ENV=production \
  -e NGDPBASE_ADMIN_PASSWORD="smoke-$(openssl rand -hex 12)" \
  -v "$SM:/app/data" ngdpbase-release-smoke:local

for i in $(seq 1 18); do
  S=$(docker inspect --format='{{.State.Health.Status}}' ngdpbase-release-smoke 2>/dev/null || echo starting)
  echo "  $S"; [ "$S" = "healthy" ] && break
  [ "$S" = "unhealthy" ] && { docker logs ngdpbase-release-smoke; break; }
  sleep 5
done

# #1194 — no NGDPBASE_SESSION_SECRET was passed, so the instance must have
# generated one into the mounted volume's .env. Must print a line; must not be
# the shipped literal. Read it THROUGH the container, as CI does: the file is
# root-owned 0600, and a host-side grep only works here because Docker Desktop
# maps the bind mount's ownership to your user — on the CI runner it does not,
# which is how v4.14.0's image build failed after a green local run.
docker exec ngdpbase-release-smoke grep '^NGDPBASE_SESSION_SECRET=' /app/data/.env | sed 's/=.*/=<set>/'
docker exec ngdpbase-release-smoke grep -q 'ngdpbase-session-secret-change-in-production' /app/data/.env && echo "FAILED: shipped literal"

# #1192 — every bundled addon must have loaded IN THE IMAGE. AddonsManager
# logs and continues on a dead addon, so the container is healthy either way.
docker logs ngdpbase-release-smoke 2>&1 | grep "Failed to load add-on" && echo "FAILED: addon did not load"
```

Then clean up whatever the outcome:

```bash
docker rm -f ngdpbase-release-smoke ngdpbase-smoke-refuse 2>/dev/null
docker rmi -f ngdpbase-release-smoke:local 2>/dev/null
rm -rf "$SM"
```

__If either half fails, stop.__ Nothing is tagged yet, which is the whole point of the step. A half
that fails is not a stale instruction to work around — that reading is what shipped `v4.12.0` with a
missing `-devtools` tag.

## Step 7a — check `latest-devtools` too

The tag-existence check in `semver.md` lists `<version>`, `<version>-devtools` and
`latest-devtools`. Worth stating why the last one matters: `latest` moves with the plain image in an
earlier step than `-devtools` is built, so a failure between them leaves `latest` and
`latest-devtools` pointing at __different releases__. That is not visible from the workflow's status
alone, and it is exactly what happened on `v4.12.0`.
