/**
 * What must be audited, declared as data (#1120).
 *
 * Before this, being audited depended on a producer remembering to call a
 * method. That can be correct; it can never be PROVABLE, because you cannot
 * demonstrate the absence of a forgotten call site. Authorization denials were
 * audited at ten call sites and nobody could state that without grepping.
 *
 * `{target}-{action}` permissions already ARE the definition of a
 * security-relevant action — that is what a permission is — so the required set
 * is derived from the permission registry rather than invented beside it.
 *
 * This lives in code, not configuration, deliberately. It is a CONTRACT, not a
 * setting: an operator who could edit it could quietly narrow what the system
 * claims to audit, and the claim is the thing being assessed.
 *
 * See docs/planning/Security-auditing.md.
 */

/**
 * How durable an event must be (#1121 will enforce this; declaring it here is
 * what makes that possible without revisiting every call site).
 *
 * - `critical` — the action must not complete unless the record does
 * - `standard` — fire-and-forget, counted and surfaced (today's behaviour)
 * - `volume`   — high-frequency reads; sampled or off
 */
export type AuditTier = 'critical' | 'standard' | 'volume';

/** Why a permission has no audit event. Absence must be a decision, not an oversight. */
export type AuditExemption =
  | 'read-volume'      // auditing every read is a volume decision, not an oversight
  | 'not-implemented'; // should be audited and is not — a gap, counted as one

export interface AuditRequirement {
  /** The event type that must be emitted, or null when exempt. */
  eventType: string | null;
  tier?: AuditTier;
  exempt?: AuditExemption;
  /** Why, in one line. Required for an exemption so the reasoning survives. */
  note?: string;
}

/**
 * Permission → the audit event it must produce.
 *
 * Every permission in the registry appears here. An entry with `eventType:
 * null` is an explicit decision with a reason attached, which is the difference
 * between "we decided not to" and "nobody noticed".
 */
export const AUDIT_REQUIREMENTS: Record<string, AuditRequirement> = {
  // ---- pages -------------------------------------------------------------
  'page-create': { eventType: 'page.create', tier: 'standard' },
  'page-edit':   { eventType: 'page.edit',   tier: 'standard' },
  'page-rename': { eventType: 'page.rename', tier: 'standard' },
  'page-delete': { eventType: 'page.delete', tier: 'critical', note: 'destruction; the record must outlive the page' },
  'page-read':   { eventType: null, exempt: 'read-volume', note: 'every page view; noise on a wiki, the point for a PHR — see #1115' },
  'page-export': { eventType: null, exempt: 'not-implemented', note: 'bulk extraction of content and worth recording' },

  // ---- assets ------------------------------------------------------------
  'asset-upload': { eventType: 'attachment.upload', tier: 'standard' },
  'asset-delete': { eventType: 'attachment.delete', tier: 'critical', note: 'destruction' },
  'asset-edit':   { eventType: null, exempt: 'not-implemented', note: 'EXIF/IPTC edits change provenance metadata' },
  'asset-read':   { eventType: null, exempt: 'read-volume' },

  // ---- search ------------------------------------------------------------
  'search-page': { eventType: null, exempt: 'read-volume' },
  'search-user': { eventType: null, exempt: 'not-implemented', note: 'enumerating people is disclosive in a way searching pages is not' },

  // ---- users -------------------------------------------------------------
  'user-create': { eventType: null, exempt: 'not-implemented', note: 'account lifecycle is squarely in scope' },
  'user-edit':   { eventType: null, exempt: 'not-implemented', note: 'includes role changes, which alter what somebody may do' },
  'user-delete': { eventType: null, exempt: 'not-implemented', note: 'destruction of an account and its attribution' },
  'user-read':   { eventType: null, exempt: 'read-volume' },

  // ---- administration ----------------------------------------------------
  'admin-system': { eventType: null, exempt: 'not-implemented', note: 'admin.page.raw-edit and admin.sessions.* exist; the permission itself is not covered' },
  'admin-roles':  { eventType: null, exempt: 'not-implemented', note: 'changing a role changes everyone holding it' },
  'admin-read':   { eventType: null, exempt: 'read-volume', note: 'declared in config but never registered in UserManager — see #1120' }
};

/**
 * Events required by something other than a permission (#1120).
 *
 * The permission registry is a FLOOR, not a ceiling: it defines what is GATED,
 * not what is SENSITIVE. A failed login has no permission behind it, because
 * nobody is authenticated yet, and it is exactly what an assessor asks for.
 */
export const UNGATED_REQUIREMENTS: Record<string, AuditRequirement> = {
  'token.mint':   { eventType: 'token.mint',   tier: 'critical', note: 'a credential nobody knows exists is the worst case' },
  'token.revoke': { eventType: 'token.revoke', tier: 'critical' }
};

/** Every event type this system undertakes to emit. */
export function requiredEventTypes(): string[] {
  return [...Object.values(AUDIT_REQUIREMENTS), ...Object.values(UNGATED_REQUIREMENTS)]
    .map((r) => r.eventType)
    .filter((t): t is string => t !== null)
    .sort();
}

/** Permissions with no audit event, and why. The honest half of the answer. */
export function exemptions(): Array<{ permission: string; exempt: AuditExemption; note?: string }> {
  return Object.entries(AUDIT_REQUIREMENTS)
    .filter(([, r]) => r.eventType === null)
    .map(([permission, r]) => ({ permission, exempt: r.exempt as AuditExemption, note: r.note }));
}
