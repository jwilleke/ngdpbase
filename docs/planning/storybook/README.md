# Storybook generator — reference implementation

Working copy of `2026-trip-west/storybook/generate.py` (operator volume:
`/Volumes/mjs/travel/2026-travel/2026-trip-west/storybook/`), copied here
2026-07-21 so the #872 generator work has the proven seed in-repo.

- Trip-specific: absolute paths, dates, and state list are 2026-Trip-West
  values — parameterize when #872 productizes it.
- Includes the #898 fix: content-keyed route-PNG cache (`route-cache/`
  beside the script) — unchanged route data reuses prior bytes, so the
  wiki's content-hash dedup makes re-imports orphan-free.
- Companion doc: ../storybook.md (design, data sources, layout decisions).
