---
name: Testing developer guide
description: Non-negotiable rules for tests in this repo — teardown, proving a test can fail, reproducing the way the suite runs
dateModified: 2026-09-06
category: guides
---

# Testing developer guide

Rules for tests. TDD: write the failing test first, then the code. Unit tests are Vitest with mocked file I/O (`npm test`). E2E is Playwright against Chromium.

## Standing rules

- Test teardown must never wipe `./data/` wholesale. Remove only the subdirectories the test created. Prefer `mkdtemp` under the OS temp dir.
- A regression test written with a fix must be run once with the fix reverted and observed to go red.
- Reproduce a failure the way the suite runs it. Do not skip fixture reset, reuse state, or run one spec alone when the suite runs it in a batch.
- Do not invent a system principal to satisfy a mandatory context. Use `jobContextFromSystem(reason)` or the request subject you were given.

## How to add a test

1. Co-locate under `__tests__/` next to the module.
2. Mock file I/O. Do not point at the live `FAST_STORAGE` tree.
3. For a security or audit door, sabotage once (skip the registration, rebuild the subject, catch-and-continue a `refuse` event) and watch the test go red.

## Test pages (rendering shapes)

A rendering or conversion fix adds its content shape to a test page (#1355). Test pages are required pages with `system-keywords: [test-page]`, `author: system`, `system-category: system` and `audience: [admin]`: they ship to every install, only admins can open them, and `src/parsers/__tests__/TestPages.test.ts` renders each through `MarkupParser` with the real `page` markdown profile.

- Add a section to the page that fits (or a new `Test Page: …` page), then its expectations to `EXPECTATIONS` in the test. A test page with no expectations fails the suite.
- A shape that is still broken gets `knownBug: <issue>`. It runs as `test.fails`: green today, red once the bug is fixed — remove the marker then.
- Existing instances get a new or changed page through Admin → Required Pages Sync; `tests/e2e/test-pages.spec.ts` fails when the instance under test is missing one.

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
