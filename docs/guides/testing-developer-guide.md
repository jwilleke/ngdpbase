---
name: Testing developer guide
description: Non-negotiable rules for tests in this repo — teardown, proving a test can fail, reproducing the way the suite runs
dateModified: 2026-10-30
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
- A test makes its accounts through `UserManager.createUser` or the admin screens, never by writing them into `users.json`: an account written by hand has no identity record until the next start-up repairs it ([#2037](https://github.com/jwilleke/ngdpbase/issues/2037)). The one exception is a test of that repair.
- A test that spawns a process signals the process it means to stop, never a wrapper: spawn TypeScript as `process.execPath` with `--import tsx`, not through the `tsx` CLI or `npx`, which run the real node as their own child, so a SIGKILL to them orphans it. The test tracks every child and kills any still alive in `afterEach`, and a long-lived fixture exits when its parent goes (stdin closes) ([#2152](https://github.com/jwilleke/ngdpbase/issues/2152)).
- An E2E request sent with `maxRedirects: 0` goes to `instanceOrigin(page)` (`tests/e2e/fixtures/helpers.ts`), never to a bare `/path`. jimstest's base URL is https, so it answers plain-http requests with 308, and a spec written against an http throwaway instance then fails the release gate there.

## How to add a test

- 1 Co-locate under `__tests__/` next to the module.
- 2 Mock file I/O. Do not point at the live `FAST_STORAGE` tree.
- 3 For a security or audit door, sabotage once (skip the registration, rebuild the subject, catch-and-continue a `refuse` event) and watch the test go red.

## Pages a test creates are marked `test-artifact`

Every page an E2E test, probe or script creates on a real instance carries the system keyword `test-artifact` ("made by a test, safe to delete"), so a leftover from a failed teardown can be found by keyword instead of looking like content (#1355).

- E2E: call `markTestArtifact(page | request, title)` from `tests/e2e/fixtures/helpers.ts` right after the page is created — after the test's own save, not between create and save (the mark is a save, and the open editor would then hit the stale-edit conflict). `createPage()` does it for you.
- System keywords are server-owned, so the mark goes through the admin-only `POST /api/page/:identifier/test-artifact`; no form or ingest body can set it.
- Scripts and probes that save through `PageManager` or the provider put `system-keywords: ['test-artifact']` in the metadata they save.
- Unit tests never write to a live instance (see Standing rules), so they have nothing to mark.
- `test-artifact` is not `test-page`: `test-page` marks the permanent, shipped test pages below.

A spec that makes a page also deletes it ([#2008](https://github.com/jwilleke/ngdpbase/issues/2008)):

- Mark every page the spec makes, however it was made: the create form, `/save`, an import (`admin-import.spec.ts` marks each page it imports), a page the server made for an account the spec created.
- Delete it in `afterAll` with `deletePage` / `deletePages` from `tests/e2e/fixtures/helpers.ts`, which fail loudly and purge what they deleted from the trash. Do not swallow the failure with `.catch(() => undefined)`: that is how `E2E Import …` pages stayed behind.
- Accounts a spec creates are test accounts (`isTest: 'true'` on `POST /admin/users`, the value the form's checkbox sends; `'on'` reads as unchecked, which is why no E2E account was a test account before #2008). A test account's profile page is stamped `test-artifact` when the account is created and deleted with the account. An account the spec cannot flag, such as one made through `/register`, keeps its profile page when deleted (as every ordinary account does), so the spec marks that page itself and deletes it after the account.
- Private vault pages are not in the shared index, so neither the sweep below nor the leftover check sees them; a spec that makes one deletes it itself (`vault-share.spec.ts`).

At the end of every run, `tests/e2e/global-teardown.ts` (Playwright `globalTeardown`) deletes every page carrying `test-artifact`:

- Through the site's API as the run's admin session (`tests/e2e/.auth/user.json`): `POST /api/admin/test-artifacts/sweep`, gated by `admin-system`, which calls `PageManager.deleteTestArtifacts`. Each page is recorded as `page-delete` and soft-deleted through the page door; the teardown then purges those uuids, and only those, from the trash. Never a file, never a page without the keyword.
- It logs each page it deleted. A refused sweep, or a page it could not delete, fails the run.
- Without a saved admin session (setup did not run) it skips with a warning.

Leftovers from before #2008, most without the keyword, are cleared once per instance by `scripts/sweep-test-pages.ts`, run by the operator against a running site:

- `npm run sweep:test-pages -- --base-url <url>` lists them (dry run, the default); add `--apply` to delete.
- It matches titles starting `Profile: e2e-` (only when no account, active or not, has that username or display name), `E2E Import` (then a space) and `NGDPBASE-test-`.
- It signs in with an admin session from a Playwright storage state (default `tests/e2e/.auth/user.json`, written by `npx playwright test --project=setup` against that site), or a Cookie header in `--cookie` / `NGDPBASE_SWEEP_COOKIE`. A password session is not enough where admin needs a passkey.
- Deletes go through `DELETE /api/page/:identifier`: recorded, and soft, so each page stays in the trash for the retention window.

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
- The forms specs skip unless `ngdpbase.addons.forms.enabled` is true in the folder's `config/app-custom-config.json`. `forms-shipped.spec.ts` also needs the fixture add-on in `tests/e2e/fixtures/addons/shipped-forms-e2e`; its header names the keys that load it.
- Some specs run only when asked, because they need the instance set up for them: `admin-backup.spec.ts` stages and cancels restores only with `E2E_RESTORE=1`, and `page-notes-off.spec.ts` checks a system-category only when `E2E_NOTES_OFF_CATEGORY` names one with `comments` and `footnotes` false in the folder's config. `share-assets.spec.ts` makes and opens a link to an encrypted vault only when `E2E_SEALED_VAULT` names the admin's default vault and the folder's config makes it encrypted (`"encrypt": true` on its system-category, `general` for `default`); with `E2E_SHARE_PUBLIC_BASE_URL` set to the folder's `ngdpbase.share.public-base-url` it also checks the link starts with it. `consent.spec.ts` raises the terms version only with `E2E_CONSENT_BUMP=1` (CI sets it), since that asks every account on the instance to accept again. `reauth-return.spec.ts` waits for a sign-in to go stale only with `E2E_STEP_UP_WINDOW=1` (CI sets it): it shortens the site's step-up window while it runs, in its own project, and puts it back; without it, only its checks that need no stale sign-in run. `recovery-words.spec.ts` runs only when `E2E_SEALED_VAULT` names a system-category vault with `encrypt: true` in the folder's config, and raises the recovery-words page's version only with `E2E_CONSENT_BUMP=1`. `shared-folders-words.spec.ts` makes the site's shared-folders recovery words (once per site: it downloads, prints and types them back, which makes `/shared/default` and `/shared/executive`, then makes a new set, signing in again with `E2E_ADMIN_PASS` when the step-up asks) only with `E2E_SHARED_FOLDERS_WORDS=1`, and raises their page's version only with `E2E_CONSENT_BUMP=1` too. `shared-folders.spec.ts` makes the recovery words if none exist (which makes `/shared/default` and `/shared/executive`), a closed folder (folders cannot be deleted yet; the admin reads, adds, edits and deletes in it, an executive account reads it but may not file in it, and the test account gets a 404), and two test accounts, one holding the executive role, only with `E2E_SHARED_FOLDERS=1`. `admin-addons-update.spec.ts` checks an installed add-on's row and the "npm couldn't be reached" answer only when `E2E_ADDON_UPDATE_SLUG` names an add-on the instance has installed (in `ngdpbase.addons.install` and `<data>/addons/addons-lock.json`) with `ngdpbase.managers.addons-manager.install.registry` set to a host that cannot be reached; its CSRF and refusal checks always run.
- A sign-in by an account that has not accepted the site's terms lands on `/consent` ([#1603](https://github.com/jwilleke/ngdpbase/issues/1603)). A spec that signs in an account of its own uses `signInWithPassword` from `tests/e2e/fixtures/helpers.ts`, which accepts when asked; `auth.setup.ts` does the same for the admin.
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

## The image smoke test installs an add-on from config

`.github/workflows/docker-build.yml` starts the built image and checks it before anything is published ([#2101](https://github.com/jwilleke/ngdpbase/issues/2101)). The step "Smoke test — an add-on installed from config" is the check for the domain-site model ([domain-site.md](../platform/deployment/domain-site.md)): a data volume whose `app-custom-config.json` names `@jwilleke/geohazardwatch-addon` in `ngdpbase.addons.install` (range `^1`, repository `github.com/jwilleke/geohazardwatch`) and enables it.

- First start: it must log `Installed add-on geohazardwatch@…` and `Add-on loaded: geohazardwatch`, answer readiness and `/login`, and leave `addons/addons-lock.json` with the package, a version, a `sha512-` integrity and provenance naming the repository. This one uses the real registry, so it needs npm to be reachable from the runner.
- Second start: the same volume, with `--network none`, so any npm request fails. It must log `verified against the lock file`, never `Installed add-on` for an install, load the add-on, and leave the lock byte for byte unchanged.

The local release smoke (`/semver` Step 4a) runs the same step by name, by extracting it from the workflow. The older packaged-model step (the `-devtools` image) stays until [#2102](https://github.com/jwilleke/ngdpbase/issues/2102) decides whether it is retired.

## See also

- [CODE_STANDARDS.md](../../CODE_STANDARDS.md) testing section
- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- `vitest.config.ts`, `vitest.setup.ts`

## Known gaps

- [#1092](https://github.com/jwilleke/ngdpbase/issues/1092)
- [#1895](https://github.com/jwilleke/ngdpbase/issues/1895): `playwright.config.ts` reads only the checkout's `.env`, not `<FAST_STORAGE>/.env`. A password kept only in the instance's own `.env` must be exported for the run.
