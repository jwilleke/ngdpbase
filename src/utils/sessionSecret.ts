/**
 * Boot-time guard for the session secret (#1194).
 *
 * `ngdpbase.session.secret` is the HMAC key express-session signs the session
 * cookie with. Anyone who holds it can mint a signature for any session id.
 * It ships in `config/app-default-config.json` as the literal
 * `ngdpbase-session-secret-change-in-production`, and until #1194 the code
 * fell back to that same literal when nothing else supplied a value — so an
 * instance that set neither `NGDPBASE_SESSION_SECRET` nor a config override
 * signed every session with a string published in this repository. Two live
 * instances were found doing exactly that, and nothing said so.
 *
 * The rule, decided by the operator on #1194:
 *
 *   `NGDPBASE_SESSION_SECRET` MUST be defined in `.env`. Refuse to boot if it
 *   is not present.
 *
 * ## Why the variable, not the resolved config value
 *
 * `ngdpbase.session.secret` is declared env-owned in `ngdpbase.config.env-keys`
 * (#1089): one layer owns the key, the admin screen renders it read-only, and
 * the shipped value is a boot fallback rather than a setting. Checking the
 * variable makes that ownership real. A secret written into
 * `app-custom-config.json` does not satisfy the check, because then the key
 * would have two owners again — the ambiguity #1089 removed.
 *
 * ## Why fatal, not maintenance mode
 *
 * D10 in docs/security-posture.md keeps `process.exit(1)` for the case where
 * the admin UI cannot perform the repair. An env-owned key is exactly that
 * case: nothing in `/admin` can set it, and the session layer it protects is
 * the layer the operator would sign in through. The message names the
 * variable and how to generate a value; there is nothing else to offer.
 *
 * ## Placeholders count as absent
 *
 * The shipped literal, and the example values the docs and `.env.example`
 * files have carried, are as public as an unset variable. Refusing them
 * closes the path where an operator copies an example file and moves on.
 *
 * `.env` is loaded by `src/bootstrap-env.ts` before anything else runs, so by
 * the time this is called `process.env` already carries `<FAST_STORAGE>/.env`,
 * the root `.env`, and the ambient environment, in that precedence.
 */

import { ensureInstanceEnvSecret, type InstanceEnvFs, type InstanceEnvSecretOrigin } from './instanceEnvSecret.js';

/** The environment variable that supplies `ngdpbase.session.secret`. */
export const SESSION_SECRET_ENV = 'NGDPBASE_SESSION_SECRET';

/** The config key the variable feeds (declared in `ngdpbase.config.env-keys`). */
export const SESSION_SECRET_KEY = 'ngdpbase.session.secret';

/** The value shipped in `config/app-default-config.json`. Public; never usable. */
export const SHIPPED_SESSION_SECRET = 'ngdpbase-session-secret-change-in-production';

/**
 * Values that have appeared as examples in this repository's docs and `.env`
 * templates. Each is as well-known as the shipped literal.
 */
export const PLACEHOLDER_SESSION_SECRETS: ReadonlySet<string> = new Set([
  SHIPPED_SESSION_SECRET,
  'change-me-in-production',
  'change-me-to-a-secure-random-string',
  'your-secure-secret',
  'your-secure-secret-here',
  'your-secure-random-secret-here',
  'your-secret'
]);

/**
 * Return the session secret the process must use, or throw.
 *
 * @param env - Normally `process.env`. Injected so the guard is testable
 *   without mutating the real environment.
 * @throws When the variable is unset, blank, or one of the known placeholders.
 */
export function resolveSessionSecret(env: Readonly<Record<string, string | undefined>>): string {
  const raw = env[SESSION_SECRET_ENV];
  const trimmed = (raw ?? '').trim();

  if (trimmed !== '' && !PLACEHOLDER_SESSION_SECRETS.has(trimmed)) {
    return trimmed;
  }

  const why = trimmed === ''
    ? `${SESSION_SECRET_ENV} is not set`
    : `${SESSION_SECRET_ENV} is a placeholder value`;

  // Deliberately does not echo the value: it is public when it is a
  // placeholder, and a real one must never reach a log.
  throw new Error(
    `[startup] Refusing to boot: ${why}. ` +
    'The session cookie is signed with this value, and without it every session ' +
    `would be signed with \`${SESSION_SECRET_KEY}\` as shipped in this repository, ` +
    'which anyone can read. Generate one and add it to <FAST_STORAGE>/.env ' +
    '(or the root .env, or the container\'s Secret), then restart:\n' +
    `  ${SESSION_SECRET_ENV}=$(openssl rand -base64 32)\n` +
    '(#1194)'
  );
}

/** Where the secret the process is using came from. */
export type SessionSecretOrigin = InstanceEnvSecretOrigin;

/** Filesystem seams, injected so the backfill is testable in a scratch dir. */
export type SessionSecretFs = InstanceEnvFs;

/**
 * Make `NGDPBASE_SESSION_SECRET` true in `env`, generating and backfilling
 * `<instanceDataDir>/.env` when nothing supplied it (#1194). The rule is
 * `ensureInstanceEnvSecret`'s; what is particular to the session secret is the
 * placeholder refusal (`resolveSessionSecret`) and the wording.
 *
 * @returns The secret and where it came from. The caller sets `env` itself,
 *   so this function has no side effect on the process beyond the file.
 */
export function ensureSessionSecret(
  env: Readonly<Record<string, string | undefined>>,
  instanceDataDir: string,
  fs: SessionSecretFs
): { secret: string; origin: SessionSecretOrigin } {
  return ensureInstanceEnvSecret({
    name: SESSION_SECRET_ENV,
    comment: 'Generated by ngdpbase on first boot (#1194). Rotating it signs everyone out.',
    accept: (value) => resolveSessionSecret({ [SESSION_SECRET_ENV]: value }),
    refusal: (envPath, err) => new Error(
      `[startup] Refusing to boot: ${SESSION_SECRET_ENV} is not set and it could not be ` +
      `written to ${envPath} (${err.message}). The session cookie is signed ` +
      'with this value. Either make that file writable so it can be generated once, or ' +
      'set the variable yourself:\n' +
      `  ${SESSION_SECRET_ENV}=$(openssl rand -base64 32)\n` +
      '(#1194)',
      { cause: err })
  }, env, instanceDataDir, fs);
}
