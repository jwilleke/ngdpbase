/**
 * The audit event vocabulary (#1115), now read from configuration (#1200).
 *
 * Before #1115 the vocabulary existed in three places that disagreed:
 * `docs/managers/AuditManager.md` listed 19 event types of which 14 were never
 * emitted, the emitters used two incompatible naming conventions side by side,
 * and the admin audit page offered a filter dropdown of four options, three of
 * which matched zero records in a 2,687-record log.
 *
 * #1115 made this file the one list. #1200 moved the list into
 * `ngdpbase.audit.events` in configuration, where the tier already had to live,
 * so that the names, the tiers and the switches are one map with one owner.
 * This file keeps the read-side helpers that history needs.
 *
 * The convention is `{target}.{action}`, mirroring the permission registry's
 * `{target}-{action}`. Dotted, so a prefix means something: `page.` is
 * everything that happened to pages, `token.` is everything a credential did.
 * The bare snake_case forms — `access_decision`, `policy_evaluation`,
 * `authentication`, `security_event`, `share_access`, `share_create` — did not
 * support that and are retired. (#1201 replaces the dot with a hyphen and
 * drops the legacy mapping below.)
 */

export { auditEventTypes, auditEventDeclarations, type AuditEventDeclaration } from './auditRegistry.js';

/**
 * Retired names, and the canonical name a record written under one maps to.
 *
 * A function rather than a table where the answer depends on the record: a
 * legacy `authentication` row is a success, a failure or a logout, and only its
 * `result` says which.
 */
const LEGACY_RESOLVERS: Record<string, (record: { result?: unknown }) => string> = {
  security_event: () => 'security.event',
  share_access: () => 'share.access',
  share_create: () => 'share.create',
  share_revoke: () => 'share.revoke',
  policy_evaluation: () => 'policy.evaluate',
  access_decision: (r) => (r.result === 'deny' ? 'authorization.deny' : 'authorization.allow'),
  authentication: (r) =>
    r.result === 'failure' ? 'authentication.failed'
      : r.result === 'logout' ? 'authentication.logout'
        : 'authentication.success'
};

/** Retired names, for documentation and for widening a filter over history. */
export const LEGACY_EVENT_TYPES = Object.keys(LEGACY_RESOLVERS);

/**
 * The canonical event type for a record, mapping a retired name forward.
 *
 * Returns the record's own eventType unchanged when it is already canonical or
 * simply unknown — an unrecognised type is surfaced as itself rather than
 * hidden behind a guess, because silently renaming something we do not
 * understand is how a log stops being evidence.
 */
export function canonicalEventTypeOf(record: { eventType?: unknown; result?: unknown }): string {
  const raw = typeof record.eventType === 'string' ? record.eventType : '';
  const resolve = LEGACY_RESOLVERS[raw];
  return resolve ? resolve(record) : raw;
}

/**
 * The retired names whose records can canonicalise to `canonical`.
 *
 * Used to widen a filter: an operator asking for `authorization.deny` must also
 * get the pre-cutover `access_decision` rows that were denials, or the log
 * appears to begin on the day of the rename.
 *
 * `authorization.allow` appears here even though nothing emits it any more —
 * history may contain it, and history is the reason this map exists.
 */
export function legacyTypesFor(canonical: string): string[] {
  return LEGACY_EVENT_TYPES.filter((legacy) => {
    const resolve = LEGACY_RESOLVERS[legacy];
    return (
      resolve({ result: 'deny' }) === canonical ||
      resolve({ result: 'failure' }) === canonical ||
      resolve({ result: 'logout' }) === canonical ||
      resolve({ result: 'success' }) === canonical
    );
  });
}
