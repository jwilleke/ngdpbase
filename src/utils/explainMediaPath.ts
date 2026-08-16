/**
 * explainMediaPath — why is (or isn't) this file in the media index? (#848 part 3)
 *
 * #814 reported media "often not discovered". Triage found zero indexing bugs:
 * every missing file was correctly skipped, by one of several rules, none of
 * which are visible. Part 1 surfaced alternate-format siblings on the item page.
 * This answers the question for any single path, including the reasons that
 * leave no trace at all.
 *
 * ## Why this is a pure function
 *
 * The scanner decides the same things inline, spread across `collectFilePaths`
 * and `processFile`, where the answers are `continue` statements. That is fine
 * for scanning and useless for explaining. Pulling the decision out means one
 * classifier both the probe and a future skipped-file report (#1056) can share,
 * rather than a third copy of rules that already exist in two places.
 *
 * ## Order matters
 *
 * Rules are evaluated in the order the scanner applies them, so the answer is
 * the reason the file was ACTUALLY skipped rather than the first rule that
 * happens to match. A dotfile with an unsupported extension is reported as a
 * dotfile, because that is the test the scanner reaches first.
 */
import path from 'path';

/** Why a path is, or is not, in the index. */
export type MediaPathVerdict =
  /** Present in the index under this exact path. */
  | 'indexed'
  /** Folded into another item by the #515 alternate-format dedup. */
  | 'alternate'
  /** Outside every configured scan folder. */
  | 'not-in-scanned-folder'
  /** Name begins with a dot. */
  | 'dotfile'
  /** Extension is not in the configured set. */
  | 'extension'
  /** A path segment matches `ignoreDirs`. */
  | 'ignore-dir'
  /** Deeper than `maxDepth` below its scan root. */
  | 'max-depth'
  /** Matched a `.ngdpbaseignore` pattern — the file's own or an ancestor's. */
  | 'ignore-pattern'
  /** Carries the `ngdpbaseignore` EXIF/XMP keyword. */
  | 'ignore-keyword'
  /** Eligible, but not in the index — most likely never scanned. */
  | 'eligible-not-indexed';

export interface MediaPathExplanation {
  verdict: MediaPathVerdict;
  /** One sentence an operator can act on. */
  detail: string;
  /** Index id, when the path resolves to an item. */
  itemId?: string;
  /** For `alternate`, the primary item this file was folded into. */
  primaryPath?: string;
  /** For `ignore-dir` / `ignore-pattern`, what actually matched. */
  matched?: string;
}

/** What the classifier needs to know. Mirrors FileSystemMediaProviderConfig. */
export interface MediaPathRules {
  /** Absolute scan roots. */
  folders: string[];
  /** Directory names skipped anywhere in the tree. */
  ignoreDirs: string[];
  /** 0 = unlimited. Depth is counted below the scan root. */
  maxDepth: number;
  /** Lowercase, no leading dot. */
  extensions: Set<string>;
}

/** Index facts, resolved by the caller so this stays free of I/O. */
export interface MediaPathIndexFacts {
  /** Item id when this exact path is indexed. */
  indexedId?: string;
  /** Set when the path is an alternate folded into another item. */
  alternateOf?: { id: string; filePath: string };
  /** `.ngdpbaseignore` pattern that matched, if the caller found one. */
  ignorePatternMatch?: string;
  /** True when the file carries the `ngdpbaseignore` EXIF/XMP keyword. */
  hasIgnoreKeyword?: boolean;
}

/** Longest configured folder containing `target`, or null. */
export function scanRootFor(target: string, folders: string[]): string | null {
  const norm = path.resolve(target);
  let best: string | null = null;
  for (const folder of folders ?? []) {
    if (!folder) continue;
    const root = path.resolve(folder);
    // Compare on a trailing separator so `/media/photos-old` is not treated as
    // living inside `/media/photos`.
    if (norm === root || norm.startsWith(root.endsWith(path.sep) ? root : root + path.sep)) {
      if (!best || root.length > best.length) best = root;
    }
  }
  return best;
}

/**
 * Classify one absolute path.
 *
 * Evaluated in scanner order. The caller supplies index facts and any
 * `.ngdpbaseignore` match, because those need I/O and this deliberately does
 * none — which is what makes every branch testable without a filesystem.
 */
export function explainMediaPath(
  target: string,
  rules: MediaPathRules,
  facts: MediaPathIndexFacts = {}
): MediaPathExplanation {
  const abs = path.resolve(target);
  const base = path.basename(abs);

  // Indexed and alternate come first: they are states, not skip rules, and an
  // operator asking "where is my file" is best served by "it is here" before
  // any explanation of rules it also happens to satisfy.
  if (facts.indexedId) {
    return { verdict: 'indexed', itemId: facts.indexedId, detail: 'Indexed and visible in the Media Manager.' };
  }
  if (facts.alternateOf) {
    return {
      verdict: 'alternate',
      itemId: facts.alternateOf.id,
      primaryPath: facts.alternateOf.filePath,
      detail: `Same photo as ${path.basename(facts.alternateOf.filePath)}, shown once under that entry rather than twice.`
    };
  }

  const root = scanRootFor(abs, rules.folders);
  if (!root) {
    return {
      verdict: 'not-in-scanned-folder',
      detail: 'Outside every configured media folder, so the scanner never looks here.'
    };
  }

  // Scanner order: dotfile, then extension. A dotfile with an unsupported
  // extension is a dotfile, because that is the test reached first.
  if (base.startsWith('.')) {
    return { verdict: 'dotfile', detail: 'Names beginning with a dot are skipped.' };
  }

  const ext = path.extname(base).slice(1).toLowerCase();
  if (!rules.extensions?.has(ext)) {
    return {
      verdict: 'extension',
      matched: ext || '(none)',
      detail: ext
        ? `Extension .${ext} is not in the configured media extensions.`
        : 'No file extension, so it cannot be matched against the configured media extensions.'
    };
  }

  // Directory rules apply to any segment between the scan root and the file.
  const segments = path.relative(root, path.dirname(abs)).split(path.sep).filter(Boolean);
  const ignoredSegment = segments.find((s) => (rules.ignoreDirs ?? []).includes(s));
  if (ignoredSegment) {
    return {
      verdict: 'ignore-dir',
      matched: ignoredSegment,
      detail: `Inside "${ignoredSegment}", which is in the ignored-directories list.`
    };
  }

  // Depth is counted the way the scanner counts it: the root itself is depth 0,
  // and the guard fires on the directory being descended into.
  if (rules.maxDepth > 0 && segments.length > rules.maxDepth) {
    return {
      verdict: 'max-depth',
      matched: String(segments.length),
      detail: `${segments.length} directories below the scan root, past the maximum depth of ${rules.maxDepth}.`
    };
  }

  if (facts.ignorePatternMatch) {
    return {
      verdict: 'ignore-pattern',
      matched: facts.ignorePatternMatch,
      detail: `Matched "${facts.ignorePatternMatch}" in a .ngdpbaseignore file.`
    };
  }

  if (facts.hasIgnoreKeyword) {
    return {
      verdict: 'ignore-keyword',
      detail: 'Carries the ngdpbaseignore keyword in its EXIF/XMP metadata, so it is deliberately excluded.'
    };
  }

  return {
    verdict: 'eligible-not-indexed',
    detail: 'Eligible for indexing but not in the index — most likely not scanned yet. Run a scan.'
  };
}
