/**
 * Every audit event name, in code (#1201, #1638, epic #1208).
 *
 * Configuration declares the names (`ngdpbase.audit.events`). Core's names are
 * generated from `config/app-default-config.json` into
 * `auditEventNames.generated.ts` by `npm run generate:permissions`, and
 * `npm run lint:permissions` fails when that file is stale, so there is one
 * declaration and no hand-kept list. `AuditEvent.eventType` is typed, so a
 * core emitter cannot compile with a name configuration does not declare; a
 * rename is one edit in configuration plus a regeneration, and the compiler
 * finds every call site.
 *
 * An addon declares its own events in its `config/default-config.json`; they
 * reach the registry through the configuration merge while the addon is
 * enabled (addonConfigLayer.ts). The generated union cannot name them, and
 * widening it to `string` would let a core typo compile again. So an addon
 * names its event through {@link addonAuditEventName}, which brands a checked
 * string, and `recordAuditEvent` refuses — throws — a branded name the merged
 * registry does not declare. Core typing stays exactly as strict as before.
 *
 * Convention: `{target}-{action}`, hyphens only, URL-safe, sharing the slug of
 * the permission whose action it records (`page-read` authorizes; `page-read`
 * records). The containing map says which is meant.
 */

import { AUDIT_EVENT, AUDIT_EVENT_NAME_PATTERN, type AuditEventName } from './auditEventNames.generated.js';

export { AUDIT_EVENT, AUDIT_EVENT_NAME_PATTERN, type AuditEventName };

/** Every core name, sorted, for tests and tooling. */
export function auditEventNames(): AuditEventName[] {
  return Object.values(AUDIT_EVENT).sort();
}

const CORE_NAMES: ReadonlySet<string> = new Set(Object.values(AUDIT_EVENT));

/** Is this one of the names core declares (and so one the generated union admits)? */
export function isCoreAuditEventName(name: string): name is AuditEventName {
  return CORE_NAMES.has(name);
}

declare const addonAuditEventBrand: unique symbol;

/**
 * An audit event name an addon declares (#1638). A string literal is not one:
 * the only way to get one is {@link addonAuditEventName}, so the brand marks a
 * name that went through the check, and a core typo still fails to compile.
 */
export type AddonAuditEventName = string & { readonly [addonAuditEventBrand]: true };

/** What `recordAuditEvent` accepts: a core name, or an addon's checked name. */
export type RecordableAuditEventName = AuditEventName | AddonAuditEventName;

/**
 * Name an addon's audit event. Throws on a name outside `{target}-{action}`.
 *
 * Whether the name is declared is checked when the event is recorded, not
 * here: the registry is bound when AuditManager initialises, which may be
 * after the addon module loads. `lint:audit` reads the literal passed here as
 * the addon's emitter, so pass a string literal.
 */
export function addonAuditEventName(name: string): AddonAuditEventName {
  if (!AUDIT_EVENT_NAME_PATTERN.test(name)) {
    throw new Error(`Audit event '${name}' is not a {target}-{action} name (hyphens only).`);
  }
  return name as AddonAuditEventName;
}
