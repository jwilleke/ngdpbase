/**
 * A secret that must be defined in the instance `.env`, generated once when
 * nothing supplies it (#1194, generalised for #1524).
 *
 * The session secret was the first; the credentials-store key is the second.
 * Both follow one rule, so it is written once:
 *
 * 1. Set in the environment — use it, write nothing.
 * 2. Blank in the environment, but the instance `.env` has a usable line — use
 *    that (a launcher passing `NAME=` empty would otherwise regenerate on every
 *    boot).
 * 3. Otherwise generate, append one commented line to `<instanceDataDir>/.env`
 *    (created `0600` when new), and use it.
 *
 * The repo-root `.env` is never written: it is shared by every instance that
 * launches from the checkout.
 */

/** Filesystem seams, injected so the backfill is testable in a scratch dir. */
export interface InstanceEnvFs {
  readFile: (path: string) => string | null;
  appendFile: (path: string, line: string, createMode: number) => void;
  randomSecret: () => string;
}

/** Where the value the process is using came from. */
export type InstanceEnvSecretOrigin =
  | { kind: 'env' }
  | { kind: 'instance-env-file'; path: string }
  | { kind: 'generated'; path: string };

export interface InstanceEnvSecretSpec {
  /** The variable, e.g. `NGDPBASE_SESSION_SECRET`. */
  name: string;
  /** The comment line written above a generated value (without `# `). */
  comment: string;
  /** Checks a found value and returns it, or throws (a placeholder, say). */
  accept?: (value: string) => string;
  /** The error thrown when the generated line cannot be written. */
  refusal: (envPath: string, cause: Error) => Error;
}

export function ensureInstanceEnvSecret(
  spec: InstanceEnvSecretSpec,
  env: Readonly<Record<string, string | undefined>>,
  instanceDataDir: string,
  fs: InstanceEnvFs
): { secret: string; origin: InstanceEnvSecretOrigin } {
  const accept = spec.accept ?? ((v: string) => v);

  const ambient = (env[spec.name] ?? '').trim();
  if (ambient !== '') return { secret: accept(ambient), origin: { kind: 'env' } };

  const envPath = `${instanceDataDir.replace(/\/+$/, '')}/.env`;
  const existing = fs.readFile(envPath);
  if (existing !== null) {
    const fromFile = readEnvLine(existing, spec.name);
    if (fromFile !== null) return { secret: accept(fromFile), origin: { kind: 'instance-env-file', path: envPath } };
  }

  const secret = fs.randomSecret();
  const needsLeadingNewline = existing !== null && existing !== '' && !existing.endsWith('\n');
  const line = (needsLeadingNewline ? '\n' : '') + `# ${spec.comment}\n${spec.name}=${secret}\n`;
  try {
    fs.appendFile(envPath, line, 0o600);
  } catch (err) {
    throw spec.refusal(envPath, err as Error);
  }
  return { secret, origin: { kind: 'generated', path: envPath } };
}

/** The last `NAME=` line in a dotenv file, unquoted; null when absent or blank. */
export function readEnvLine(content: string, name: string): string | null {
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)$`);
  let found: string | null = null;
  for (const raw of content.split('\n')) {
    const m = raw.match(pattern);
    if (!m) continue;
    let value = m[1].trim();
    const quoted = value.match(/^(['"])(.*)\1$/);
    if (quoted) value = quoted[2];
    else value = value.replace(/\s+#.*$/, '').trim();
    found = value;
  }
  return found === '' ? null : found;
}
