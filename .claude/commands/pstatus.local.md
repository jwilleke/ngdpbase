# /pstatus — repo-specific additions

The kit file `.claude/commands/pstatus.md` is overwritten wholesale on every `install-kit.sh` run.
This file is never written, read, or deleted by the kit. Read it as part of `/pstatus` and treat
its contents as part of that command.

## Epics show their open sub-issue count

The Epics band, its position and its placement rules belong to the kit (`pstatus.md`, since
v1.13.0). This repo adds one thing: print each epic with its open sub-issue count, from the issue's
native `sub_issues_summary`, so the band shows progress rather than just titles. An epic with no
native sub-issues says so.

```markdown
## 🟣 Epics

- [#1299](https://github.com/jwilleke/ngdpbase/issues/1299) — [EPIC] One display vocabulary ... (6 of 8 open)
- [#1311](https://github.com/jwilleke/ngdpbase/issues/1311) — [EPIC] Handle Metadata for Audio (no sub-issues linked)
```

Sub-issues are not nested under their epic: they keep their own priority bands, where the work is
picked from.
