/**
 * The npm version-range subset the add-on installer understands (#1830).
 *
 * The runtime has no `semver` package and adding one is a new dependency, so
 * this is the part of npm's range grammar a site's configuration needs to name
 * an add-on release: exact versions, `^` and `~`, x-ranges (`1`, `1.2`, `1.x`,
 * `*`), the comparators `>=`, `>`, `<=`, `<`, `=`, hyphen ranges (`1.2.3 - 2`),
 * space-separated (AND) and `||`-separated (OR) sets. The desugaring follows
 * npm's (node-semver) rules.
 *
 * Prerelease versions (`1.2.3-beta.1`) are never selected: a site installs
 * releases. Anything outside the subset (dist-tags such as `latest`, git or
 * file specs) is refused rather than guessed at — `parseRange` returns null.
 */

type Triple = [number, number, number];

interface Comparator {
  op: '>=' | '>' | '<' | '<=';
  v: Triple;
}

/** A parsed range: OR of AND-sets of comparators. */
export type VersionRange = Comparator[][];

const RELEASE = /^v?(\d+)\.(\d+)\.(\d+)$/;

/** `x.y.z` as numbers, or null for anything else (prereleases included). */
export function parseRelease(version: string): Triple | null {
  const m = RELEASE.exec(version.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Negative, zero or positive, as `a` is below, equal to or above `b`. */
export function compareTriples(a: Triple, b: Triple): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** A partial version: each part a number, or null when absent or a wildcard. */
type Partial = [number | null, number | null, number | null];

function parsePartial(text: string): Partial | null {
  const t = text.trim().replace(/^v/, '');
  if (t === '' || t === '*' || t.toLowerCase() === 'x') return [null, null, null];
  const parts = t.split('.');
  if (parts.length > 3) return null;
  const out: Partial = [null, null, null];
  let wild = false;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p === '*' || p.toLowerCase() === 'x') { wild = true; continue; }
    if (!/^\d+$/.test(p) || wild) return null;
    out[i] = Number(p);
  }
  return out;
}

const filled = (p: Partial): Triple => [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];

/** The first version above every version `p` matches (`1.2` → `1.3.0`); null for `*`. */
function upperOf(p: Partial): Triple | null {
  if (p[0] === null) return null;
  if (p[1] === null) return [p[0] + 1, 0, 0];
  if (p[2] === null) return [p[0], p[1] + 1, 0];
  return null;
}

function caret(p: Partial): Comparator[] {
  const low: Comparator = { op: '>=', v: filled(p) };
  const [major, minor, patch] = p;
  if (major === null) return [low];
  let high: Triple;
  if (major > 0 || minor === null) high = [major + 1, 0, 0];
  else if (minor > 0 || patch === null) high = [0, minor + 1, 0];
  else high = [0, 0, patch + 1];
  return [low, { op: '<', v: high }];
}

function tilde(p: Partial): Comparator[] {
  const low: Comparator = { op: '>=', v: filled(p) };
  const [major, minor] = p;
  if (major === null) return [low];
  const high: Triple = minor === null ? [major + 1, 0, 0] : [major, minor + 1, 0];
  return [low, { op: '<', v: high }];
}

function primitive(op: string, p: Partial): Comparator[] | null {
  const whole = p[2] !== null;
  const upper = upperOf(p);
  switch (op) {
  case '':
  case '=':
    if (whole) return [{ op: '>=', v: filled(p) }, { op: '<=', v: filled(p) }];
    return upper ? [{ op: '>=', v: filled(p) }, { op: '<', v: upper }] : [{ op: '>=', v: [0, 0, 0] }];
  case '>=':
    return [{ op: '>=', v: filled(p) }];
  case '>':
    if (p[0] === null) return [{ op: '<', v: [0, 0, 0] }];
    return whole ? [{ op: '>', v: filled(p) }] : [{ op: '>=', v: upper! }];
  case '<':
    return [{ op: '<', v: filled(p) }];
  case '<=':
    if (p[0] === null) return [{ op: '>=', v: [0, 0, 0] }];
    return whole ? [{ op: '<=', v: filled(p) }] : [{ op: '<', v: upper! }];
  default:
    return null;
  }
}

function parseSet(text: string): Comparator[] | null {
  const hyphen = /^\s*(\S+)\s+-\s+(\S+)\s*$/.exec(text);
  if (hyphen) {
    const from = parsePartial(hyphen[1]);
    const to = parsePartial(hyphen[2]);
    if (!from || !to) return null;
    const out: Comparator[] = [{ op: '>=', v: filled(from) }];
    if (to[0] !== null) out.push(to[2] !== null ? { op: '<=', v: filled(to) } : { op: '<', v: upperOf(to)! });
    return out;
  }
  // Join an operator to its version ("> = 1" is not valid, ">= 1" is).
  const tokens = text.trim().replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1').split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [{ op: '>=', v: [0, 0, 0] }];
  const out: Comparator[] = [];
  for (const token of tokens) {
    const m = /^(\^|~>?|>=|<=|>|<|=)?(.*)$/.exec(token)!;
    const op = m[1] ?? '';
    const partial = parsePartial(m[2]);
    if (!partial) return null;
    const comps = op === '^' ? caret(partial) : op.startsWith('~') ? tilde(partial) : primitive(op, partial);
    if (!comps) return null;
    out.push(...comps);
  }
  return out;
}

/** Parse an npm range in the supported subset; null when it is outside it. */
export function parseRange(range: string): VersionRange | null {
  if (typeof range !== 'string' || range.length > 256) return null;
  const sets: VersionRange = [];
  for (const part of range.split('||')) {
    const set = parseSet(part);
    if (!set) return null;
    sets.push(set);
  }
  return sets;
}

function holds(c: Comparator, v: Triple): boolean {
  const d = compareTriples(v, c.v);
  switch (c.op) {
  case '>=': return d >= 0;
  case '>': return d > 0;
  case '<': return d < 0;
  case '<=': return d <= 0;
  }
}

/** Whether release `version` (x.y.z) is in `range`. A prerelease never is. */
export function satisfies(version: string, range: VersionRange): boolean {
  const v = parseRelease(version);
  if (!v) return false;
  return range.some((set) => set.every((c) => holds(c, v)));
}

/** The releases among `versions` that are in `range`, highest first. */
export function matchingReleases(versions: readonly string[], range: VersionRange): string[] {
  return versions
    .filter((v) => satisfies(v, range))
    .sort((a, b) => compareTriples(parseRelease(b)!, parseRelease(a)!));
}
