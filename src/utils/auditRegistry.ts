/**
 * The audit event registry, read from configuration (#1200, epic #1208).
 *
 * `ngdpbase.audit.events` in `config/app-default-config.json` names every
 * recorded action, what happens when its record cannot be written, and whether it fires. This module is
 * a reader over that map: nothing here declares an event.
 *
 * Until #1200 the declarations lived in this file, deliberately, on the
 * argument that an operator who could edit them could narrow what the system
 * claims to audit. The operator's decision on 2026-09-04 is that this is the
 * point: configuration is authoritative, and narrowing is on the record —
 * an admin UI edit emits `config-change`, and a disk edit is reported by
 * `posture-recorded` at the next boot. See docs/audit-posture.md.
 *
 * #1638 (operator, 2026-10-05): a permission and its action are one thing. An
 * event that records a permission's action is declared on the permission
 * entry itself — `ngdpbase.permissions.definitions.<name>.audit` — and
 * `ngdpbase.audit.events` holds only events that are not a permission's
 * action. {@link auditDeclarationsFrom} reads both, and is the one reader:
 * the runtime, the generator, the lint, the doc generator and the boot check
 * all call it, so they cannot disagree.
 *
 * What stays in code is the emitters. `scripts/audit-coverage.ts` proves the
 * map and the emitters agree.
 */

import logger from './logger.js';

export const AUDIT_EVENTS_KEY = 'ngdpbase.audit.events';
/** The permission registry; an entry's `audit` field declares its event (#1638). */
export const PERMISSION_DEFINITIONS_KEY = 'ngdpbase.permissions.definitions';

/**
 * What happens when the record cannot be written (#1121, #1158, #1218).
 *
 * - `refuse`   — the action must not complete unless the record does; the
 *                write is flushed to the device before the action proceeds
 * - `continue` — the action proceeds; the lost record is counted and surfaced
 *
 * This is failure handling, not importance. How important an event is lives
 * on each record as `severity`. Until #1218 this field was called `tier` with
 * values `critical` / `standard` / `volume`, which read as an importance
 * scale that it never was; `volume` was `continue` plus `enabled: false`.
 */
export type AuditOnFailure = 'refuse' | 'continue';

/** One entry of `ngdpbase.audit.events`. */
export interface AuditEventDeclaration {
  'on-failure': AuditOnFailure;
  /** Whether the emitter fires. Omitted means true; `false` is a decision on the record. */
  enabled?: boolean;
  /** One line, shown in the admin filter and the documented table. */
  description: string;
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

const warnedDoubled = new Set<string>();

/**
 * Every declared event in a configuration (#1638): the entries of
 * `ngdpbase.audit.events`, plus every permission entry carrying `audit`, under
 * the permission's name. A permission's `audit.description` defaults to the
 * permission's own description.
 *
 * A name in both places is a declaration made twice. The shipped file never
 * does it (`npm run lint:audit` fails); an operator's custom file that still
 * sets a moved event under `ngdpbase.audit.events` is honoured — its fields
 * override the permission's — and said once, so it is never silent.
 */
export function auditDeclarationsFrom(read: AuditEventsSource): Record<string, AuditEventDeclaration> {
  const events = asDeclarations(read(AUDIT_EVENTS_KEY, {}));
  const permissions = read(PERMISSION_DEFINITIONS_KEY, {});
  const out: Record<string, AuditEventDeclaration> = {};
  if (permissions && typeof permissions === 'object' && !Array.isArray(permissions)) {
    for (const [name, entry] of Object.entries(permissions as Record<string, unknown>)) {
      const audit = (entry as { audit?: unknown } | null)?.audit;
      if (!audit || typeof audit !== 'object') continue;
      const description = (entry as { description?: unknown }).description;
      out[name] = { description: typeof description === 'string' ? description : name, ...(audit as Partial<AuditEventDeclaration>) } as AuditEventDeclaration;
    }
  }
  // A custom file written before #1638 removed an event with null in the
  // events map; that still removes it, wherever it is now declared.
  const rawEvents = read(AUDIT_EVENTS_KEY, {});
  if (rawEvents && typeof rawEvents === 'object' && !Array.isArray(rawEvents)) {
    for (const [name, entry] of Object.entries(rawEvents as Record<string, unknown>)) {
      if (entry === null) delete out[name];
    }
  }
  for (const [name, d] of Object.entries(events)) {
    if (out[name] && !warnedDoubled.has(name)) {
      warnedDoubled.add(name);
      logger.warn(`[audit] '${name}' is declared in ${AUDIT_EVENTS_KEY} and on its permission entry; the ${AUDIT_EVENTS_KEY} entry wins. Move it to ${PERMISSION_DEFINITIONS_KEY}.${name}.audit (#1638).`);
    }
    out[name] = { ...out[name], ...d };
  }
  return out;
}

/** Every declared event, from the bound configuration. Empty, and said once, before binding. */
export function auditEventDeclarations(): Record<string, AuditEventDeclaration> {
  if (!boundSource) {
    if (!warnedUnbound) {
      warnedUnbound = true;
      logger.warn(`[audit] ${AUDIT_EVENTS_KEY} is not bound yet; every event is treated as on-failure: continue until AuditManager initialises`);
    }
    return {};
  }
  return auditDeclarationsFrom(boundSource);
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
    logger.warn(`[audit] '${eventType}' is emitted but not declared in ${AUDIT_EVENTS_KEY}; treated as on-failure: continue`);
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
 * Does this event refuse the action when its record cannot be written
 * (#1121, #1158)?
 *
 * Two layers need the same answer and must not be able to disagree:
 * `recordAuditEvent` decides whether a failure rejects the action, and
 * `FileAuditProvider.writeEvent` decides whether the record is fsynced before
 * the write resolves. A rule that meant one thing to the caller and another to
 * the writer would be the #1148 defect again.
 */
export function refusesOnFailure(eventType: string): boolean {
  return auditEventDeclaration(eventType)?.['on-failure'] === 'refuse';
}

/** Every event type that refuses on failure, for reporting what the rule covers. */
export function refuseOnFailureEventTypes(): string[] {
  return Object.entries(auditEventDeclarations())
    .filter(([, d]) => d['on-failure'] === 'refuse' && d.enabled !== false)
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
