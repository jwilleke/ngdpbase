# Related repositories and deployments

The repositories and sites that surround ngdpbase, and what each one actually takes from it.

Dependency runs one way. Every repository below consumes something ngdpbase publishes; ngdpbase consumes nothing from any of them and does not know they exist. [RELEASES.md](../RELEASES.md) is the contract that makes that work — ngdpbase publishes on its own cadence, each consumer subscribes on theirs.

This page is the __repository-level__ view: which repositories exist, what each one takes, and how it is packaged. For __how an instance is implemented and what it inherits__ — the three methods, the inheritance table, and the per-instance specifics — [installation/Implementation.md](installation/Implementation.md) is the lead document and the authority. Where the two disagree, that one is right.

The useful distinction is not "which repo" but __what each one consumes, and how__. There are four different answers, and two repositories that look alike from the outside sit on opposite sides of it.

| Site or repository | What it takes from ngdpbase | How it takes it |
|---|---|---|
| [ngdpbase-demo.example.com](https://ngdpbase-demo.example.com) | the published image, unmodified | pulled by tag, deployed by Flux |
| [geohazardwatch](https://github.com/jwilleke/geohazardwatch) | the published image, unmodified, plus core's add-on installer | stock image deployed by Flux; the add-on installed from npm through the site's config |
| [fairways-gen2-website](https://github.com/jwilleke/fairways-gen2-website) | the source, cloned and run | direct install on a host |
| [ngdpbase-addon-template](https://github.com/jwilleke/ngdpbase-addon-template) (retired) | nothing at runtime | replaced by `npm run create:addon -- --repo` |
| jimstest | this working tree | run in place from the checkout |

## ngdpbase-demo.example.com — stock ngdpbase, nothing added

<https://ngdpbase-demo.example.com>

A plain instance of ngdpbase with no addon enabled, running the published `ghcr.io/jwilleke/ngdpbase` image exactly as it ships. It exists to show what the platform is on its own, so it is also the honest answer to "what do you get before anyone extends it".

It is deployed from [mj-infra-flux](https://github.com/jwilleke/mj-infra-flux) under `apps/production/ngdpbase-demo/`, and Flux image automation moves the deployed tag forward on its own — the manifest carries an `$imagepolicy` marker rather than a hand-edited version. The manifest is where the currently deployed tag is written down; nothing in this repository tracks it.

Its front page redirects to `/view/Demo Welcome`, which is the ordinary page route — the demo runs no special routing.

## geohazardwatch — an add-on installed by a stock-image site

<https://github.com/jwilleke/geohazardwatch>

A volcano and geology platform: ngdpbase plus one domain add-on. The repository holds the add-on only: code, tests, docs, demo pages, and the workflows that test it against ngdpbase and publish it. It builds no image and holds no deployment files.

- `addons/geohazardwatch/` is published to npmjs.com as `@jwilleke/geohazardwatch-addon`, with provenance, by its `publish.yml` on a `geohazardwatch-v<version>` tag
- geohazardwatch.com runs the stock `ghcr.io/jwilleke/ngdpbase` image, deployed from mj-infra-flux under `apps/production/geohazardwatch/`; Flux image automation moves the core version
- the site's `app-custom-config.json`, on its data volume, names the add-on in `ngdpbase.addons.install`, and core installs and verifies it at start

So the coupling is two pins on two axes: the image tag for core, the configured version for the add-on. The add-on's `core-compat.yml` tests it against each new ngdpbase release, and its `ngdpbase.minVersion` stops it loading on a core too old for it. [deployment/domain-site.md](platform/deployment/domain-site.md) is the worked example. Until 2026-10-26 it was a derived image built `FROM` ngdpbase ([#2053](https://github.com/jwilleke/ngdpbase/issues/2053)).

Because the add-on is a published package that core unpacks as published, with no `npm install`, its `package.json` is the only place its requirements are stated. Anything the host supplies — Express, for one — comes from the host and is never a runtime dependency of the add-on.

## fairways-gen2-website — an addon consumed by a direct install

<https://github.com/jwilleke/fairways-gen2-website>

The Fairways Condominiums site. Also ngdpbase plus one domain addon, and from the outside that makes it sound like geohazardwatch. It is not: __there is no image, no published package and no version pin__. No `Dockerfile`, no `NGDPBASE_VERSION`, and no npm dependency on ngdpbase anywhere in the repository.

Instead ngdpbase is cloned separately and run on the host, and that clone is pointed at this repository's `addons/` directory. The addon installs nothing of its own — it uses Express from the instance it is running inside. Its `ngdpbase.domainDefaults` block sets the application name and session-cookie policy, so the deployment's identity travels with the addon rather than living in host configuration. [Implementation.md — Known implementations](installation/Implementation.md#known-implementations) has the operational specifics.

The practical consequence is that this consumer has __no automatic upgrade path__. A geohazardwatch core upgrade arrives through Flux image automation; a Fairways upgrade is someone pulling a newer ngdpbase into the base clone by hand. Nothing announces that a release happened, by design — see the explicit non-promises in [RELEASES.md](../RELEASES.md).

The sharpest form of that difference is environment: a value baked into `docker/Dockerfile` reaches geohazardwatch on its next core bump and never reaches The Fairways at all, because a direct install inherits nothing from the image. That is the single row worth remembering from Implementation.md's inheritance table.

## ngdpbase-addon-template — retired

<https://github.com/jwilleke/ngdpbase-addon-template>

A working reference addon (`addons/hello-ngdp`) in a repository, copied rather than depended on. It was a hand-kept second copy of what `npm run create:addon` generates, and the two drifted ([#1636](https://github.com/jwilleke/ngdpbase/issues/1636)). It is retired: `npm run create:addon -- --id <slug> --repo` now writes the whole repository — the addon at `addons/<slug>/`, CI, Renovate and the licence, with nothing deployment-specific — from the one generator in this repository. The [addons developer guide](guides/addons-developer-guide.md#a-whole-repository---repo) describes it.

The pattern it taught still holds: a generated addon declares no runtime dependencies at all — an addon receives what it needs from the host, and the generated route imports Express without claiming to own it. An addon that declares its own copy of something the host already provides is drifting from that pattern.

## jimstest — the development instance

Not a repository. `jimstest` is the local instance run from this working tree by `./server.sh`, reading `FAST_STORAGE` and `SLOW_STORAGE` from a gitignored `.env`, and it is where a change is confirmed to work in a running system before it becomes a release.

It matters to everything above because it is the only one of these that runs ngdpbase from source. The published image is built from `docker/Dockerfile`, which prunes development dependencies and copies `dist/` — so a change can pass every test in the checkout and still be absent or broken in the image. Verifying on jimstest catches the first half of that; only a release exercises the second.

Start and restart it with `./server.sh` — never `pm2`, `kill`, or `node` directly — and restart it explicitly after any build, because compiling `dist/` does not cycle the running process.
