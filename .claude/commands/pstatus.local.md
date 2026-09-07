# /pstatus — repo-specific additions

The kit file `.claude/commands/pstatus.md` is overwritten wholesale on every `install-kit.sh` run.
This file is never written, read, or deleted by the kit. Read it as part of `/pstatus` and treat
its contents as part of that command.

## The 🏛 Epics band

`TODO.md` carries one extra band, __above `🔴 P0`__:

- `🏛 Epics` — open issues labeled `epic`

An epic is a container for work tracked in its sub-issues. It is not a task anyone picks up, so
ranking it beside real tasks distorts the queue in both directions: a P1 epic buries P1 bugs under
something nobody can start, and a P2 epic hides an initiative that is actually the current
direction. Giving epics their own band lets an epic be prominent without competing for a priority
slot.

Rules:

- An issue labeled `epic` lands in `🏛 Epics` and __nowhere else__, whatever priority label it
  carries. The priority label still means something — it orders the epics within the band, most
  urgent first — it just no longer places the epic in a priority band.
- `in-review` still wins over everything, epics included. An epic awaiting the operator's decision
  belongs in `🔵 In review` where that decision is visible.
- Sub-issues are __not__ nested under their epic. They keep their own priority bands, because that
  is where the work actually gets picked from. The epic is the "why", the bands are the "what next".
- An epic with no placement label is not flagged `needs-triage`. The `epic` label is itself a
  placement.

Print each epic with its open sub-issue count so the band shows progress rather than just titles:

```markdown
## 🏛 Epics

- [#1299](https://github.com/jwilleke/ngdpbase/issues/1299) — [EPIC] One display vocabulary ... (6 of 8 open)
```

## Why this is here and not upstream

The band itself is generic and belongs in
[mjs-project-template](https://github.com/jwilleke/mjs-project-template) so every repo gets it. It
lives here until that lands, because putting it in the kit file directly would be destroyed at the
next sync.
