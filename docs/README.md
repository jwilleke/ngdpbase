---
name: Documentation
description: Entry point for developer documentation in this repository
dateModified: 2026-09-06
category: standards
---

# Documentation

`docs/` is developer documentation for this repository. It is GitHub markdown, linted by `.markdownlint-cli2.jsonc`.

End-user and in-app pages are not here. They live in `required-pages/` and addon `pages/`, under [proper-documentation-pages.md](proper-documentation-pages.md).

## Start here

| If you need | Open |
| --- | --- |
| How to change this codebase | [guides/](guides/README.md) |
| Standing security and audit law | [security-posture.md](security-posture.md), [audit-posture.md](audit-posture.md) |
| Whether a module already exists | [Developer-Documentation.md](Developer-Documentation.md) |
| How the core is put together | [guiding-framework.md](guiding-framework.md) |
| Conventions for `docs/` itself | [DOCUMENTATION-STANDARDS.md](DOCUMENTATION-STANDARDS.md) |

## Layout

- `guides/` — area developer guides (the door)
- `managers/`, `plugins/`, `providers/` — one file per module
- `architecture/` — shipped cross-cuts
- `platform/` — deploy and platform overview
- `testing/` — extra test material; the door is the testing developer guide
- `planning/` — exploration; where it disagrees with a posture file, the posture file wins
- `admin/` — operator how-tos in git, not in-app pages

Root files `ARCHITECTURE.md`, `CODE_STANDARDS.md`, `CONTRIBUTING.md`, and `SECURITY.md` sit beside this tree.
