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
export type SessionSecretOrigin =
  | { kind: 'env' }
  | { kind: 'instance-env-file'; path: string }
  | { kind: 'generated'; path: string };

/** Filesystem seams, injected so the backfill is testable in a scratch dir. */
export interface SessionSecretFs {
  readFile: (path: string) => string | null;
  appendFile: (path: string, line: string, createMode: number) => void;
  randomSecret: () => string;
}

/**
 * Make `NGDPBASE_SESSION_SECRET` true in `env`, generating and backfilling
 * `<instanceDataDir>/.env` when nothing supplied it (#1194).
 *
 * Order:
 *
 * 1. Already set and not a placeholder — use it, write nothing.
 * 2. Blank, but the instance `.env` has a usable line — use that. This is the
 *    case where a launcher passed `NGDPBASE_SESSION_SECRET=` empty (compose
 *    `${VAR:-}`, `-e VAR=`), which dotenv then refuses to override. Without
 *    this branch every such boot would generate again and log everyone out.
 * 3. Otherwise generate, append one line to the instance `.env` (created
 *    `0600` when new), and use it.
 *
 * A placeholder anywhere refuses; a failed append refuses. Both throw with
 * the message from `resolveSessionSecret`.
 *
 * The repo-root `.env` is never written: it is shared by every instance that
 * launches from the checkout, and the per-instance file is the documented home
 * (`.env.example`: "Per-instance .env lives at ${FAST_STORAGE}/.env").
 *
 * @returns The secret and where it came from. The caller sets `env` itself,
 *   so this function has no side effect on the process beyond the file.
 */
export function ensureSessionSecret(
  env: Readonly<Record<string, string | undefined>>,
  instanceDataDir: string,
  fs: SessionSecretFs
): { secret: string; origin: SessionSecretOrigin } {
  const ambient = (env[SESSION_SECRET_ENV] ?? '').trim();
  if (ambient !== '') {
    // Non-blank: either usable or a placeholder. resolveSessionSecret decides.
    return { secret: resolveSessionSecret(env), origin: { kind: 'env' } };
  }

  const envPath = `${instanceDataDir.replace(/\/+$/, '')}/.env`;

  const existing = fs.readFile(envPath);
  if (existing !== null) {
    const fromFile = readSecretLine(existing);
    if (fromFile !== null) {
      return {
        secret: resolveSessionSecret({ [SESSION_SECRET_ENV]: fromFile }),
        origin: { kind: 'instance-env-file', path: envPath }
      };
    }
  }

  const secret = fs.randomSecret();
  const needsLeadingNewline = existing !== null && existing !== '' && !existing.endsWith('\n');
  const line =
    (needsLeadingNewline ? '\n' : '') +
    '# Generated by ngdpbase on first boot (#1194). Rotating it signs everyone out.\n' +
    `${SESSION_SECRET_ENV}=${secret}\n`;

  try {
    fs.appendFile(envPath, line, 0o600);
  } catch (err) {
    throw new Error(
      `[startup] Refusing to boot: ${SESSION_SECRET_ENV} is not set and it could not be ` +
      `written to ${envPath} (${(err as Error).message}). The session cookie is signed ` +
      'with this value. Either make that file writable so it can be generated once, or ' +
      'set the variable yourself:\n' +
      `  ${SESSION_SECRET_ENV}=$(openssl rand -base64 32)\n` +
      '(#1194)'
      , { cause: err });
  }

  return { secret, origin: { kind: 'generated', path: envPath } };
}

/** The last `NGDPBASE_SESSION_SECRET=` line in a dotenv file, unquoted; null when absent. */
function readSecretLine(content: string): string | null {
  let found: string | null = null;
  for (const raw of content.split('\n')) {
    const m = raw.match(/^\s*(?:export\s+)?NGDPBASE_SESSION_SECRET\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[1].trim();
    const quoted = value.match(/^(['"])(.*)\1$/);
    if (quoted) value = quoted[2];
    else value = value.replace(/\s+#.*$/, '').trim();
    found = value;
  }
  return found === '' ? null : found;
}
