/**
 * pageVersionToken — optimistic concurrency for page saves (#1061).
 *
 * Two people editing one page used to end with the second save overwriting the
 * first. Nothing carried the version an edit was based on, so the server could
 * not tell a normal save from one built on stale content. The losing edit was
 * recoverable — `VersioningFileProvider` snapshots before every write — but
 * invisible: the person who lost it was told the save succeeded.
 *
 * ## Why `lastModified`
 *
 * Every save writes `lastModified` into the frontmatter, so it already exists on
 * every page, needs no new storage, and survives a restart. It is compared as an
 * opaque token, never as a time: the question is only "is this the same value I
 * was shown", so clock skew and ordering never enter into it.
 *
 * The one property it must have is that it changes on every save. Millisecond
 * ISO strings give that in practice; two saves inside the same millisecond would
 * collide, which is why {@link isStaleSave} is documented as best-effort rather
 * than a lock. It narrows a wide-open race to a sub-millisecond one.
 *
 * ## Why normalisation is not cosmetic
 *
 * Frontmatter is YAML. `lastModified: '2026-04-21T15:14:34.355Z'` parses to a
 * string, but the same value written unquoted parses to a `Date`. Comparing a
 * `Date` to the string a form posted back fails for every page written that way,
 * and it fails in the safe-looking direction: a false conflict on a save that
 * should have gone through, which reads to the user as the editor being broken.
 */

/** Anything with the metadata fields this module reads. */
export interface VersionedMetadataLike {
  lastModified?: unknown;
}

/**
 * The comparison token for a page's current state, or null when the page has
 * none — a page never saved through the normal path, or one whose frontmatter
 * predates `lastModified`.
 *
 * Null means "cannot be compared", and callers must treat that as *allow*. A
 * missing token is not evidence of a conflict, and refusing saves on pages the
 * check cannot reason about would break editing for the oldest content in the
 * wiki.
 */
export function versionTokenOf(metadata: VersionedMetadataLike | null | undefined): string | null {
  const raw = metadata?.lastModified;
  if (raw instanceof Date) {
    // YAML parsed an unquoted timestamp. Same instant, different type.
    return isNaN(raw.getTime()) ? null : raw.toISOString();
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    // Round-trip through Date so a quoted and an unquoted write of the same
    // instant produce the same token. Anything unparseable is compared as-is
    // rather than discarded — an opaque token still detects a change.
    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return new Date(raw).toISOString();
  }
  return null;
}

/**
 * Was this save built on a version of the page that has since moved?
 *
 * Best-effort by design. It returns false — allow the save — whenever it cannot
 * be sure, and each of those cases is a deliberate choice rather than an
 * oversight:
 *
 * - **The client sent no base token.** API callers, older cached forms, and any
 *   surface that has not been taught to send one. Refusing them would turn a
 *   data-loss fix into an outage for callers that never had the problem
 *   reported against them. The trade is stated plainly: a client that does not
 *   participate is not protected.
 * - **The page has no current token.** Nothing to compare; see
 *   {@link versionTokenOf}.
 * - **The page does not exist yet.** A create cannot conflict with itself.
 *
 * @param submittedBase - token the editor was handed when it loaded the page
 * @param currentToken  - token of the page as it stands on disk right now
 */
export function isStaleSave(
  submittedBase: string | null | undefined,
  currentToken: string | null | undefined
): boolean {
  if (!submittedBase || !currentToken) return false;
  return normaliseSubmitted(submittedBase) !== currentToken;
}

/**
 * Normalise a token that came back from a form.
 *
 * The value makes a round trip through an HTML attribute and a URL-encoded body,
 * so it can return with surrounding whitespace. It is otherwise compared exactly
 * as issued.
 */
function normaliseSubmitted(token: string): string {
  const trimmed = token.trim();
  const parsed = new Date(trimmed);
  return isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
}
