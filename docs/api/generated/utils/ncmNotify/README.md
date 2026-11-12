[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / utils/ncmNotify

# utils/ncmNotify

NCM conversion → /admin/notifications (#728 Phase 2 Slice 5d)

Operator decision 2026-05-17: on __non-preview__ NCM conversion paths
(bulk import, #685 ingestion, MCP) — where no human sees the preview — a
summary of the conversion warnings is pushed to the existing
`/admin/notifications` centre via `NotificationManager` (the same
subsystem `MediaManager` already feeds), so admins get an actionable
per-event alert. Distinct from #738 (aggregate metrics/trend).

Engine-coupled glue lives here (not in `src/converters/ncm/`, which is
kept pure). Best-effort and non-blocking — notification failure must never
fail a conversion.

## Functions

- [notifyNcmConversion](functions/notifyNcmConversion.md)
