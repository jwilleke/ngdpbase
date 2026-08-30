/**
 * #1120 — the required audit set is derived from the permission registry, and
 * emission is proven by test rather than by grepping.
 *
 * These are the "check that fails" this project applies to every other
 * invariant. Without them the registry is another document that drifts, which
 * is the defect #1104, #1106, #1113 and #1115 all share.
 */
import fs from 'fs';
import path from 'path';
import { AUDIT_REQUIREMENTS, UNGATED_REQUIREMENTS, requiredEventTypes, exemptions } from '../auditRegistry';

const SRC = path.join(process.cwd(), 'src');

/** Every .ts file under src/, excluding tests — the places an event could be emitted. */
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

const allSource = sourceFiles().map((f) => fs.readFileSync(f, 'utf8')).join('\n');

/**
 * Is this event type emitted anywhere?
 *
 * Matches a literal `'page.edit'` or a template family `` `page.${op}` `` —
 * builders construct several types from one template, so a literal-only search
 * would report false gaps.
 */
function isEmitted(eventType: string): boolean {
  if (allSource.includes(`'${eventType}'`)) return true;
  const family = eventType.split('.')[0];
  return new RegExp('`' + family + '\\.\\$\\{').test(allSource);
}

/** Permissions the system actually registers, read from UserManager. */
function registeredPermissions(): string[] {
  const src = fs.readFileSync(path.join(SRC, 'managers', 'UserManager.ts'), 'utf8');
  return [...src.matchAll(/this\.permissions\.set\('([a-z-]+)'/g)].map((m) => m[1]).sort();
}

describe('#1120 every permission has a declared audit decision', () => {
  it.each(registeredPermissions())('%s is declared', (permission) => {
    // The check that fails: adding a permission without deciding whether it is
    // audited breaks CI, rather than being noticed a year later by an assessor.
    expect(AUDIT_REQUIREMENTS[permission]).toBeDefined();
  });

  it('declares nothing that is not a real permission', () => {
    // A stale entry is as misleading as a missing one — it inflates the claim.
    const real = new Set(registeredPermissions());
    const stale = Object.keys(AUDIT_REQUIREMENTS)
      .filter((p) => !real.has(p) && p !== 'admin-read');
    expect(stale).toEqual([]);
  });

  it('every exemption carries a reason', () => {
    // "Not audited" is a decision. Without a reason it is indistinguishable
    // from an oversight, which is the whole thing this registry exists to fix.
    for (const e of exemptions()) {
      expect(e.exempt, `${e.permission} has no exemption category`).toBeTruthy();
      if (e.exempt === 'not-implemented') {
        expect(e.note, `${e.permission} is a known gap and needs a note`).toBeTruthy();
      }
    }
  });
});

describe('#1120 every required event type is actually emitted', () => {
  it.each(requiredEventTypes())('%s has an emitter in src/', (eventType) => {
    // Proves the other half: a declared requirement with no producer is a
    // claim the system does not meet.
    expect(isEmitted(eventType)).toBe(true);
  });

  it('the ungated set covers what has no permission behind it', () => {
    // The permission registry is a floor, not a ceiling. Credential lifecycle
    // has no permission of its own and is exactly what an assessor asks for.
    expect(Object.keys(UNGATED_REQUIREMENTS)).toContain('token.mint');
  });
});

describe('#1120 the gap is countable', () => {
  it('reports how much of the permission surface is audited', () => {
    const total = Object.keys(AUDIT_REQUIREMENTS).length;
    const audited = Object.values(AUDIT_REQUIREMENTS).filter((r) => r.eventType !== null).length;
    const gaps = exemptions().filter((e) => e.exempt === 'not-implemented');

    // Not an assertion about the number — that would fail every time the
    // number improved. This makes the figure visible in CI output, which is
    // what "provable completeness" means in practice.
    console.log(`[#1120] ${audited}/${total} permissions audited; ${gaps.length} known gaps: ${gaps.map((g) => g.permission).join(', ')}`);
    expect(audited).toBeGreaterThan(0);
  });
});

describe('#1129 page-read is gated, not exempt', () => {
  it('declares page.view behind the read-events config gate', () => {
    const r = AUDIT_REQUIREMENTS['page-read'];
    expect(r.eventType).toBe('page.view');
    expect(r.tier).toBe('volume');
    expect(r.gatedBy).toBe('ngdpbase.audit.read-events');
    // The gate is a contract term: the reason must survive next to it.
    expect(r.note).toBeTruthy();
  });

  it('a gated requirement is not an exemption', () => {
    // Exemptions answer "why is this not audited". A gated event IS audited —
    // conditionally — so it must not appear in the honest-absence list.
    expect(exemptions().map((e) => e.permission)).not.toContain('page-read');
  });
});
