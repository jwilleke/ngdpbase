# Check TODOs Command

Review current `docs/TODO.md` and priorities `AGENTS.md` file, then survey live state in GitHub.

This command helps focus on high-priority and current work by showing:

- GitHub Dependabot alerts or other vulnerabilities
- Open `[BUG]`s in ngdpbase
- `in review` items awaiting decision
- Open PRs (ngdpbase and satellites)
- Operator-decision carryover (e.g., recommended-close issues)
- Top-priority items from sister sites (combined table — see below)
- Notable feature work in flight

## Sister-site survey

The `/othersites` skill defines a list of related local instances; some are checkouts of `jwilleke/ngdpbase` (their issues are this repo's issues) and some are separate satellites with their own issue trackers.

In-scope local checkouts of `jwilleke/ngdpbase`:

- `fairways-base` (port 2121, "The Fairways")
- `ngdpbase-veg` (port 3333, "ve-geology")
- `ngdpbase` (port 3000, "jimstest" — this repo)
- `ngdp-temp-builds` (no separate issue tracker)

Separate satellites with their own issue tracker:

- `jwilleke/geohazardwatch`

When surveying, include a **combined top-priority table** spanning the separate satellite(s). Filter rules:

- Bugs always count; enhancements only if very recent, very impactful, or labeled `in review` / `needs-review`.
- Exclude noise: Renovate Dependency Dashboard issues, dependency-bump PRs already handled in normal flow.
- Roll up clusters: if a group of satellite issues all cross-reference a single ngdpbase tracking issue, list the tracking issue and a count, not each one.

Out of scope (per operator clarification):

- `jwilleke/mj-infra-flux` — not part of `/othersites` scope.

## Usage

Use `/check-todos` to see what work needs to be done and prioritize. Output should match the structure of `docs/TODO.md` for consistency, but read live from GitHub rather than the file — `TODO.md` is a curated snapshot that drifts.

## Output sections

1. **Δ since the previous check** — short list of what's resolved/filed/landed since last run
2. **Security / Dependabot** — open alerts table
3. **Open PRs** — ngdpbase + satellites
4. **In Review** — issues with the `in review` label
5. **Open BUGS** — ngdpbase, count + top by issue # / recency
6. **Sister-site top priorities (combined table)** — geohazardwatch only today; expand if more separate satellites emerge
7. **Operator-action carryover** — items awaiting yes/no/close decisions
8. **Notable feature backlog** — recently filed, biggest scope, or close to ready
9. **docs/TODO.md staleness check** — flag if the file's `lastModified` is older than ~2 weeks
10. **Recommended next moves** — 2-4 concrete next actions
