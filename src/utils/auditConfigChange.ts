/**
 * Administrative configuration changes as audit events (#1150).
 *
 * `auditRegistry` marked `admin-system` as `exempt: 'not-implemented'`, so no
 * configuration change was audited anywhere. An administrator could change any
 * setting on the instance — whether HTML is sanitised, the login throttle
 * thresholds, the outbound egress ranges, the session cookie flags, whether
 * auditing runs at all — and the log held no record, while faithfully
 * recording that somebody viewed a page.
 *
 * See D19 of docs/security-posture.md, which needs this: the security posture
 * is edited from a web form, so a change to it must leave a trace.
 */

import type { AuditEvent } from './auditEvents.js';
import type { ActorAttribution } from '../context/ActorContext.js';
import { AUDIT_EVENT } from './auditEventNames.js';

/**
 * Longest JSON representation of a value kept in a record.
 *
 * A config value can be an arbitrary object — the interwiki site list, a role
 * catalogue — and an audit log is read by people. Past this the value is
 * truncated and says so, rather than either bloating the record or being
 * silently dropped.
 */
const MAX_VALUE_CHARS = 512;

/**
 * Is this key one the operator has declared secret?
 *
 * The list is `ngdpbase.config.secret-keys`, the same one that masks values on
 * `/admin/configuration` and drives log redaction. It is operator-editable
 * configuration, so it can contain anything: non-string entries are ignored
 * rather than throwing, because a malformed list must not stop a config change
 * from being recorded.
 */
export function isSecretKey(key: string, secretKeys: unknown): boolean {
  if (!Array.isArray(secretKeys)) return false;
  return secretKeys.some((entry) => typeof entry === 'string' && entry === key);
}

/**
 * Render a configuration value for the record.
 *
 * Primitives are kept as they are, so a reader filtering on `after: true` gets
 * what they expect. Anything else becomes JSON, truncated past
 * {@link MAX_VALUE_CHARS} with an explicit marker — a truncated value that does
 * not say it was truncated is worse than no value at all.
 */
export function describeConfigValue(value: unknown): unknown {
  if (value === null) return null;
  const t = typeof value;
  if (t === 'boolean' || t === 'number') return value;

  let text: string;
  if (t === 'string') {
    text = value as string;
  } else {
    try {
      // `undefined` and a function stringify to undefined; name the shape
      // rather than falling back to String(), which would produce
      // '[object Object]' for the values most worth reading.
      text = JSON.stringify(value) ?? `[${t}]`;
    } catch {
      // Circular or otherwise unserialisable. Say what it was rather than
      // failing the audit write over a value shape.
      return `[unserialisable ${t}]`;
    }
  }

  return text.length > MAX_VALUE_CHARS
    ? `${text.slice(0, MAX_VALUE_CHARS)}… [truncated, ${text.length} chars]`
    : text;
}

export interface ConfigChangeInput {
  key: string;
  before: unknown;
  after: unknown;
  /** Who made the change — from the context the write was handed (#1179), never guessed. */
  actor: ActorAttribution;
  /** Whether the key is named in `ngdpbase.config.secret-keys`. */
  secret: boolean;
}

/**
 * Build the audit event for a configuration change.
 *
 * A secret key records __that it changed and neither value__. An entry naming
 * a key alongside its before and after values would reintroduce the disclosure
 * `ngdpbase.config.secret-keys` exists to prevent, by a different route and
 * into a file with a longer retention than the logs it already guards.
 *
 * Severity is uniform. Grading a security-relevant key higher would need a
 * list of which keys those are, and inventing one here — ahead of the posture
 * ingredient list in D15 — would be a second, drifting definition of the same
 * thing.
 */
export function buildConfigChangeAuditEvent(input: ConfigChangeInput): AuditEvent {
  const { key, before, after, actor, secret } = input;

  // The actor's provenance first (origin, reason, delegation), then the change.
  const metadata: Record<string, unknown> = { ...actor.metadata, key };

  if (secret) {
    metadata.secret = true;
  } else {
    // `undefined` means the key had no explicit value before, which is a
    // different fact from having been set to null.
    metadata.before = before === undefined ? null : describeConfigValue(before);
    metadata.after = describeConfigValue(after);
    if (before === undefined) metadata.wasUnset = true;
  }

  return {
    eventType: AUDIT_EVENT.CONFIG_CHANGE,
    // #1179: read from the context. A change no request drove arrives with a
    // JobContext that names the system principal and its reason.
    user: actor.user,
    ipAddress: actor.ipAddress,
    action: 'config-change',
    result: 'success',
    severity: 'medium',
    metadata
  };
}
