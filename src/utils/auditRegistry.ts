/**
 * The audit event registry, read from configuration (#1200, epic #1208).
 *
 * `ngdpbase.audit.events` in `config/app-default-config.json` names every
 * recorded action, its durability tier, and whether it fires. This module is
 * a reader over that map: nothing here declares an event.
 *
 * Until #1200 the declarations lived in this file, deliberately, on the
 * argument that an operator who could edit them could narrow what the system
 * claims to audit. The operator's decision on 2026-09-04 is that this is the
 * point: configuration is authoritative, and narrowing is on the record —
 * an admin UI edit emits `config.change`, and a disk edit is reported by
 * `posture.recorded` at the next boot. See docs/audit-posture.md.
 *
 * Events are actions taken; permissions are authority. The map is keyed by
 * event, so one permission may gate several recorded actions and a recorded
 * action may have no permission at all, and neither registry carries the
 * other's fields.
 *
 * What stays in code is the emitters. `scripts/audit-coverage.ts` proves the
 * map and the emitters agree.
 */

import logger from './logger.js';

export const AUDIT_EVENTS_KEY = 'ngdpbase.audit.events';

/**
 * How durable an event must be (#1121, #1158).
 *
 * - `critical` — the action must not complete unless the record does
 * - `standard` — fire-and-forget, counted and surfaced
 * - `volume`   — high-frequency reads; off unless a posture turns them on
 */
export type AuditTier = 'critical' | 'standard' | 'volume';

/** One entry of `ngdpbase.audit.events`. */
export interface AuditEventDeclaration {
  tier: AuditTier;
  /** Whether the emitter fires. Omitted means true; `false` is a decision on the record. */
  enabled?: boolean;
  /** One line, shown in the admin filter and the documented table. */
  description: string;
  /**
   * Config key that switches emission at runtime (#1129). The emitter exists
   * unconditionally; it fires only when the named key is true. Retires into
   * `enabled` under #1203.
   */
  gatedBy?: string;
}

/** The shape of `ConfigurationManager.getProperty`, so this module needs no manager import. */
export type AuditEventsSource = (key: string, defaultValue?: unknown) => unknown;

let boundSource: AuditEventsSource | null = null;
let warnedUnbound = false;
const warnedUndeclared = new Set<string>();

/**
 * Bind the live configuration. `AuditManager.initialize` calls this before it
 * loads a provider, so every tier consulted from then on is the operator's.
 *
 * There is no fallback to the shipped file: reading
 * `config/app-default-config.json` here would be a second reader over the
 * configuration store, and a value could then come from the file when the live
 * configuration says otherwise. Tests bind from the shipped file themselves
 * (`vitest.setup.ts`), which is the one honest direct read.
 */
export function bindAuditEvents(source: AuditEventsSource | null): void {
  boundSource = source;
  warnedUnbound = false;
}

function asDeclarations(value: unknown): Record<string, AuditEventDeclaration> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, AuditEventDeclaration> = {};
  for (const [name, entry] of Object.entries(value as Record<string, unknown>)) {
    // A custom config removes a shipped entry by setting it to null.
    if (!entry || typeof entry !== 'object') continue;
    out[name] = entry as AuditEventDeclaration;
  }
  return out;
}

/** Every declared event, from the bound configuration. Empty, and said once, before binding. */
export function auditEventDeclarations(): Record<string, AuditEventDeclaration> {
  if (!boundSource) {
    if (!warnedUnbound) {
      warnedUnbound = true;
      logger.warn(`[audit] ${AUDIT_EVENTS_KEY} is not bound yet; every event is treated as standard tier until AuditManager initialises`);
    }
    return {};
  }
  return asDeclarations(boundSource(AUDIT_EVENTS_KEY, {}));
}

/** The declaration for one event, or null when configuration does not name it. */
export function auditEventDeclaration(eventType: string): AuditEventDeclaration | null {
  const d = auditEventDeclarations()[eventType];
  if (d) return d;
  // Never silent: an emitter producing a name configuration does not declare
  // is treated as `standard` and said once, so the gap is visible in the log
  // rather than in an assessor's report.
  if (eventType && !warnedUndeclared.has(eventType)) {
    warnedUndeclared.add(eventType);
    logger.warn(`[audit] '${eventType}' is emitted but not declared in ${AUDIT_EVENTS_KEY}; treated as standard tier`);
  }
  return null;
}

/** Every declared event type, sorted. */
export function auditEventTypes(): string[] {
  return Object.keys(auditEventDeclarations()).sort();
}

/** Every event type this system undertakes to emit: declared and not switched off. */
export function requiredEventTypes(): string[] {
  return Object.entries(auditEventDeclarations())
    .filter(([, d]) => d.enabled !== false)
    .map(([name]) => name)
    .sort();
}

/** Is this event switched on? An undeclared event is not switched off. */
export function isAuditEventEnabled(eventType: string): boolean {
  return auditEventDeclaration(eventType)?.enabled !== false;
}

/**
 * Is this event type declared `critical` (#1121, #1158)?
 *
 * Two layers need the same answer and must not be able to disagree:
 * `recordAuditEvent` decides whether a failure rejects the action, and
 * `FileAuditProvider.writeEvent` decides whether the record is fsynced before
 * the write resolves. A tier that meant one thing to the caller and another to
 * the writer would be the #1148 defect again.
 */
export function isCriticalEventType(eventType: string): boolean {
  return auditEventDeclaration(eventType)?.tier === 'critical';
}

/** Every event type declared `critical`, for reporting what the tier covers. */
export function criticalEventTypes(): string[] {
  return Object.entries(auditEventDeclarations())
    .filter(([, d]) => d.tier === 'critical' && d.enabled !== false)
    .map(([name]) => name)
    .sort();
}

/** Events declared and switched off, with the reason. The honest half of the answer. */
export function disabledEventTypes(): Array<{ eventType: string; description: string }> {
  return Object.entries(auditEventDeclarations())
    .filter(([, d]) => d.enabled === false)
    .map(([eventType, d]) => ({ eventType, description: d.description }))
    .sort((a, b) => a.eventType.localeCompare(b.eventType));
}
