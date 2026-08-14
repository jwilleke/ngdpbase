/**
 * redactSecrets — keep configured secrets out of log output (#1030).
 *
 * `ngdpbase.config.secret-keys` already names the values that must never be
 * shown; it drives masking on `/admin/configuration`. Nothing applied that list
 * to the logs, so a secret reaching a log line was written in the clear — to
 * disk, and to `/admin/logs`, which `admin-read` can open. `app.ts` printed the
 * admin password at startup for exactly this reason (fixed in `2b48d838`). That
 * one line is closed; this closes the class.
 *
 * This is defence in depth, NOT permission to log secrets. It matches literal
 * occurrences only — a value that has been base64-encoded, URL-embedded, hashed
 * or paraphrased still gets through. The rule stays "do not log credentials";
 * this catches the mistakes.
 *
 * ## Why the values are pushed in rather than read
 *
 * The logger bootstraps at module load, long before WikiEngine or
 * ConfigurationManager exist, and is imported by nearly every module —
 * ConfigurationManager included. Reading config from here would create a
 * bootstrap cycle (see the header of BaseLoggingProvider). So the redaction
 * table is a module-level set that starts EMPTY and is filled by
 * {@link refreshRedactedSecrets} once config is resolved, from
 * `WikiEngine.initialize()`.
 *
 * Two consequences worth knowing:
 *
 *   - Log lines emitted before that call are not redacted. Nothing has read
 *     config at that point, so a config-derived secret cannot be in them.
 *   - The format closure reads the live table on every line, which is what
 *     makes the deferred fill work at all: `reconfigureLogger()` replaces the
 *     logger's transports but NOT its format, so the format object created at
 *     module load is the one still running afterwards.
 *
 * For the same cycle reason this module never imports the logger. Callers that
 * want the skipped keys reported get them back from
 * {@link refreshRedactedSecrets} and log them themselves.
 */
import { format } from 'winston';
import type { Logform } from 'winston';

/**
 * Values shorter than this are never redacted.
 *
 * A short secret would corrupt every line containing it as a substring: were
 * `defaultpassword` set to `admin`, redaction would mangle the word "admin"
 * across unrelated output and make the logs useless — while teaching nobody
 * that the password is weak. Skipping is reported, not silent.
 */
const MIN_SECRET_LENGTH = 8;

/** The config key naming which other keys hold secrets. */
const SECRET_KEYS_KEY = 'ngdpbase.config.secret-keys';

interface Redaction {
  /** Config key the value came from — named in the replacement marker. */
  key: string;
  /** Literal value to strike from log output. */
  value: string;
}

/** Why a listed key contributed no redaction. */
export interface SkippedSecret {
  key: string;
  reason: 'unset' | 'not-a-string' | 'empty' | 'env-ref' | 'too-short';
}

export interface RefreshResult {
  /** How many values are now being redacted. */
  active: number;
  /** Listed keys that contributed nothing, with the reason. */
  skipped: SkippedSecret[];
}

/**
 * Active redactions, longest value first.
 *
 * Rebuilt only by {@link refreshRedactedSecrets} — never per log line. This is
 * a hot path: every line pays one pass per entry.
 */
let redactions: Redaction[] = [];

/**
 * Minimal shape needed from ConfigurationManager, to avoid importing it — that
 * import is the bootstrap cycle this module exists on the far side of. Matches
 * `ConfigurationManager.getProperty(key, defaultValue?): unknown` exactly; a
 * generic signature here would not accept the real manager.
 */
export interface SecretConfigReader {
  getProperty(key: string, defaultValue?: unknown): unknown;
}

/** Classify a resolved config value, or return null when it is usable. */
function rejectionReason(value: unknown): SkippedSecret['reason'] | null {
  if (value === undefined || value === null) return 'unset';
  if (typeof value !== 'string') return 'not-a-string';

  const trimmed = value.trim();
  if (trimmed === '') return 'empty';

  // `"$NGDPBASE_SMTP_PASS"` in config is a pointer to an env var, not a secret.
  // The resolved value is what needs redacting; the literal would match the
  // documentation that explains the convention.
  if (trimmed.startsWith('$')) return 'env-ref';

  if (trimmed.length < MIN_SECRET_LENGTH) return 'too-short';
  return null;
}

/**
 * Rebuild the redaction table from the current configuration.
 *
 * Call after ConfigurationManager is initialized, and again after any change to
 * the secret keys or their values. Safe to call repeatedly — it replaces the
 * table wholesale rather than accumulating.
 *
 * @param configManager anything exposing `getProperty` (ConfigurationManager)
 * @returns what is now active, and which listed keys were skipped and why
 */
export function refreshRedactedSecrets(configManager: SecretConfigReader | null | undefined): RefreshResult {
  const skipped: SkippedSecret[] = [];

  if (!configManager || typeof configManager.getProperty !== 'function') {
    redactions = [];
    return { active: 0, skipped };
  }

  const keys = configManager.getProperty(SECRET_KEYS_KEY, []);
  if (!Array.isArray(keys)) {
    redactions = [];
    return { active: 0, skipped };
  }

  const seen = new Set<string>();
  const next: Redaction[] = [];

  for (const rawKey of keys) {
    if (typeof rawKey !== 'string') continue;
    const key = rawKey.trim();
    if (key === '') continue;

    const value = configManager.getProperty(key, undefined);
    const reason = rejectionReason(value);
    if (reason) {
      skipped.push({ key, reason });
      continue;
    }

    const literal = (value as string).trim();
    // Two keys holding the same value redact once; the first key names it.
    if (seen.has(literal)) continue;
    seen.add(literal);
    next.push({ key, value: literal });
  }

  // Longest first: where one secret contains another, the longer must be
  // struck first or the shorter leaves a mangled remainder of the longer.
  next.sort((a, b) => b.value.length - a.value.length);
  redactions = next;

  return { active: redactions.length, skipped };
}

/** Drop all redactions. Intended for tests. */
export function clearRedactedSecrets(): void {
  redactions = [];
}

/** How many values are currently redacted. Intended for tests/diagnostics. */
export function getRedactedSecretCount(): number {
  return redactions.length;
}

/**
 * Replace every configured secret in `text` with `[redacted:<key>]`.
 *
 * The key is named so the line stays diagnosable — "the SMTP password appeared
 * here" is useful; an anonymous `***` is not.
 *
 * Uses split/join rather than a RegExp: secrets routinely contain characters
 * that are regex metacharacters, and building a pattern from an untrusted-shape
 * value is how a redactor ends up throwing on the one line that mattered.
 */
export function redactSecrets(text: string): string {
  if (redactions.length === 0 || typeof text !== 'string' || text === '') return text;

  let out = text;
  for (const { key, value } of redactions) {
    if (out.includes(value)) out = out.split(value).join(`[redacted:${key}]`);
  }
  return out;
}

/**
 * Winston format that redacts secrets from the message and any attached stack.
 *
 * Place it BEFORE `printf` in the pipeline so it applies once, to every
 * transport and every consumer, rather than per output target.
 *
 * Non-string messages are left alone: the printf stage stringifies them, and
 * mutating an object's identity mid-pipeline would surprise a structured/JSON
 * provider. The primary leak shape is an interpolated string.
 */
export function redactSecretsFormat(): Logform.Format {
  return format((info) => {
    if (redactions.length === 0) return info;

    if (typeof info.message === 'string') {
      info.message = redactSecrets(info.message);
    }
    // Error stacks carry the message, so a credential in a thrown error's text
    // reaches the log through this field rather than `message`.
    if (typeof info.stack === 'string') {
      info.stack = redactSecrets(info.stack);
    }
    return info;
  })();
}
