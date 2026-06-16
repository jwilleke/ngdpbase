---
project_state: "active"
lastModified: '2026-05-23T00:00:00.000Z'
agent_priority_level: "medium"
blockers: []
requires_human_review: ["major architectural changes", "security policy modifications", "deployment to production"]
agent_autonomy_level: "high"
---

<!-- KIT:START v1.0.0-2-g0fee417 — managed by mjs-project-template; edit below the KIT:END marker -->
# Agent Context & Protocols

This section is **managed by the kit** (`install-kit.sh`) — it is identical across repos. Put repo-specific context **below the `KIT:END` marker**; do not edit here.

## Session continuity

- Before starting, read the `▶ Resume here` block at the top of `TODO.md` (committed, so it syncs across machines) and recent `git log`. That is where the last session left off — repeating finished work is the most common avoidable mistake.
- Commit a chunk of work with `/session-commit`: commits code + `TODO.md`, appends a journal entry to `private/project_log.md` (the log is never committed).
- Run `/status` often (after every `/session-commit`): it ranks open work and recommends the next step.
- End a session with `/wrap`: commits anything outstanding, refreshes the `▶ Resume here` pointer, and reports whether it is safe to shut down the editor.

## Priorities — GitHub labels are the source of truth

Priority labels are mutually exclusive and mean:

- `P0` — **Broken. Stop all work and fix it.** (production down / blocked / security breach)
- `P1` — **Delivers value to the mission.**
- `P2` — **Nice to have.**
- `deferred` — consciously postponed; `needs-triage` — awaiting a priority decision.

Then:

- Security comes first. Scanner alerts (Dependabot / code-scanning / GitGuardian) become issues labeled `security` + a graded priority: critical/high → `P0`, medium → `P1`, low → `P2`.
- `TODO.md` = a `▶ Resume here` block (maintained by `/wrap`) on top, then priority bands that `/status` regenerates from the labels. Do not hand-edit the bands.

## Working agreement

- Think before coding: state assumptions, surface trade-offs, ask when scope is ambiguous.
- Simplicity first: the minimum that solves the problem; nothing speculative.
- Use Conventional Commits for messages.
- Issue decomposition — NEVER put "Steps", "Phases", or numbered sequences inside a single GitHub issue. Break each step into its own issue and link them using GitHub relationships: `closes #N` / `fixes #N` (resolves another), `blocked by #N` (dependency), `relates to #N` (context link). Example: a 3-phase migration = 3 issues with "blocked by" chains, not one issue with Phase headings.
- Issue/PR links — Never use a bare `#N` reference alone. Always pair it with the full GitHub URL: `[#333](https://github.com/owner/repo/issues/333)`. This applies in commit messages, PR descriptions, comments, and any agent output. Use `/issues/N` for issues and `/pull/N` for PRs.
- Awaiting approval — When work is complete but requires human sign-off before closing, apply the `in-review` label and leave a comment on the issue/PR that states: what was done, what the human needs to verify, and what action closes it. Never self-close an issue or PR.
- Commits — always use the `/session-commit` skill. Never run a bare `git commit` directly. `/session-commit` enforces the session log update, conventional commit format, and co-author trailer.

## Markdown conventions

- Dash (`-`) bullets; no bare numbered lists. ATX (`#`) headings. Spaced tables (`| a | b |`).
- Inline HTML is **not** allowed. Long lines are fine.
- Rules live in `.markdownlint.jsonc`; the editor, CLI, CI and agents all read that one file.
<!-- KIT:END -->

## Agent Context & Protocols

This file is the Context Map for AI agents. It directs you to the Single Source of Truth (SSoT) for specific domains and defines your operational parameters.

Before you start, check `docs/project_log.md` and recent GitHub commits — that is where session continuity lives. Repeating work that's already done is the most common avoidable mistake on this project.

The four principles below are behavioral guidelines that reduce common LLM coding mistakes. They bias toward caution over speed; for trivial tasks, use judgment.

## 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

No guessing. Be sure to:

- check existing code and
- you understand the issue and
- ask any clarifying questions before proceeding.

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop, name what's confusing, ask.

This applies to ambiguous scope, not every step — `agent_autonomy_level: high` still holds for clearly-defined work.

## 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ship the smallest coherent slice. Ask before bundling adjacent work into the current change.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that your changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

These guidelines are working if: fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Start Here

- Project Overview: [README.md](./README.md)
- Current Tasks: [TODO.md](TODO.md) — what we are working on now
- Work History: [docs/project_log.md](docs/project_log.md) — check this to avoid repeating work

## Technical Standards

- Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md) — patterns, stack, file organization
- Code Style: [CODE_STANDARDS.md](./CODE_STANDARDS.md) — global preferences, TypeScript config, Prettier, ESLint, Markdownlint (MD036: no bold-as-heading), naming, commit format. **Read this first.**
- TypeScript: [docs/TypeScript-Style-Guide.md](./docs/TypeScript-Style-Guide.md) — patterns, type definitions, TSDoc conventions.
- Security: [SECURITY.md](./SECURITY.md) — secrets, auth, dependencies
- Testing: [docs/testing/PREVENTING-REGRESSIONS.md](docs/testing/PREVENTING-REGRESSIONS.md) — CRITICAL, read before modifying code. Also see [CODE_STANDARDS.md § Testing](./CODE_STANDARDS.md#testing).
- Glossary: [docs/GLOSSARY.md](docs/GLOSSARY.md) — canonical terms (Build vs Restart vs Directory Scan vs Page Index vs Search Index Rebuild)

## Process

- Setup: [SETUP.md](./SETUP.md)
- Contributing: [CONTRIBUTING.md](./CONTRIBUTING.md) — workflow, PRs
- Commit message format: conventional commits (`type(scope): description`) per [CODE_STANDARDS.md § Git Commit Messages](./CODE_STANDARDS.md#git-commit-messages).
- Commit workflow: every non-trivial code commit triggers the full [.claude/commands/session-commit.md](.claude/commands/session-commit.md) flow (jimstest pre-flight, semver decision, project_log entry, GH issue comments, TODO.md refresh, log push) — even when `/session-commit` was not explicitly invoked. Docs-only commits skip the build/test pre-flight but still get a project_log entry.
- GitHub interactions: prefer the `gh` CLI for issues, PRs, checks, and releases. For new issues, always use `gh issue create --template <name>` against the templates in `.github/ISSUE_TEMPLATE/` (`bug_report.md`, `feature_request.md`, `epic.md`) — they set labels, assignees, and title prefixes correctly.
- Pre-commit: Husky runs ESLint + Markdownlint; see [CODE_STANDARDS.md § Pre-commit Hooks](./CODE_STANDARDS.md#pre-commit-hooks). Do not bypass with `--no-verify`.
- Publishing contract: [RELEASES.md](./RELEASES.md) states explicitly what ngdpbase publishes for each release (git tag, Docker image at `ghcr.io/jwilleke/ngdpbase`, CHANGELOG, GH Release for minor/major) and what it deliberately does NOT do for downstream consumers (no notifications, no cross-repo pin updates, no consumer re-deploys). Reference when a consumer-side lag issue is filed (see #783).

## Creating or Editing Pages Rendered on Any ngdpbase System

These rules apply to any content page (required-pages, documentation, user-facing help) that will be rendered inside a running ngdpbase instance.

### Never Use the Word "Wiki"

ngdpbase is not just a wiki — it is a general-purpose platform. The word "wiki" must not appear in any user-facing page content, labels, or documentation rendered by the system. Use these instead:

| Instead of | Use |
|---|---|
| wiki page | page |
| wiki link | page link |
| the wiki | [{$applicationname}] |
| wiki's global policies | global access policies |
| wiki content | content |
| wiki links section | Page Links section |

Internal class names like `WikiContext` and `WikiDocument` are code identifiers and not subject to this rule — do not rename them.

The rule also extends to **URLs, route handlers, config keys, and page slugs**: new code must not hardcode `/wiki/<slug>` — the canonical path is `/view/<slug>`. The legacy `/wiki/:page` route registration that 301-redirects to `/view/:page` is tolerated so external bookmarks survive, but no new view, controller, EJS template, or plugin should introduce `/wiki/` URLs.

### Use Builtin Syntax

Never hardcode values that the system can provide dynamically:

- System categories → `[{ConfigAccessor type='systemCategories'}]` not a hardcoded list
- Application name → `[{$applicationname}]` not a hardcoded name
- Other config-driven values → check `ConfigurationManager` for a corresponding accessor before hardcoding

### Use the Page Linking System

Always use the platform's native link syntax — never construct raw `/view/` URLs in page content:

- Preferred: `[Page Title]` — resolves by title, plural/singular matching included
- With display text: `[Display Text|Page Title]`
- Only use `[Text|/view/slug]` when linking to a slug that differs from the page title AND no page title match exists
- The `PageNameMatcher` handles English plural↔singular resolution automatically in both directions (e.g., `[User Keyword]` resolves to a page titled User Keywords), so prefer the simplest form that works

## Critical Technical Mandates

1. TypeScript Migration: "One File Done Right" — for the JS→TS migration specifically, ensure tests pass before deleting the `.js` file, and use atomic commits per file. General TS, ESLint, naming, and formatting rules live in [CODE_STANDARDS.md](./CODE_STANDARDS.md#typescript-configuration).
2. Configuration: never hardcode. Use `ConfigurationManager.getInstance()`. See [config/app-default-config.json](config/app-default-config.json).
3. Testing: TDD only — write the failing test first, then the code. Unit tests run with `npm test` (Jest, mock file I/O); E2E uses Playwright (Chromium). Coverage and test-style rules live in [CODE_STANDARDS.md](./CODE_STANDARDS.md#testing); regression-prevention rules in [docs/testing/PREVENTING-REGRESSIONS.md](docs/testing/PREVENTING-REGRESSIONS.md). One additional non-negotiable: **test teardown must never wipe `./data/` wholesale** — remove only specific test-created subdirectories. Patterns like `fs.rmSync(dataDir, {recursive:true})` or `fs.remove(path.join(cwd(), 'data'))` have previously destroyed live page, config, and install state on `npm test` runs.
4. `WikiContext`: always use it for request/user state (code identifier; see no-wiki rule above).
5. `WikiDocument`: use the DOM-based pipeline for parsing (code identifier; see no-wiki rule above).
6. Secrets: never commit unencrypted secrets to git or any CMS. Store in gitignored `.env`; see [SECURITY.md](./SECURITY.md).

## Agent Autonomy Matrix

### Autonomous Tasks

- Refactoring (following `CODE_STANDARDS.md`)
- Bug fixes (non-critical)
- Documentation updates
- Writing/fixing tests
- Explicitly assigned features in `TODO.md`

### Require Human Review

- Major architectural changes
- Security policy modifications
- Breaking API changes
- New 3rd party integrations
- Database/Schema changes
- `config/app-default-config.json` permission/role/policy catalog changes — do not modify as part of a fix without explicit approval

## Always Use

- `server.sh` to stop and start the server (never `pm2`, `kill`, or `node` directly). After any `npm run build` or `/semver` release, run `./server.sh restart` explicitly — building `dist/` does **not** cycle the running pm2 process, and the live instance will keep serving stale code until restarted.
- `src/utils/version.ts` to perform SEMVER updates

## Local Environment

This instance is configured via a gitignored `.env` at the project root:

```
FAST_STORAGE=/Volumes/hd2/jimstest-wiki/data
SLOW_STORAGE=/Volumes/hd2A/jimstest-wiki/data
```

- `FAST_STORAGE` — operational data: sessions, users, logs, config, search index, `page-index.json`
- `SLOW_STORAGE` — bulk content: pages, attachments

`server.sh` sources this file automatically on start. Without it the server falls back to `./data` and shows the install screen. Do not commit `.env`.
