# Related repositories and deployments

The repositories and sites that surround ngdpbase, and what each one actually takes from it.

Dependency runs one way. Every repository below consumes something ngdpbase publishes; ngdpbase consumes nothing from any of them and does not know they exist. [RELEASES.md](../RELEASES.md) is the contract that makes that work — ngdpbase publishes on its own cadence, each consumer subscribes on theirs.

The useful distinction is not "which repo" but __what each one consumes, and how__. There are four different answers, and two repositories that look alike from the outside sit on opposite sides of it.

| Site or repository | What it takes from ngdpbase | How it takes it |
|---|---|---|
| [ngdpbase-demo.nerdsbythehour.com](https://ngdpbase-demo.nerdsbythehour.com) | the published image, unmodified | pulled by tag, deployed by Flux |
| [geohazardwatch](https://github.com/jwilleke/geohazardwatch) | the published image, as a base | derived image built `FROM` it |
| [fairways-gen2-website](https://github.com/jwilleke/fairways-gen2-website) | the source, cloned and run | direct install on a host |
| [ngdpbase-addon-template](https://github.com/jwilleke/ngdpbase-addon-template) | nothing at runtime | reference shape for new addons |
| jimstest | this working tree | run in place from the checkout |

## ngdpbase-demo.nerdsbythehour.com — stock ngdpbase, nothing added

<https://ngdpbase-demo.nerdsbythehour.com>

A plain instance of ngdpbase with no addon enabled, running the published `ghcr.io/jwilleke/ngdpbase` image exactly as it ships. It exists to show what the platform is on its own, so it is also the honest answer to "what do you get before anyone extends it".

It is deployed from [mj-infra-flux](https://github.com/jwilleke/mj-infra-flux) under `apps/production/ngdpbase-demo/`, and Flux image automation moves the deployed tag forward on its own — the manifest carries an `$imagepolicy` marker rather than a hand-edited version. The manifest is where the currently deployed tag is written down; nothing in this repository tracks it.

Its front page redirects to `/view/Demo Welcome`, which is the ordinary page route — the demo runs no special routing.

## geohazardwatch — an addon shipped as a derived image

<https://github.com/jwilleke/geohazardwatch>

A volcano and geology platform: ngdpbase plus one domain addon. This is the more involved of the two addon repositories, because the addon is packaged twice over.

- `addons/geohazardwatch/` is published to GitHub Packages as `@jwilleke/geohazardwatch-addon`
- its `Dockerfile` builds `FROM ghcr.io/jwilleke/ngdpbase:<version>-devtools`, installs that package into the image, compiles it, and produces `ghcr.io/jwilleke/geohazardwatch`
- the result is deployed to `geohazardwatch.nerdsbythehour.com` from mj-infra-flux under `apps/production/geohazardwatch/`

The `-devtools` tag exists for exactly this: it is the runtime image with npm retained, so a derived build can install into it. A deployed image should never be built from it directly.

The ngdpbase version is pinned in that repository's `Dockerfile` as `ARG NGDPBASE_VERSION`, and Renovate raises the bump when a new ngdpbase release appears. So the coupling is explicit, visible in a diff, and moves on the consumer's schedule.

Because the addon is a published package, its `package.json` is the only place its requirements are stated for whoever installs it. Anything the host supplies — Express, for one — belongs in `peerDependencies` rather than `dependencies`, or the install can place a second copy of it beside the host's.

## fairways-gen2-website — an addon consumed by a direct install

<https://github.com/jwilleke/fairways-gen2-website>

The Fairways Condominiums site. Also ngdpbase plus one domain addon, and from the outside that makes it sound like geohazardwatch. It is not: __there is no image and no version pin__. No `Dockerfile`, no `NGDPBASE_VERSION`, and no npm dependency on ngdpbase anywhere in the repository.

Instead ngdpbase is cloned and run directly on the host, and the addon directory is used from that checkout. The addon installs nothing of its own — it uses Express from the instance it is running inside. Its `ngdpbase.domainDefaults` block sets the application name and session-cookie policy, so the deployment's identity travels with the addon rather than living in host configuration.

The practical consequence is that this consumer has __no automatic upgrade path__. A geohazardwatch upgrade arrives as a Renovate pull request against a pinned version; a Fairways upgrade is someone pulling a newer ngdpbase into the checkout the site runs from. Nothing announces that a release happened, by design — see the explicit non-promises in [RELEASES.md](../RELEASES.md).

## ngdpbase-addon-template — the shape, not a deployment

<https://github.com/jwilleke/ngdpbase-addon-template>

A working reference addon (`addons/hello-ngdp`) that is copied rather than depended on. It is the counterpart to `npm run create:addon` in this repository: the scaffold generates the same shape, and the template repository is where that shape can be read as a finished, working example.

It is worth keeping the two honest with each other, because between them they define what every future addon looks like. In particular the template declares no runtime dependencies at all — an addon receives what it needs from the host, and the generated route imports Express without claiming to own it. An addon that declares its own copy of something the host already provides is drifting from the pattern both of these teach.

## jimstest — the development instance

Not a repository. `jimstest` is the local instance run from this working tree by `./server.sh`, reading `FAST_STORAGE` and `SLOW_STORAGE` from a gitignored `.env`, and it is where a change is confirmed to work in a running system before it becomes a release.

It matters to everything above because it is the only one of these that runs ngdpbase from source. The published image is built from `docker/Dockerfile`, which prunes development dependencies and copies `dist/` — so a change can pass every test in the checkout and still be absent or broken in the image. Verifying on jimstest catches the first half of that; only a release exercises the second.

Start and restart it with `./server.sh` — never `pm2`, `kill`, or `node` directly — and restart it explicitly after any build, because compiling `dist/` does not cycle the running process.
