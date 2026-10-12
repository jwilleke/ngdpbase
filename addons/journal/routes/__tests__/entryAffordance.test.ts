/**
 * #1668 — the journal entry view's Edit link is an affordance.
 *
 * `mayShowOnEntry` asks the PIP's cross-page affordance (`pageAffordanceFor`),
 * which records nothing, so an anonymous visitor reading a public entry writes
 * no `authorization-deny`. `mayOnEntry` is the door the editor and delete
 * routes ask; a refusal there is recorded, with the request's address.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mayOnEntry, mayShowOnEntry } from '../helpers.js';
import PolicyInformationPoint from '../../../../dist/src/security/PolicyInformationPoint.js';
import PolicyDecisionPoint from '../../../../dist/src/security/PolicyDecisionPoint.js';

const IP = '198.51.100.9';
const ENTRY = '2026-10-12 Entry 1 Journal jim';

let records: Array<Record<string, unknown>> = [];

function makeEngine() {
  const engine = {
    getManager: (name: string): unknown => {
      if (name === 'ConfigurationManager') return { getProperty: (_k: string, d: unknown) => d, isInitialized: () => true };
      if (name === 'PolicyEvaluator') {
        // A public entry: everyone reads it; only its author's role edits.
        return {
          evaluateAccess: async ({ userContext, action }: { userContext: { roles?: string[] }; action: string }) => {
            if (action === 'page-read') return { hasDecision: true, allowed: true, policyName: 'read-all' };
            if ((userContext.roles ?? []).includes('editor')) return { hasDecision: true, allowed: true, policyName: 'editors' };
            return { hasDecision: false, allowed: false, reason: 'no_match' };
          }
        };
      }
      if (name === 'PageManager') {
        return { getPageMetadata: async (id: string) => (id === ENTRY ? { title: ENTRY, author: 'jim', 'system-category': 'journal' } : null) };
      }
      if (name === 'PolicyDecisionPoint') return pdp;
      if (name === 'PolicyInformationPoint') return pip;
      if (name === 'AuditManager') return { logAuditEvent: async (e: Record<string, unknown>) => { records.push(e); return 'evt'; } };
      return undefined;
    }
  };
  const pdp = new PolicyDecisionPoint(engine);
  const pip = new PolicyInformationPoint(engine);
  return engine as never;
}

const anonymous = { username: 'Anonymous', roles: ['anonymous', 'All'], isAuthenticated: false, ipAddress: IP } as never;
const editor = { username: 'jim', roles: ['editor', 'Authenticated', 'All'], isAuthenticated: true, ipAddress: IP } as never;

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('journal entry Edit link: affordance, not door (#1668)', () => {
  let engine: ReturnType<typeof makeEngine>;
  beforeEach(() => {
    records = [];
    engine = makeEngine();
  });

  it('an anonymous view of a public entry hides Edit and writes no audit record', async () => {
    expect(await mayOnEntry(engine, anonymous, ENTRY, 'view')).toBe(true);
    expect(await mayShowOnEntry(engine, anonymous, ENTRY, 'edit')).toBe(false);
    await settle();
    expect(records).toHaveLength(0);
  });

  it('the edit door still records a refusal, with the request address', async () => {
    expect(await mayOnEntry(engine, anonymous, ENTRY, 'edit')).toBe(false);
    await settle();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ eventType: 'authorization-deny', resource: ENTRY, action: 'edit', ipAddress: IP });
  });

  it('affordance and door agree', async () => {
    for (const subject of [anonymous, editor]) {
      for (const action of ['edit', 'delete'] as const) {
        expect(await mayShowOnEntry(engine, subject, ENTRY, action)).toBe(await mayOnEntry(engine, subject, ENTRY, action));
      }
    }
    expect(await mayShowOnEntry(engine, editor, ENTRY, 'edit')).toBe(true);
  });
});
