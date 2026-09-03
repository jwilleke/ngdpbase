#!/usr/bin/env tsx
/**
 * What the audit vocabulary declares, versus what the code actually does (#1184).
 *
 * Three lists exist and none of them was comparable to the others by hand:
 *
 * - __vocabulary__ (`auditVocabulary.ts`) — the names that may be used
 * - __registry__ (`auditRegistry.ts`) — what MUST be recorded, and at what tier
 * - __emitters__ — what the source actually builds and sends
 *
 * The parity tests (#1115) prove *emitted ⊆ vocabulary* and *registry-declared
 * has an emitter*. Nothing proved __registry ⊇ emitted__, which is how fifteen
 * event types — `authentication.failed` among them — came to be named,
 * emitted, and documented while the contract that says what must be recorded
 * never mentioned them. An event outside the registry has no tier, so
 * `isCriticalEventType()` answers `false` for it: not as a decision, but
 * because it is not there to be graded.
 *
 * __Interpolated event types are the reason this is a script and not a grep.__
 * Emitters build names as `` `page.${op}` ``, so a literal search reports
 * `page.create` as unemitted while it is emitted on every page save — a false
 * negative I produced by hand before writing this. The op unions in
 * `auditEvents.ts` are read and expanded.
 *
 * Run: `npm run audit:coverage` (report) — `--check` exits 1 on a gap.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, '..');

const read = (rel: string): string => readFileSync(path.join(REPO, rel), 'utf8');

/** Names the vocabulary permits. */
export function vocabularyTypes(): string[] {
  const src = read('src/utils/auditVocabulary.ts');
  const body = src.slice(src.indexOf('AUDIT_EVENT_TYPES'));
  return [...new Set(
    [...body.matchAll(/^\s*'([a-z][a-z.-]*\.[a-z][a-z.-]*)':\s*\{/gm)].map((m) => m[1])
  )].sort();
}

/** Names the registry declares must be recorded, with their tier. */
export function registryTypes(): Map<string, string> {
  const src = read('src/utils/auditRegistry.ts');
  const out = new Map<string, string>();
  // Match the whole `{ … }` entry, then read both fields from it. A lazy
  // `[^}]*?` before an optional tier group matches minimally and skips the
  // tier — reporting `page.delete` as `unspecified` when it is `critical`.
  // A report that cannot read tiers cannot answer the question it exists for.
  for (const m of src.matchAll(/\{[^{}]*eventType:\s*'([^']+)'[^{}]*\}/g)) {
    const tier = /tier:\s*'([a-z]+)'/.exec(m[0])?.[1] ?? 'unspecified';
    out.set(m[1], tier);
  }
  return out;
}

/**
 * Names the source actually emits, expanding `${op}` interpolations.
 *
 * Conservative on purpose: an emitter this cannot resolve is reported as
 * `unresolved` rather than silently dropped, because a name nobody can account
 * for is the thing worth looking at.
 */
export function emittedTypes(names: string[]): { resolved: string[]; unresolved: string[] } {
  const events = read('src/utils/auditEvents.ts');

  // `export type PageMutationOp = 'create' | 'edit' | …` → what a `${op}` expands to
  const unions = new Map<string, string[]>();
  for (const m of events.matchAll(/export type (\w+) =\s*((?:'[a-z-]+'\s*\|?\s*)+);/g)) {
    unions.set(m[1], [...m[2].matchAll(/'([a-z-]+)'/g)].map((x) => x[1]));
  }
  const opUnionFor = (prefix: string): string[] => {
    const named: Record<string, string> = {
      page: 'PageMutationOp', attachment: 'AttachmentOp', token: 'TokenOp'
    };
    const t = named[prefix];
    if (t && unions.has(t)) return unions.get(t) as string[];
    if (prefix === 'job') return ['started', 'completed', 'failed'];
    return [];
  };

  const resolved = new Set<string>();
  const unresolved = new Set<string>();

  for (const file of walk(path.join(REPO, 'src')).concat(walk(path.join(REPO, 'addons')))) {
    const rel = path.relative(REPO, file);
    // The vocabulary and the registry NAME every type; they do not emit any.
    if (rel.endsWith('auditVocabulary.ts') || rel.endsWith('auditRegistry.ts')) continue;
    const src = stripComments(readFileSync(file, 'utf8'));

    // A vocabulary name appearing as a string literal anywhere in emitting code.
    //
    // Deliberately looser than matching `eventType:` — the first version of
    // this script did that and reported `authentication.success`,
    // `share.create` and `authorization.allow` as unemitted while all three
    // are live. They are written as a ternary
    // (`eventType: deny ? 'authorization.deny' : 'authorization.allow'`), as a
    // call argument (`this.audit('share.create', …)`), and on a continuation
    // line. A false negative here is the one failure this script exists to
    // prevent, so it matches the NAME rather than the syntax around it.
    for (const n of names) {
      if (src.includes(`'${n}'`) || src.includes(`"${n}"`) || src.includes(`\`${n}\``)) resolved.add(n);
    }

    // Literal `eventType:` assignments, INCLUDING names the vocabulary does
    // not know. The name-matching loop above can only ever find names already
    // in the vocabulary, so without this `offVocabulary` could never populate
    // — a check that cannot fail. Found by sabotage: emitting
    // `authentication.sneaky` produced no finding.
    // The whole `eventType:` EXPRESSION, not just a literal directly after the
    // colon — it is often a ternary spanning three lines:
    //
    //     eventType: isFailure
    //       ? 'authentication.failed'
    //       : 'authentication.success',
    //
    // Taking every name in the expression catches both arms. Bounded to the
    // expression so a nearby job id like `media.rebuild` is not swept in — an
    // earlier version matched any `: 'x.y'` line and reported exactly that.
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      const at = line.indexOf('eventType:');
      if (at === -1) return;
      const expr = [line.slice(at), lines[i + 1] ?? '', lines[i + 2] ?? '']
        .join('\n')
        .split(/,\s*$/m)[0];
      for (const m of expr.matchAll(/'([a-z][a-z.-]*\.[a-z][a-z.-]*)'/g)) resolved.add(m[1]);
    });

    // Interpolated forms, which no literal search can see.
    for (const m of src.matchAll(/eventType:\s*`([^`]+)`/g)) {
      const im = /^([a-z]+)\.\$\{(\w+)\}$/.exec(m[1]);
      if (!im) { unresolved.add(m[1]); continue; }
      const ops = opUnionFor(im[1]);
      if (ops.length === 0) { unresolved.add(m[1]); continue; }
      for (const op of ops) resolved.add(`${im[1]}.${op}`);
    }
  }
  return { resolved: [...resolved].sort(), unresolved: [...unresolved].sort() };
}

/** Strip comments, so prose naming an event type is not read as an emitter. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((l) => {
      const i = l.indexOf('//');
      return i === -1 ? l : l.slice(0, i);
    }).join('\n');
}

function walk(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (['node_modules', '__tests__', 'dist'].includes(entry)) continue;
      walk(full, acc);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

export interface Coverage {
  vocabulary: string[];
  registry: Map<string, string>;
  emitted: string[];
  unresolvedEmitters: string[];
  /** Emitted and named, but the registry states no requirement — the #1184 gap. */
  undeclared: string[];
  /** Declared as required, but nothing emits it. */
  unemitted: string[];
  /** Emitted but not a permitted name. The parity tests already cover this; belt and braces. */
  offVocabulary: string[];
}

export function coverage(): Coverage {
  const vocabulary = vocabularyTypes();
  const registry = registryTypes();
  const { resolved: emitted, unresolved } = emittedTypes(vocabulary);
  const vocabSet = new Set(vocabulary);

  return {
    vocabulary,
    registry,
    emitted,
    unresolvedEmitters: unresolved,
    undeclared: vocabulary.filter((t) => !registry.has(t)),
    unemitted: [...registry.keys()].filter((t) => !emitted.includes(t)).sort(),
    offVocabulary: emitted.filter((t) => !vocabSet.has(t))
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const c = coverage();
  const check = process.argv.includes('--check');

  console.log('Audit coverage — vocabulary vs registry vs emitters (#1184)');
  console.log('==========================================================');
  console.log(`  vocabulary declares : ${c.vocabulary.length}`);
  console.log(`  registry requires   : ${c.registry.size}`);
  console.log(`  source emits        : ${c.emitted.length}`);
  console.log('');

  console.log(`NAMED AND EMITTED, NO REGISTRY REQUIREMENT (${c.undeclared.length})`);
  console.log('  These have no tier, so isCriticalEventType() answers false by absence.');
  for (const t of c.undeclared) {
    console.log(`   ${c.emitted.includes(t) ? '●' : '○'} ${t}${c.emitted.includes(t) ? '' : '   (not emitted either)'}`);
  }

  if (c.unemitted.length) {
    console.log(`\nREQUIRED BUT NOT EMITTED (${c.unemitted.length})`);
    console.log('  A stated requirement with no emitter is the worse direction.');
    for (const t of c.unemitted) console.log(`   ${t}   tier=${c.registry.get(t)}`);
  }

  if (c.offVocabulary.length) {
    console.log(`\nEMITTED, NOT IN VOCABULARY (${c.offVocabulary.length})`);
    for (const t of c.offVocabulary) console.log(`   ${t}`);
  }

  if (c.unresolvedEmitters.length) {
    console.log(`\nEMITTERS THIS COULD NOT RESOLVE (${c.unresolvedEmitters.length})`);
    console.log('  Reported rather than dropped — an unaccounted name is the point.');
    for (const t of c.unresolvedEmitters) console.log(`   ${t}`);
  }

  const failed = c.unemitted.length + c.offVocabulary.length + c.unresolvedEmitters.length;
  console.log('');
  if (!check) {
    console.log('Report only. Run with --check to fail the build on a gap.');
    process.exit(0);
  }
  // `undeclared` is NOT failed on yet: closing those needs a tier decision per
  // event (#1184), and a check that fails before the decision exists is one
  // people disable. It fails on the directions that are unambiguous.
  if (failed > 0) {
    console.error(`${failed} unambiguous gap(s).`);
    process.exit(1);
  }
  console.log(`No unambiguous gaps. ${c.undeclared.length} type(s) await a registry decision (#1184).`);
  process.exit(0);
}
