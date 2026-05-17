/**
 * NCM conversion → /admin/notifications (#728 Phase 2 Slice 5d)
 *
 * Operator decision 2026-05-17: on **non-preview** NCM conversion paths
 * (bulk import, #685 ingestion, MCP) — where no human sees the preview — a
 * summary of the conversion warnings is pushed to the existing
 * `/admin/notifications` centre via `NotificationManager` (the same
 * subsystem `MediaManager` already feeds), so admins get an actionable
 * per-event alert. Distinct from #738 (aggregate metrics/trend).
 *
 * Engine-coupled glue lives here (not in `src/converters/ncm/`, which is
 * kept pure). Best-effort and non-blocking — notification failure must never
 * fail a conversion.
 *
 * @module utils/ncmNotify
 */

interface EngineLike {
  getManager(name: string): unknown;
}

/**
 * Push an admin notification summarising NCM conversion warnings.
 * No-op when there are no warnings or NotificationManager is unavailable.
 *
 * @param engine   Wiki engine (structural — just needs getManager)
 * @param source   Human label for the path, e.g. "Import jspwiki", "MCP create_page"
 * @param target   The page/file that was converted
 * @param warnings Flattened `"kind: detail"` strings
 */
export function notifyNcmConversion(
  engine: EngineLike,
  source: string,
  target: string,
  warnings: string[]
): void {
  if (!warnings.length) return;
  const nm = engine.getManager('NotificationManager') as
    { addNotification?: (n: unknown) => Promise<string> } | null;
  if (!nm?.addNotification) return;

  const head = warnings.slice(0, 5).join('; ');
  const more = warnings.length > 5 ? ` (+${warnings.length - 5} more)` : '';
  void nm.addNotification({
    type: 'system',
    level: 'warning',
    title: `NCM conversion: ${source}`,
    message: `${target}: ${warnings.length} warning(s) — ${head}${more}`
  }).catch(() => { /* best-effort; never fail the conversion */ });
}
