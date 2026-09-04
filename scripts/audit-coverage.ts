#!/usr/bin/env tsx
/**
 * What the audit vocabulary declares, versus what the code actually does (#1184).
 *
 * Three lists exist and none of them was comparable to the others by hand:
 *
 * - __vocabulary__ — the names configuration declares (`ngdpbase.audit.events`, #1200)
 * - __registry__ — the subset configuration requires: declared and not switched off, with an on-failure rule
 * - __emitters__ — what the source actually builds and sends
 *
 * The parity tests (#1115) prove *emitted ⊆ vocabulary* and *registry-declared
 * has an emitter*. Nothing proved __registry ⊇ emitted__, which is how fifteen
 * event types — `authentication-failed` among them — came to be named,
 * emitted, and documented while the contract that says what must be recorded
 * never mentioned them. An event outside the registry has no on-failure rule,
 * so `refusesOnFailure()` answers `false` for it: not as a decision, but
 * because it is not there to be graded.
 *
 * Since #1201 every emitter references `AUDIT_EVENT.KEY` from one module, so
 * the emitted set is the set of references, resolved through that module. A
 * raw literal or an interpolated template in `eventType:` position is reported
 * rather than dropped.
 *
 * Run: `npm run audit:coverage` (report) — `--check` (npm run lint:audit) exits 1 on any gap (#1206).
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, '..');

const read = (rel: string): string => readFileSync(path.join(REPO, rel), 'utf8');

/** The map, read from the shipped defaults (#1200: configuration is the registry). */
function auditEvents(): Record<string, { 'on-failure'?: string; enabled?: boolean }> {
  const parsed = JSON.parse(read('config/app-default-config.json')) as Record<string, unknown>;
  const map = parsed['ngdpbase.audit.events'];
  if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
  return map as Record<string, { 'on-failure'?: string; enabled?: boolean }>;
}

/** Names configuration declares. */
export function vocabularyTypes(): string[] {
  return Object.keys(auditEvents()).sort();
}

/** Names configuration requires — declared and not switched off — with their on-failure rule. */
export function registryTypes(): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, d] of Object.entries(auditEvents())) {
    if (d.enabled === false) continue;
    out.set(name, d['on-failure'] ?? 'unspecified');
  }
  return out;
}

/**
 * Names the source actually emits (#1201): every `AUDIT_EVENT.KEY` reference
 * outside the names module, resolved through it, plus any raw literal in an
 * `eventType:` position — a raw literal bypasses the module and is exactly
 * what the off-vocabulary check exists to catch.
 */
export function emittedTypes(_names: string[]): { resolved: string[]; unresolved: string[] } {
  const module = read('src/utils/auditEventNames.ts');
  const byKey = new Map<string, string>();
  for (const m of module.matchAll(/^\s*([A-Z_]+):\s*'([a-z-]+)',?$/gm)) byKey.set(m[1], m[2]);

  const resolved = new Set<string>();
  const unresolved = new Set<string>();

  for (const file of walk(path.join(REPO, 'src')).concat(walk(path.join(REPO, 'addons')))) {
    const rel = path.relative(REPO, file);
    if (rel.endsWith('auditEventNames.ts') || rel.endsWith('auditVocabulary.ts') || rel.endsWith('auditRegistry.ts')) continue;
    const src = stripComments(readFileSync(file, 'utf8'));

    for (const m of src.matchAll(/AUDIT_EVENT\.([A-Z_]+)/g)) {
      const name = byKey.get(m[1]);
      if (name) resolved.add(name); else unresolved.add(`AUDIT_EVENT.${m[1]}`);
    }
    for (const m of src.matchAll(/eventType:\s*'([^']+)'/g)) resolved.add(m[1]);
    for (const m of src.matchAll(/eventType:\s*`([^`]+)`/g)) unresolved.add(m[1]);
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
  /** Emitted, but configuration states no decision for it — the #1184 gap. */
  undeclared: string[];
  /** Declared as required, but nothing emits it. */
  unemitted: string[];
  /** Emitted but not a permitted name. The parity tests already cover this; belt and braces. */
  offVocabulary: string[];
  /** Declared or emitted under a name that is not `{target}-{action}` (#1201, #1206). */
  offConvention: string[];
}

/** The naming rule, as `src/utils/auditEventNames.ts` states it: target first, hyphens only. */
const NAME_PATTERN = /^[a-z]+(-[a-z]+)+$/;

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
    undeclared: emitted.filter((t) => !vocabSet.has(t)),
    unemitted: [...registry.keys()].filter((t) => !emitted.includes(t)).sort(),
    offVocabulary: emitted.filter((t) => !vocabSet.has(t)),
    offConvention: [...new Set([...vocabulary, ...emitted])].filter((t) => !NAME_PATTERN.test(t)).sort()
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

  console.log(`EMITTED, NO DECLARATION IN ngdpbase.audit.events (${c.undeclared.length})`);
  console.log('  These have no on-failure rule, so refusesOnFailure() answers false by absence.');
  for (const t of c.undeclared) console.log(`   ${t}`);

  if (c.offConvention.length) {
    console.log(`\nNOT {target}-{action} (${c.offConvention.length})`);
    for (const t of c.offConvention) console.log(`   ${t}`);
  }

  const off = c.vocabulary.filter((t) => !c.registry.has(t));
  if (off.length) {
    console.log(`\nDECLARED AND SWITCHED OFF (${off.length}) — decisions on the record, not gaps`);
    for (const t of off) console.log(`   ${t}`);
  }

  if (c.unemitted.length) {
    console.log(`\nREQUIRED BUT NOT EMITTED (${c.unemitted.length})`);
    console.log('  A stated requirement with no emitter is the worse direction.');
    for (const t of c.unemitted) console.log(`   ${t}   on-failure=${c.registry.get(t)}`);
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

  // #1206: every direction fails. Until #1200 gave every event a decision,
  // `undeclared` was reported and not failed on, because a check that fails
  // before the decision exists is one people disable. The decision exists now.
  const failed =
    c.undeclared.length + c.unemitted.length + c.offVocabulary.length +
    c.unresolvedEmitters.length + c.offConvention.length;
  console.log('');
  if (!check) {
    console.log('Report only. Run with --check to fail the build on a gap.');
    process.exit(0);
  }
  if (failed > 0) {
    console.error(`${failed} gap(s): an emitted name with no declaration, a declared and enabled name nobody emits, a name outside the convention, or an emitter this could not resolve.`);
    process.exit(1);
  }
  console.log('No gaps: configuration and emitters agree.');
  process.exit(0);
}
