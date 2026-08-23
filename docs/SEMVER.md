# Semantic Versioning

How ngdpbase versions and releases. Format is [Semantic Versioning 2.0.0](https://semver.org/): `MAJOR.MINOR.PATCH`.

There is deliberately __no "current version" stated here__. `package.json` is the answer, and a number copied into prose is wrong the moment the next release lands — this file previously claimed `1.2.0` for months while the project shipped `4.x`.

## The tool

Version bumps go through `src/utils/version.ts`. Never edit the version in `package.json` by hand: the tool updates `package.json`, `config/app-default-config.json`, and `CHANGELOG.md` together, and a hand edit leaves the other two behind.

```bash
npm run version:show     # print the current version
npm run version:patch    # 4.11.1 → 4.11.2
npm run version:minor    # 4.11.1 → 4.12.0
npm run version:major    # 4.11.1 → 5.0.0
npm run version:help
```

## Releasing

`/semver` is the release path, not the tool above on its own. It runs the full sequence: gate → container smoke test → bump → performance baseline → annotated tag → push → GitHub release → watch the image build → re-validate jimstest → propagate to satellites via `/othersites`.

Two rules that are easy to get wrong:

- __"I did work, ship it" means `/session-commit`, not `/semver`.__ `/session-commit` commits, pre-flights jimstest, makes the semver decision, invokes `/semver` internally, then writes the session log, comments on issues, and refreshes `TODO.md`. Running `/semver` directly skips all of that bookkeeping.
- __A build is not a deploy.__ `npm run build` and `/semver` write `dist/` but do not cycle the running pm2 process. Run `./server.sh restart` afterwards or the instance keeps serving the previous code.

What each release publishes — and what it deliberately does not do for downstream consumers — is stated in [RELEASES.md](../RELEASES.md). Read that before answering a consumer-side lag question.

## Choosing the bump

__PATCH__ — bug fixes, documentation, performance work, internal refactoring. No behaviour a caller depends on changes.

__MINOR__ — new features, new endpoints or plugin/addon capabilities, backward-compatible additions.

__MAJOR__ — breaking API changes, removed functionality, architecture overhauls, anything that requires a consumer to change.

Version history lives in [CHANGELOG.md](./CHANGELOG.md) and the git tags, not here.

## Related

- [RELEASES.md](../RELEASES.md) — the publishing contract
- [CHANGELOG.md](./CHANGELOG.md) — what changed in each version
- `.claude/commands/semver.md` — the release runbook
