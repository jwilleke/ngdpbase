# ngdpbase Release & Publishing Contract

This document is the **explicit contract** between `jwilleke/ngdpbase` (publisher) and its downstream consumers (`jwilleke/geohazardwatch`, `jwilleke/fairways-gen2-website`, `jwilleke/mj-infra-flux`, and any future site or deployment that depends on a ngdpbase release).

It states **what ngdpbase publishes, when, and where**. It does **not** state how consumers should consume — that is the consumer's responsibility. The intent is loose coupling: ngdpbase publishes on its own cadence; consumers subscribe on theirs.

## What ngdpbase publishes for every release

For every push of a `v*` git tag (e.g., `v3.39.3`), ngdpbase produces the following artefacts. All of this happens automatically — there is no manual step on the ngdpbase side once a tag is pushed.

| Artefact | Where | Tag(s) produced | Trigger |
|---|---|---|---|
| Git tag (annotated) | `https://github.com/jwilleke/ngdpbase` | `v<X>.<Y>.<Z>` | `/semver` skill |
| Release commit on `master` | `https://github.com/jwilleke/ngdpbase` | the commit the git tag points at | `/semver` skill |
| Docker image | `ghcr.io/jwilleke/ngdpbase` | `<X>.<Y>.<Z>`, `<X>.<Y>`, `<X>`, `latest` | `.github/workflows/docker-build.yml` on `push.tags: v*` |
| `CHANGELOG.md` entry | `https://github.com/jwilleke/ngdpbase/blob/master/CHANGELOG.md` | one section per version | `/semver` skill (via `src/utils/version.ts`) |
| GitHub Release with auto-generated notes | `https://github.com/jwilleke/ngdpbase/releases` | one release per `minor` or `major` tag | `/semver` skill Step 7, `--generate-notes` |
| Performance baseline file | `docs/performance/baseline-v<VERSION>-<DATE>.md` | one file per release | `/semver` skill Step 5a |

### What gets a GitHub Release entry

| Bump type | GH Release auto-published? | Why |
|---|---|---|
| `major` | Yes | Breaking change — visible release entry required |
| `minor` | Yes | New feature surface — visible release entry required |
| `patch` | **Deferred** | Patch chains accumulate; one consolidated GH Release per minor cycle is cheaper than per-patch publishes. Backfill possible via the `/release` skill if a specific patch needs a visible entry. |

A deferred GH Release does **not** affect the Docker image publish — that fires for every tag regardless of bump type. Consumers tracking the ghcr.io image will always see new versions even when no GitHub Release entry exists.

## When publishing happens

`/semver patch|minor|major` (in `.claude/commands/semver.md`) drives the release. The relevant gate is that it tags **only** when:

1. The working tree is clean and on `master`
2. The local branch is up to date with `origin/master`
3. Build (`npm run build`) succeeds
4. Unit tests (`npm test`) pass
5. E2E tests (`npm run test:e2e`) pass

Once the tag is pushed, `docker-build.yml` runs unattended and publishes the image. Renovate / Dependabot / any other consumer subscription should see the new image within their normal poll interval (Renovate default is hourly).

## What ngdpbase does NOT do

To keep the contract clean, the following are **explicit non-promises**:

- ngdpbase **does not** notify consumers when a release ships (no webhook, no email, no Slack post). Consumers must poll / subscribe through their own mechanism.
- ngdpbase **does not** update consumer Dockerfiles, `package.json` pins, GitOps manifests, or any other file in any consumer repo.
- ngdpbase **does not** re-deploy consumer instances (production, staging, geohazardwatch, fairways, mj-infra-flux managed clusters, etc.).
- ngdpbase **does not** wait for consumers to be ready before publishing. A new release ships when ngdpbase is ready to ship it; consumer readiness is independent.
- ngdpbase **does not** maintain backwards-compatibility shims for consumers that lag multiple major versions. Consumers behind by ≥1 major version should expect breaking changes when they catch up.
- ngdpbase **does not** track or coordinate consumer rollout. If `jwilleke/geohazardwatch` is on `3.24.4` while ngdpbase is on `3.39.3`, that's a consumer-side problem (their Renovate / their pin / their workflow) — not a ngdpbase problem.

## Consumer guidance (informational, not promised)

Consumers may use any subscription mechanism they like. Three patterns are known to work today:

### 1. Renovate with a Dockerfile `ARG` pin

The pattern used by `jwilleke/geohazardwatch`. The Dockerfile carries:

```dockerfile
# renovate: datasource=docker depName=ghcr.io/jwilleke/ngdpbase
ARG NGDPBASE_VERSION=3.39.3
FROM ghcr.io/jwilleke/ngdpbase:${NGDPBASE_VERSION}
```

And `renovate.json` declares a `customManager` that recognises the `# renovate:` annotation. Renovate's built-in dockerfile manager cannot follow a `FROM` whose tag is an `ARG`, hence the custom manager. See [geohazardwatch/renovate.json](https://github.com/jwilleke/geohazardwatch/blob/main/renovate.json) for a working example.

### 2. Renovate with a direct `FROM` (no `ARG`)

Simpler — Renovate's built-in dockerfile manager handles a literal `FROM ghcr.io/jwilleke/ngdpbase:<tag>` without any custom config. Use this if the consumer doesn't need to parameterise the version elsewhere in the Dockerfile.

### 3. GitOps with a manual / scripted bump

Consumers like `jwilleke/mj-infra-flux` that deploy via Kubernetes manifests can pin the image tag in their manifest (`image: ghcr.io/jwilleke/ngdpbase:3.39.3`) and update it via Renovate, Flux image-automation controllers, a scheduled CI job, or a manual PR.

## Cadence expectation

ngdpbase ships frequently. Recent cadence (May 2026):

- ~3–6 tags per week during active development
- Mostly `patch` and `minor`; `major` is rare
- Docker images published within ~5 minutes of tag push

A consumer that is more than ~2 minor versions behind is likely missing security fixes (Dependabot alerts on transitive deps in older ngdpbase images persist in the consumer's image) and should be considered out of date.

## Out-of-band notifications

When a consumer is observed to be significantly behind, ngdpbase **may** (but is not obliged to) file an informational issue on the consumer repo pointing at this contract and the current ngdpbase tag. This is a courtesy, not a promise — see for example [`jwilleke/ngdpbase#783`](https://github.com/jwilleke/ngdpbase/issues/783) for the originating discussion. The fix is always on the consumer side.

## Changes to this contract

Material changes to what ngdpbase publishes (e.g., adding a new artefact type, dropping an existing one, changing the Docker registry, changing the tag-naming scheme) will be:

1. Filed as an `[EPIC]` issue on `jwilleke/ngdpbase` with the proposed contract change
2. Cross-posted as an informational issue on each known downstream consumer
3. Implemented only after the issue has been open for at least 7 days to give consumers time to comment
