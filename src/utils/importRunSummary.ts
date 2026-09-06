/**
 * Per-run summary persistence for NCM / import conversion outcomes (#738).
 *
 * Writes one JSON file per import run under FAST_STORAGE (configurable via
 * `ngdpbase.import.runs-dir`, default `./data/import-runs`). Each file's
 * name is the ISO timestamp of `startedAt`, sanitised for filesystem use.
 *
 * The trend view (admin-import.ejs) reads the last N summaries via
 * listRecentRuns() to surface dominant failure causes across runs.
 *
 * Append-only by design. Retention is operator-managed for now — the
 * directory can grow indefinitely; a future cleanup job (or admin button)
 * can prune. Listed as a follow-up in the #738 acceptance criteria.
 */

import fse from 'fs-extra';
import path from 'path';

/** Compact per-run record persisted to disk. */
export interface ImportRunSummary {
  /** Stable id; same as the filename without `.json`. */
  runId: string;
  /** ISO-8601 timestamp of when the run started. */
  startedAt: string;
  /** ISO-8601 timestamp of when the run finished (may equal startedAt for trivial runs). */
  finishedAt: string;
  /** What kind of import surfaced this run (`paste`, `url`, `file`, `ingest:<sourceId>`). */
  importType: string;
  /**
   * Who initiated the run — `ImportOptions.actorContext.username` (#1236): the
   * request's subject for a manual import, the system principal for a job.
   */
  actor: string;
  /**
   * True when the run was a job with no person behind it (a JobContext whose
   * origin is boot, schedule or operator) — lets the trend view distinguish
   * "alice triggered an import" from "scheduled feed ingested overnight".
   * False for a request, or a request-origin job.
   */
  isSystem?: boolean;
  /** Where the run came from: `request`, `boot`, `schedule` or `operator` (#1236). Absent on records written before it. */
  origin?: string;
  /** Total items the run attempted. */
  total: number;
  /** Items successfully converted to pages. */
  converted: number;
  /** Items intentionally skipped (e.g. duplicates). */
  skipped: number;
  /** Items that failed to convert. */
  failed: number;
  /**
   * Counts of ConversionWarning.kind values aggregated across all items in the run.
   * Keys are flat (no colon-subkinds today) per the #738 design decision.
   */
  kindCounts: Record<string, number>;
}

/** Sanitise an ISO timestamp into a filename-safe string. */
function timestampToFilename(iso: string): string {
  // Replace colons (Windows + macOS safety) and drop milliseconds for compactness.
  return iso.replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
}

/** Aggregate a flat list of ConversionWarning-like objects into kindCounts. */
export function tallyWarnings(
  warnings: Array<{ kind: string }> | undefined
): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!warnings) return counts;
  for (const w of warnings) {
    if (typeof w?.kind === 'string' && w.kind) {
      counts[w.kind] = (counts[w.kind] ?? 0) + 1;
    }
  }
  return counts;
}

/** Write a single per-run summary. Idempotent for same runId. Best-effort — errors logged, never thrown. */
export async function writeRunSummary(
  runsDir: string,
  summary: ImportRunSummary
): Promise<void> {
  try {
    await fse.ensureDir(runsDir);
    const filename = `${timestampToFilename(summary.startedAt)}.json`;
    const filePath = path.join(runsDir, filename);
    // Atomic write via tmp + rename so a crash mid-write doesn't leave a partial file.
    const tmp = `${filePath}.tmp`;
    await fse.writeJson(tmp, summary, { spaces: 2 });
    await fse.rename(tmp, filePath);
  } catch {
    // Persistence is observability — failures must not affect the import result.
    // Caller chose to fire-and-forget; no rethrow.
  }
}

/**
 * Return the most-recent N run summaries, newest first. Filenames are ISO
 * timestamps so lexicographic sort is chronological. Missing/empty dir
 * returns []. Malformed individual files are skipped, not fatal.
 */
export async function listRecentRuns(
  runsDir: string,
  limit = 10
): Promise<ImportRunSummary[]> {
  try {
    if (!await fse.pathExists(runsDir)) return [];
    const entries = await fse.readdir(runsDir);
    const jsonFiles = entries
      .filter(f => f.endsWith('.json') && !f.endsWith('.json.tmp'))
      .sort()
      .reverse()
      .slice(0, limit);
    const out: ImportRunSummary[] = [];
    for (const name of jsonFiles) {
      try {
        const raw = await fse.readJson(path.join(runsDir, name)) as unknown;
        const cand = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : null;
        if (cand && typeof cand.runId === 'string') {
          out.push(cand as unknown as ImportRunSummary);
        }
      } catch {
        // Skip malformed files
      }
    }
    return out;
  } catch {
    return [];
  }
}
