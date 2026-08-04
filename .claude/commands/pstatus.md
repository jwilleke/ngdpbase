# /pstatus — ranked briefing & next step

A read-and-reconcile command. Run it **often** — ideally right before `/session-commit`.
It surfaces security first, ranks open work by priority, regenerates `TODO.md`, and
recommends what to do next. It does not start work.

## Scope

- `/pstatus` — the current repo (default).
- `/pstatus --all` — portfolio sweep across every active repo (P0 / security everywhere).

## Steps (single repo)

### Step 1: Gather (run in parallel, read-only)

- Security signals (quote the URL — an unquoted `?` is glob-expanded by zsh and the call silently fails with `no matches found`, which reads as a false "clean"):
  - `gh api "/repos/{owner}/{repo}/dependabot/alerts?state=open"`
  - `gh api "/repos/{owner}/{repo}/code-scanning/alerts?state=open"` (ignore a 404 — feature off)
  - any other scanner signal available (e.g. GitGuardian)
- `gh issue list --state open --limit 100 --json number,title,labels`
- `gh pr list --state open --limit 50 --json number,title,isDraft,mergeStateStatus,createdAt,labels,body,closingIssuesReferences`
  — `gh issue list` does **not** return PRs, so without this they are invisible to every band
  below. A merge-ready security PR can sit open across repeated `/pstatus` runs and never be
  mentioned once. `closingIssuesReferences` and `body` feed the PR ↔ issue linkage in Step 4.
- `git log --oneline -5`
- Read the last entries of `private/project_log.md` for session continuity.

### Step 2: Bridge scanner alerts → issues (idempotent)

For each open Dependabot / code-scanning / GitGuardian alert:

- Look for an existing tracking issue (search issue bodies for the marker
  `scanner-alert:<source>:<id>`).
- If none exists, create one:
  - Title: `[security] <package or rule> — <short summary>`
  - Body: the alert detail plus the marker line `scanner-alert:<source>:<id>`
  - Labels: `security` + a **graded** priority — critical/high → `P0`, medium → `P1`, low → `P2`
- Never create a duplicate for an alert that already has a tracking issue.

### Step 3: Triage gate

- Any open issue with **no** placement label (`P0` / `P1` / `P2` / `deferred` / `in-review`) gets
  `needs-triage` so it shows up as awaiting a decision rather than being silently mis-ranked. An
  `in-review` issue is already placed (it lands in the In review band) and is never flagged.

#### Assigning a PR its priority

**PRs are ranked exactly like issues.** An open PR is open work with a priority, not a separate
category of housekeeping, so it earns a placement in the same bands and competes for the same
attention. Resolve each PR's priority in this order — first rule that fires wins:

1. **Its own placement label** — a `P0` / `P1` / `P2` / `deferred` label on the PR itself.
2. **Inherited from a linked issue** — resolve the linkage first (see *Resolving a PR's related
   issues* below), then take the highest priority among the linked issues. A PR that closes a P0
   issue is P0 work.
3. **Graded from a scanner alert** — for a dependency-bump or security PR with no linked issue,
   grade from the severity of the alert it fixes, using the same table as Step 2: critical/high →
   `P0`, medium → `P1`, low → `P2`.
4. **Otherwise** → the Needs triage band.

Do **not** apply the label to the PR on GitHub — a Dependabot/Renovate PR is short-lived and
labelling it churns the bot. Resolve the priority for ranking purposes only. A PR you *do* own may
be labelled if that helps future runs.

`in-review` does not apply to PRs; a PR awaiting the operator's decision is already expressed by its
`ready` / `draft` / `conflicted` state.

### Step 4: Rank and regenerate `TODO.md`

Overwrite `TODO.md` with the open issues **and open PRs** grouped into bands. Both are ranked by the
same priority, in the same list — an item's band comes from its priority, never from whether it
happens to be an issue or a PR.

**Remove the `▶ Resume here` block, including its `RESUME:START` / `RESUME:END` markers.** The
pointer is written by `/wrap` at session end and read by `/context` at session open; by the time
`/pstatus` runs you have already resumed, so it has served its purpose. The output of this step is a
bands-only `TODO.md` — that is intended, not a loss. `/pstatus` never reads the block and never
preserves it.

The bands, in this order:

- `🔴 P0 — Security & Critical` (list `security` / vulnerability items first)
- `🟠 P1`
- `🟡 P2`
- `🔵 In review` (issues labeled `in-review` — work complete and pushed, awaiting the operator's
  decision to close; takes precedence over an issue's priority band so it surfaces as "ready for your call")
- `⏸ Deferred`
- `❓ Needs triage` (count + titles)

**Within a band, PRs sort above issues.** A PR is written work one click from shipping; an issue is
work not yet started. Order PRs newest first among themselves, then the issues.

There is no separate "Open PRs" band. It used to sit at the bottom of the file, below `Deferred`,
which buried merge-ready security PRs under parked addon proposals — the exact inversion this
command exists to prevent. Every open PR now appears in the band its priority earns it.

**One item per line — never bundle.** Each issue and each PR gets its OWN bullet, starting with a
full clickable GitHub link. No grouping headers that pack several refs onto one bullet, no
comma-separated runs of issues, no bare `#<num>`. Issue lines:

`- [#<num>](https://github.com/{owner}/{repo}/issues/<num>) — <title>`

PR lines use the `/pull/` path, carry a **`PR`** marker so they are distinguishable at a glance from
the issues beside them, state their `ready` / `draft` / `conflicted` state from `isDraft` /
`mergeStateStatus`, and **must name their related issues**:

`- **PR** [#<num>](https://github.com/{owner}/{repo}/pull/<num>) — <title> *(ready | draft | conflicted)* — closes [#<n>](…/issues/<n>)`

Flag any PR open more than 7 days as `*(stale — opened <date>)*`.

Dependency-bump PRs (Dependabot / Renovate) are ranked on the same footing: they are frequently
security-relevant and are exactly the kind of thing that goes unnoticed, because the corresponding
scanner alert often looks *already tracked* by an unrelated issue. A high-severity bump lands in P0
next to the critical bugs, which is where it belongs.

#### Resolving a PR's related issues

A PR shown without its issue context reads as unrelated housekeeping, so resolve the link for every
open PR. This also feeds rule 2 of *Assigning a PR its priority* in Step 3, so run it before
placing PRs into bands. In order:

1. **Declared** — `closingIssuesReferences` from Step 1. These are the issues GitHub will
   auto-close on merge; render them as `closes #<n>`.
2. **Mentioned** — any `#<n>` in the PR body that is not a closing reference; render as `refs #<n>`.
3. **Inferred** — for a dependency-bump PR with neither, match the package name against open
   `security` issue titles and bodies (including the `scanner-alert:` markers from Step 2). A
   Dependabot PR bumping package `X` and a tracking issue for an advisory in `X` are the same work
   arriving from two directions. Render as `likely #<n>` — never as `closes`, since it is a guess.

If none of the three resolve, write `no linked issue` explicitly rather than leaving the line bare.
A silent absence is indistinguishable from "not checked".

Cross-reference both ways: an issue whose fix is already sitting in an open PR is **not** actually
open work. Annotate it as `— PR open: [#<pr>](…/pull/<pr>)` so the ranking does not recommend
starting something that is already written. Since the PR inherits that issue's priority, the two
land in the same band on adjacent lines, with the PR above — which is the point.

Where a PR turns out to be redundant — the change is already on the default branch, or a tracking
issue was resolved another way — say so on the PR line as `*(redundant — already on <branch>)*`.
Stale dependency PRs routinely outlive the fix that superseded them.

### Step 5: Brief the user

Print the ranked bands, then a single **"Do this next"** recommendation — the highest-value item in
the highest band (P0, else the top P1, and so on) with one line of why. Stop. Do not begin the work.

Issues and PRs compete on equal footing here, since they are now ranked in the same bands. Where a
PR and an issue sit in the same band, **the merge-ready PR wins**: it is finished work sitting one
click from shipping, so leaving it open while beginning something else is strictly worse than
merging it first. A `draft` or `conflicted` PR carries no such advantage — it is unfinished work
like any other, so rank it on its priority alone.

State the PR ↔ issue linkage in the recommendation itself. "Merge #24 — it closes P0 #25" is
actionable; "merge #24" alone makes the operator go look up why it matters.

## `/pstatus --all` (portfolio sweep — read-only, no writes)

- Resolve the active repo list: `gh repo list <owner> --no-archived --source --limit 200 --json nameWithOwner`.
- For each repo, gather open Dependabot alerts + open issues labeled `P0` + open PRs.
- Print a cross-repo table: `repo | open P0 | open security alerts | open PRs | top item`.
- Recommend which repo needs attention first. Create no issues in sweep mode.
