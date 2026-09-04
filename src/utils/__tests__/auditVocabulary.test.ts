/**
 * #1115 — the documented vocabulary and the emitted vocabulary are the same set.
 *
 * This is the "check that fails" for the audit event names, and it exists
 * because nothing was checking. Before it: 14 of the 19 event types documented
 * in docs/managers/AuditManager.md were emitted by nothing, twelve emitted
 * types were documented nowhere, and the admin filter dropdown offered four
 * options of which three matched zero records in a 2,687-record log. An
 * operator filtering for a documented type got an empty table and could not
 * tell that from "nothing happened".
 *
 * Same shape as auditRegistry.test.ts (#1120), and the same defect class as
 * #1104 and #1106: a declaration and an implementation disagreeing, silently.
 */
import fs from 'fs';
import path from 'path';
import { auditEventDeclarations, auditEventTypes } from '../auditVocabulary';
import { requiredEventTypes } from '../auditRegistry';
import { AUDIT_EVENT, AUDIT_EVENT_NAME_PATTERN } from '../auditEventNames';

const SRC = path.join(process.cwd(), 'src');
const DOCS = path.join(process.cwd(), 'docs', 'managers', 'AuditManager.md');

function sourceFiles(dir = SRC, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      sourceFiles(full, acc);
    } else if (entry.name.endsWith('.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

// #1200: the vocabulary is `ngdpbase.audit.events` in configuration; the two
// reader modules name nothing and emit nothing.
const files = sourceFiles().filter((f) => !f.endsWith('auditVocabulary.ts') && !f.endsWith('auditRegistry.ts') && !f.endsWith('auditEventNames.ts'));
const allSource = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

/** Names an emitter can send: every `AUDIT_EVENT.KEY` reference in src/, resolved through the module. */
function emittedNames(): Set<string> {
  const found = new Set<string>();
  for (const m of allSource.matchAll(/AUDIT_EVENT\.([A-Z_]+)/g)) {
    const name = (AUDIT_EVENT as Record<string, string>)[m[1]];
    if (name) found.add(name);
  }
  // A raw literal in eventType position bypasses the module; count it so the
  // vocabulary check can still see it.
  for (const m of allSource.matchAll(/eventType:\s*'([^']+)'/g)) found.add(m[1]);
  return found;
}

describe('the audit vocabulary is one set, not three (#1115)', () => {
  test('every emitted event type is in the vocabulary', () => {
    const undocumented = [...emittedNames()]
      .filter((t) => t !== 'test')
      .filter((t) => !(t in auditEventDeclarations()));

    expect(undocumented).toEqual([]);
  });

  test('nothing emits a dotted or snake_case name any more (#1201)', () => {
    const offConvention = [...emittedNames()].filter((t) => t !== 'test' && !AUDIT_EVENT_NAME_PATTERN.test(t));
    expect(offConvention).toEqual([]);
  });

  test('every declared and enabled type has an emitter', () => {
    const emitted = emittedNames();
    const missing = requiredEventTypes().filter((eventType) => !emitted.has(eventType));

    expect(missing).toEqual([]);
  });

  test('a type switched off must say why', () => {
    // #1200: `enabled: false` is a decision on the record, and the record
    // needs its reason.
    const unexplained = Object.entries(auditEventDeclarations())
      .filter(([, d]) => d.enabled === false && !d.description)
      .map(([eventType]) => eventType);

    expect(unexplained).toEqual([]);
  });

  test('every type follows the {target}-{action} convention (#1201)', () => {
    const offenders = auditEventTypes().filter((t) => !AUDIT_EVENT_NAME_PATTERN.test(t));
    expect(offenders).toEqual([]);
  });

  test('the documented table lists exactly the vocabulary', () => {
    const doc = fs.readFileSync(DOCS, 'utf8');
    const section = doc.split('### Event Types')[1]?.split('###')[0] ?? '';
    const documented = new Set([...section.matchAll(/\|\s*`([^`]+)`\s*\|/g)].map((m) => m[1]));

    const vocabulary = new Set(auditEventTypes());
    const missingFromDocs = [...vocabulary].filter((t) => !documented.has(t));
    const fictionInDocs = [...documented].filter((t) => !vocabulary.has(t));

    expect({ missingFromDocs, fictionInDocs }).toEqual({ missingFromDocs: [], fictionInDocs: [] });
  });
});
