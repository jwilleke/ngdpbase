---
name: Testing developer guide
description: Non-negotiable rules for tests in this repo — teardown, proving a test can fail, reproducing the way the suite runs
dateModified: 2026-10-18
category: guides
---

# Testing developer guide

Rules for tests. TDD: write the failing test first, then the code. Unit tests are Vitest with mocked file I/O (`npm test`). E2E is Playwright against Chromium.

## Standing rules

- Test teardown must never wipe `./data/` wholesale. Remove only the subdirectories the test created. Prefer `mkdtemp` under the OS temp dir.
- A regression test written with a fix must be run once with the fix reverted and observed to go red.
- Reproduce a failure the way the suite runs it. Do not skip fixture reset, reuse state, or run one spec alone when the suite runs it in a batch.
- Do not invent a system principal to satisfy a mandatory context. Use `jobContextFromSystem(reason)` or the request subject you were given.
- Test credentials are generated at run time (`pw-${randomUUID()}`), never written as literals, and no real secret is ever committed, in tests or anywhere else. GitGuardian skips test paths (`**/__tests__/**`, `tests/**`, in `.gitguardian.yaml` on master) because its username/password detector matches the shape of test code, not the value; that skip is only safe while this rule holds.

## How to add a test

1. Co-locate under `__tests__/` next to the module.
2. Mock file I/O. Do not point at the live `FAST_STORAGE` tree.
3. For a security or audit door, sabotage once (skip the registration, rebuild the subject, catch-and-continue a `refuse` event) and watch the test go red.

## Pages a test creates are marked `test-artifact`

Every page an E2E test, probe or script creates on a real instance carries the system keyword `test-artifact` ("made by a test, safe to delete"), so a leftover from a failed teardown can be found by keyword instead of looking like content (#1355).

- E2E: call `markTestArtifact(page | request, title)` from `tests/e2e/fixtures/helpers.ts` right after the page is created — after the test's own save, not between create and save (the mark is a save, and the open editor would then hit the stale-edit conflict). `createPage()` does it for you.
- System keywords are server-owned, so the mark goes through the admin-only `POST /api/page/:identifier/test-artifact`; no form or ingest body can set it.
- Scripts and probes that save through `PageManager` or the provider put `system-keywords: ['test-artifact']` in the metadata they save.
- Unit tests never write to a live instance (see Standing rules), so they have nothing to mark.
- `test-artifact` is not `test-page`: `test-page` marks the permanent, shipped test pages below.

## Test pages (rendering shapes)

A rendering or conversion fix adds its content shape to a test page (#1355). Test pages are required pages with `system-keywords: [test-page]`, `author: system`, `system-category: system` and `audience: [admin]`: they ship to every install, only admins can open them, and `src/parsers/__tests__/TestPages.test.ts` renders each through `MarkupParser` with the real `page` markdown profile.

- Add a section to the page that fits (or a new `Test Page: …` page), then its expectations to `EXPECTATIONS` in the test. A test page with no expectations fails the suite.
- A shape that is still broken gets `knownBug: <issue>`. It runs as `test.fails`: green today, red once the bug is fixed — remove the marker then.
- Existing instances get a new or changed page through Admin → Required Pages Sync; `tests/e2e/test-pages.spec.ts` fails when the instance under test is missing one.

## Run E2E on a throwaway instance

Run E2E against an instance you start for the run, never against one an operator uses (#1895). It needs its own port, its own data folder and a known admin password.

- Pick a free port (`lsof -ti tcp:<port>` prints nothing) and a fresh data folder from `mktemp -d`. Never point it at `./data` or a live `FAST_STORAGE`.
- Build first: `npm run build`. The instance runs `dist/`.
- Seed the folder: `FAST_STORAGE=<dir> SLOW_STORAGE=<dir> PUID=$(id -u) PGID=$(id -g) npx tsx scripts/seed-e2e-test-data.ts`.
- Start it with `node dist/src/app.js`, the way CI does, and stop it by its own PID. `./server.sh` is for long-running pm2-managed instances; from a worktree it can reach another instance by pm2 name or by path — the reasons are in the [bootstrap guide](bootstrap-developer-guide.md#multiple-instances-on-one-machine). Set `FAST_STORAGE`, `SLOW_STORAGE`, `PORT`, `NGDPBASE_BASE_URL=http://localhost:<port>`, `NGDPBASE_SYSTEM_USER`, `PUID` and `PGID`.
- Run `PORT=<port> npm run test:e2e`, then stop the server and remove the folder.

The admin password has one source:

- The engine gives the bootstrap `admin` account `ngdpbase.user.security.defaultpassword`, which ships as `admin123`. It does not read `NGDPBASE_ADMIN_PASSWORD` unless that key points at it.
- Seed with `NGDPBASE_ADMIN_PASSWORD` unset (what CI does): the admin is on `admin123`, and the suite signs in with `admin123`.
- Seed with `NGDPBASE_ADMIN_PASSWORD` set: the seed points the key at `"$NGDPBASE_ADMIN_PASSWORD"`. Start the server with the same variable (an unset ref stops the boot), and run the suite with it set too.
- `E2E_ADMIN_PASS` overrides what the suite signs in with. `playwright.config.ts` resolves it from the shell, then `.env`, then `NGDPBASE_ADMIN_PASSWORD`, then `admin123`. Set it only when the admin's password is none of these.
- A wrong password fails `auth.setup.ts` with the reason and the likely cause, and the rest of the run does not start. Fix the password; do not chase the specs.

## How you know you are done

- `npm test`
- `npm run lint`
- E2E (`npm run test:e2e`) only when the change touches `views/`, `public/`, `src/plugins/`, `addons/`, or `tests/e2e/`

## See also

- [CODE_STANDARDS.md](../../CODE_STANDARDS.md) testing section
- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- `vitest.config.ts`, `vitest.setup.ts`

## Known gaps

- [#1093](https://github.com/jwilleke/ngdpbase/issues/1093)
- [#1092](https://github.com/jwilleke/ngdpbase/issues/1092)
- [#1895](https://github.com/jwilleke/ngdpbase/issues/1895): `playwright.config.ts` reads only the checkout's `.env`, not `<FAST_STORAGE>/.env`. A password kept only in the instance's own `.env` must be exported for the run.
