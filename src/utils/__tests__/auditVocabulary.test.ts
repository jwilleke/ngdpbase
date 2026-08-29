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
import {
  AUDIT_EVENT_TYPES,
  auditEventTypes,
  canonicalEventTypeOf,
  legacyTypesFor,
  LEGACY_EVENT_TYPES
} from '../auditVocabulary';

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

const files = sourceFiles().filter((f) => !f.endsWith('auditVocabulary.ts'));
const allSource = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

/** Event type literals assigned to an `eventType` field anywhere in src/. */
function emittedLiterals(): Set<string> {
  const found = new Set<string>();
  for (const m of allSource.matchAll(/eventType:\s*'([^']+)'/g)) found.add(m[1]);
  // ShareManager routes its events through a helper taking the type positionally.
  for (const m of allSource.matchAll(/this\.audit\('([^']+)'/g)) found.add(m[1]);
  return found;
}

describe('the audit vocabulary is one set, not three (#1115)', () => {
  test('every emitted event type is in the vocabulary', () => {
    const undocumented = [...emittedLiterals()]
      .filter((t) => t !== 'test')
      .filter((t) => !(t in AUDIT_EVENT_TYPES));

    expect(undocumented).toEqual([]);
  });

  test('nothing emits a retired snake_case name any more', () => {
    const stillEmitted = [...emittedLiterals()].filter((t) => LEGACY_EVENT_TYPES.includes(t));
    expect(stillEmitted).toEqual([]);
  });

  test('every type declared as emitted has an emitter', () => {
    const missing = Object.entries(AUDIT_EVENT_TYPES)
      .filter(([, spec]) => spec.emitted)
      .map(([eventType]) => eventType)
      .filter((eventType) => {
        if (allSource.includes(`'${eventType}'`)) return false;
        // Builders construct a family from one template: `page.${op}`.
        const family = eventType.split('.')[0];
        return !new RegExp('`' + family + '\\.\\$\\{').test(allSource);
      });

    expect(missing).toEqual([]);
  });

  test('a type declared unemitted must say why', () => {
    const unexplained = Object.entries(AUDIT_EVENT_TYPES)
      .filter(([, spec]) => !spec.emitted && !spec.note)
      .map(([eventType]) => eventType);

    expect(unexplained).toEqual([]);
  });

  test('every type follows the {target}.{action} convention', () => {
    const offenders = auditEventTypes().filter((t) => !/^[a-z]+(\.[a-z][a-z-]*)+$/.test(t));
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

describe('history stays readable after the rename (#1115)', () => {
  test('a legacy record maps forward to its canonical name', () => {
    expect(canonicalEventTypeOf({ eventType: 'security_event' })).toBe('security.event');
    expect(canonicalEventTypeOf({ eventType: 'share_access' })).toBe('share.access');
    expect(canonicalEventTypeOf({ eventType: 'share_revoke' })).toBe('share.revoke');
  });

  test('a legacy authentication row keeps its outcome', () => {
    // Flattening all three to one name would lose exactly the distinction an
    // operator is filtering for.
    expect(canonicalEventTypeOf({ eventType: 'authentication', result: 'failure' })).toBe('authentication.failed');
    expect(canonicalEventTypeOf({ eventType: 'authentication', result: 'logout' })).toBe('authentication.logout');
    expect(canonicalEventTypeOf({ eventType: 'authentication', result: 'success' })).toBe('authentication.success');
  });

  test('a legacy access_decision row keeps allow versus deny', () => {
    expect(canonicalEventTypeOf({ eventType: 'access_decision', result: 'deny' })).toBe('authorization.deny');
    expect(canonicalEventTypeOf({ eventType: 'access_decision', result: 'allow' })).toBe('authorization.allow');
  });

  test('an already-canonical name is returned unchanged', () => {
    expect(canonicalEventTypeOf({ eventType: 'page.edit' })).toBe('page.edit');
  });

  test('an unknown type is surfaced as itself, not guessed at', () => {
    // Silently renaming something we do not understand is how a log stops
    // being evidence.
    expect(canonicalEventTypeOf({ eventType: 'addon.something' })).toBe('addon.something');
    expect(canonicalEventTypeOf({})).toBe('');
  });

  test('a filter widens to the legacy names that can produce it', () => {
    expect(legacyTypesFor('security.event')).toEqual(['security_event']);
    expect(legacyTypesFor('authentication.failed')).toEqual(['authentication']);
    expect(legacyTypesFor('authorization.deny')).toEqual(['access_decision']);
  });

  test('a canonical type with no history under another name widens to nothing', () => {
    // The read path uses this to avoid dropping the provider-side filter and
    // reading the whole log on every query.
    expect(legacyTypesFor('page.edit')).toEqual([]);
    expect(legacyTypesFor('token.mint')).toEqual([]);
  });
});
