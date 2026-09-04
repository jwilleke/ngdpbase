/**
 * #1200 — the audit event registry is configuration, and the code agrees with it.
 *
 * #1120 derived the required set from the permission registry and proved
 * emission by test rather than by grepping. #1200 moves the declarations into
 * `ngdpbase.audit.events`; these are the same "check that fails", re-pointed:
 * every declared-and-enabled event has an emitter, every declaration carries
 * an on-failure rule and a description, a custom configuration is honoured, and an
 * unbound or undeclared lookup is never silent.
 */
import fs from 'fs';
import path from 'path';
import {
  AUDIT_EVENTS_KEY,
  auditEventDeclarations,
  auditEventTypes,
  bindAuditEvents,
  refuseOnFailureEventTypes,
  disabledEventTypes,
  isAuditEventEnabled,
  refusesOnFailure,
  requiredEventTypes
} from '../auditRegistry';
import logger from '../logger';

const SRC = path.join(process.cwd(), 'src');
const shipped = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'config', 'app-default-config.json'), 'utf8')
) as Record<string, unknown>;
const shippedEvents = shipped[AUDIT_EVENTS_KEY] as Record<string, { 'on-failure': string; enabled?: boolean; description: string }>;

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

const allSource = sourceFiles().filter((f) => !f.endsWith('auditEventNames.ts')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');

/** Emitted means an `AUDIT_EVENT.KEY` reference somewhere in src/ resolves to this name (#1201). */
function isEmitted(eventType: string): boolean {
  const key = eventType.toUpperCase().replace(/-/g, '_');
  return new RegExp('AUDIT_EVENT\\.' + key + '\\b').test(allSource);
}

const bindShipped = () => bindAuditEvents((key, d) => (key === AUDIT_EVENTS_KEY ? shipped[key] : d));

beforeEach(bindShipped);
afterEach(bindShipped);

describe('#1200 the registry is configuration', () => {
  it('ships a map with every event the code emits', () => {
    expect(Object.keys(shippedEvents).length).toBeGreaterThan(30);
    expect(auditEventTypes()).toEqual(Object.keys(shippedEvents).sort());
  });

  it.each(Object.keys(shippedEvents))('%s declares an on-failure rule and a description', (eventType) => {
    const d = auditEventDeclarations()[eventType];
    expect(['refuse', 'continue']).toContain(d['on-failure']);
    expect(d.description).toBeTruthy();
  });

  it.each(requiredEventTypes())('%s has an emitter in src/', (eventType) => {
    // A declared, enabled requirement with no producer is a claim the system
    // does not meet.
    expect(isEmitted(eventType)).toBe(true);
  });

  it('a switched-off event is a decision on the record, with a reason', () => {
    const off = disabledEventTypes();
    expect(off.map((e) => e.eventType)).toContain('asset-read');
    for (const e of off) expect(e.description).toBeTruthy();
    expect(requiredEventTypes()).not.toContain('asset-read');
    expect(isAuditEventEnabled('asset-read')).toBe(false);
  });

  it('the refuse-on-failure set is the one configuration declares', () => {
    expect(refusesOnFailure('token-mint')).toBe(true);
    expect(refusesOnFailure('page-edit')).toBe(false);
    expect(refuseOnFailureEventTypes()).toEqual(
      Object.entries(shippedEvents).filter(([, d]) => d['on-failure'] === 'refuse' && d.enabled !== false).map(([n]) => n).sort()
    );
  });
});

describe('#1200 configuration is authoritative', () => {
  it('a custom configuration relaxing refuse to continue is honoured', () => {
    // The operator may narrow what the system claims to audit; that is the
    // point, not the objection. The narrowing is itself audited elsewhere.
    const custom = { ...shippedEvents, 'page-delete': { ...shippedEvents['page-delete'], 'on-failure': 'continue' } };
    bindAuditEvents((key, d) => (key === AUDIT_EVENTS_KEY ? custom : d));
    expect(refusesOnFailure('page-delete')).toBe(false);
    expect(refusesOnFailure('token-mint')).toBe(true);
  });

  it('a custom configuration removing an entry with null removes it', () => {
    const custom = { ...shippedEvents, 'share-access': null };
    bindAuditEvents((key, d) => (key === AUDIT_EVENTS_KEY ? custom : d));
    expect(auditEventTypes()).not.toContain('share-access');
  });
});

describe('#1200 nothing fails silently', () => {
  it('an unbound registry says so once and treats everything as continue', () => {
    bindAuditEvents(null);
    vi.mocked(logger.warn).mockClear();
    expect(refusesOnFailure('token-mint')).toBe(false);
    expect(refusesOnFailure('page-delete')).toBe(false);
    const said = vi.mocked(logger.warn).mock.calls.filter(([m]) => String(m).includes('not bound'));
    expect(said).toHaveLength(1);
  });

  it('an emitted name configuration does not declare is said once', () => {
    vi.mocked(logger.warn).mockClear();
    expect(refusesOnFailure('addon-sneaky')).toBe(false);
    expect(refusesOnFailure('addon-sneaky')).toBe(false);
    const said = vi.mocked(logger.warn).mock.calls.filter(([m]) => String(m).includes("'addon-sneaky'"));
    expect(said).toHaveLength(1);
  });

});

describe('#1203 the read switch lives on the event, and the map is a posture ingredient', () => {
  it('the retired key is gone from the shipped configuration', () => {
    expect('ngdpbase.audit.read-events' in shipped).toBe(false);
  });

  it('page-read ships switched off', () => {
    expect(shippedEvents['page-read'].enabled).toBe(false);
    expect(isAuditEventEnabled('page-read')).toBe(false);
  });

  it('ngdpbase.audit.events is declared in the security posture, and the retired key is not', () => {
    // So an on-failure or switch change is reported by posture-recorded at the next
    // boot: narrowing what is recorded is on the record.
    const posture = shipped['ngdpbase.security.posture'] as Record<string, { group?: string; restart?: boolean }>;
    expect(posture[AUDIT_EVENTS_KEY]).toEqual({ group: 'Audit', restart: false });
    expect('ngdpbase.audit.read-events' in posture).toBe(false);
  });
});
