# Check TODOs Command

Review current `TODO.md` and priorities `AGENTS.md` file, then survey live state in GitHub.

This command helps focus on high-priority and current work by showing:

- GitHub Dependabot alerts or other vulnerabilities
- **Failing GitHub Actions runs** — scheduled / recurring workflows on `master` whose most-recent run is red (silent failures otherwise sit in Actions tab unread)
- Open `[BUG]`s in ngdpbase
- **Waiting on Review Sign-off** — work shipped, `in review` label set, operator verification is the only thing left before close
- Open PRs (ngdpbase and satellites)
- Operator-decision carryover (e.g., recommended-close issues)
- **Easy wins** — open issues that match the easy-win criteria below (bounded scope, no new deps, low risk)
- Top-priority items from sister sites (combined table — see below)

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

Use `/check-todos` to see what work needs to be done and prioritize. Output should match the structure of `TODO.md` for consistency, but read live from GitHub rather than the file — `TODO.md` is a curated snapshot that drifts.

## Freshen TODO.md

Freshen the root `TODO.md` (moved from `docs/TODO.md` on 2026-05-16). Keep only **open** items — do not retain closed/resolved entries (the durable trail is `docs/project_log.md` + GitHub issue history). Include the sister-site sections.

## Output sections

- **Security / Dependabot** — open alerts table
- **Failing GitHub Actions** — recurring workflows on `master` whose latest run failed. Survey via `gh run list --repo jwilleke/ngdpbase --branch master --status failure --limit 10 --json name,conclusion,createdAt,databaseId,url`, then dedupe to the most-recent failing run per workflow (a workflow that has since recovered should not appear). For each failing workflow include name, last-failed timestamp, the failing-job exit message (`gh run view <id> --log-failed | grep -E "##\[error\]|MODULE_NOT_FOUND|Cannot find"`), and the related issue if one exists (#749 for the showdown patch check, etc.). Skip workflows that haven't run on master yet. Note: scheduled-cron workflows on the default branch fire weekly/monthly, so a single failed run can sit unsurfaced for a long time.
- **Waiting on Review Sign-off** — issues carrying the `in review` label: work is shipped/merged; operator verification is the only thing between the issue and closure. For each item include shipped version (if any), what changed in one line, and how to verify (URL, command, file to inspect). This is the section the operator should clear first each session.
- **Open PRs** — ngdpbase + satellites
- **Open BUGS** — ngdpbase, count + top by issue # / recency
- **Sister-site top priorities (combined table)** — geohazardwatch only today; expand if more separate satellites emerge
- **Operator-action carryover** — items awaiting yes/no/close decisions
- **Easy wins** — open issues ready to ship as a single short slice. Survey `gh issue list --state open --limit 100 --json number,title,labels,body` and apply the easy-win filter (see below). Show issue number, title, one-line "what to do", and the rationale for why it qualifies. Cap at 5 — anything beyond that suggests the filter is too loose. Skip when the operator has explicitly carved a longer slice already (e.g., active EPIC work).
- **TODO.md staleness check** — flag if the file's `lastModified` is older than ~2 weeks
- **Recommended next moves** — 2-4 concrete next actions

## Easy-win filter

An open issue qualifies as an "easy win" when **all** of these hold (any miss = disqualified):

- **1-2 commits of focused work** — bounded scope, clear deliverable named in the issue body.
- **No blocking dependencies on other open issues** — must not say "blocked on #N" / "depends on #N" / "needs #N first".
- **No new third-party dependencies** — adding sharp, libvips, ffmpeg, otpauth, simplewebauthn, a new HTTP client, etc. disqualifies.
- **No new architecture decisions required** — there's an obvious shape; no "needs a plan" / "this needs design" framing in body or comments.
- **Low security/UX risk** — does not touch auth, ACL evaluator, secret handling, or the user-facing rendering pipeline (NCM, JSON-LD, HTML sanitizer) in nontrivial ways.
- **Affects already-well-tested code paths** OR is purely additive surface (new helper, new docs page, new test file) with a clear test boundary.
- **No `EPIC` or `architecture` label** — those are by definition multi-slice work; an architecture-labelled issue can still produce easy slice-shaped follow-ups but the parent isn't itself an easy win.
- **No `deferred` label and no "deferred" / "parked" / "no driver" framing in the most recent comment**.

When in doubt, disqualify. The point of the list is "operator can grab one of these and ship it in an afternoon"; a false positive that turns into a multi-day slog defeats the purpose.

Examples of what qualifies:

- A clear bugfix where the diagnosis is already in the issue body.
- Wrapping rendered output in links / chips / badges where the helper already exists.
- A missing test file for a function that already exists in production.
- A small UI tweak with a single acceptance criterion (one button, one collapsible section, one filter).
- A documentation page filed as "add a page covering X" where X is well-understood.

Examples of what does NOT qualify:

- New addon proposals (always multi-slice; almost always need a design pass).
- Anything depending on #685 (data-ingestion framework, not yet started).
- Anything labelled `[EPIC]` or whose body opens with "needs a plan".
- New auth providers, search providers, or storage providers (architectural).
- New rendering pipelines or content converters.
- "Generic" / "framework" / "scaffolder" issues (always more involved than they look).
