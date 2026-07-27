/**
 * @file gitguardian-bridge.test.ts
 * @description #811 — GitGuardian → GitHub issue bridge.
 *
 * Covers every unit-test bullet the issue lists: payload parsing, repo
 * resolution, dedup-key logic and signature verification. The bridge core does
 * no network I/O precisely so these can run without a GitGuardian account —
 * credentials are the only part of #811 that cannot be built ahead of time.
 */
import { createHmac } from 'node:crypto';
import {
  verifySignature,
  parseIncident,
  renderIssue,
  decideAction,
  buildSearchQuery,
  incidentMarker
} from '../gitguardianBridge';

const SECRET = 'webhook-signing-secret';
const sign = (body: string, secret = SECRET) =>
  createHmac('sha256', secret).update(body, 'utf8').digest('hex');

const INCIDENT = {
  id: 'inc-42',
  detector: 'AWS Keys',
  repository: 'jwilleke/ngdpbase',
  filePath: 'src/config.ts',
  commitSha: 'abc1234',
  url: 'https://dashboard.gitguardian.com/incidents/42'
};

describe('#811 signature verification', () => {
  test('accepts a correct signature', () => {
    const body = '{"incident":{"id":"1"}}';
    expect(verifySignature(body, sign(body), SECRET)).toBe(true);
  });

  test('accepts the sha256= prefixed form', () => {
    const body = '{"a":1}';
    expect(verifySignature(body, `sha256=${sign(body)}`, SECRET)).toBe(true);
  });

  test('rejects a signature made with the wrong secret', () => {
    const body = '{"a":1}';
    expect(verifySignature(body, sign(body, 'not-the-secret'), SECRET)).toBe(false);
  });

  test('rejects a tampered body', () => {
    const signature = sign('{"amount":1}');
    expect(verifySignature('{"amount":9}', signature, SECRET)).toBe(false);
  });

  test('rejects empty inputs rather than defaulting to trust', () => {
    expect(verifySignature('', sign('x'), SECRET)).toBe(false);
    expect(verifySignature('{}', '', SECRET)).toBe(false);
    expect(verifySignature('{}', sign('{}'), '')).toBe(false);
  });

  test('rejects a malformed non-hex signature without throwing', () => {
    expect(verifySignature('{}', 'zzzz', SECRET)).toBe(false);
  });
});

describe('#811 payload parsing', () => {
  test('reads a nested incident payload', () => {
    const parsed = parseIncident({ incident: { id: 'inc-1', detector: 'AWS Keys', repository: 'o/r' } });
    expect(parsed).toMatchObject({ id: 'inc-1', detector: 'AWS Keys', repository: 'o/r' });
  });

  test('reads a flat payload', () => {
    const parsed = parseIncident({ id: 'inc-2', detector: 'Slack Token', repository: 'o/r' });
    expect(parsed?.id).toBe('inc-2');
  });

  test('joins a separate owner and repo name', () => {
    const parsed = parseIncident({ id: 'i', owner: 'jwilleke', repository_name: 'ngdpbase' });
    expect(parsed?.repository).toBe('jwilleke/ngdpbase');
  });

  test('refuses a bare repo name with no owner', () => {
    // Guessing the owner would file the issue against whichever repo matched.
    expect(parseIncident({ id: 'i', repository_name: 'ngdpbase' })).toBeNull();
  });

  test('returns null on unusable payloads instead of throwing', () => {
    // A malformed delivery must be dropped, not crash a receiver handling
    // other repositories' incidents.
    expect(parseIncident(null)).toBeNull();
    expect(parseIncident('nonsense')).toBeNull();
    expect(parseIncident({ repository: 'o/r' })).toBeNull();
    expect(parseIncident({ id: 'i' })).toBeNull();
  });

  test('falls back to a readable detector when absent', () => {
    expect(parseIncident({ id: 'i', repository: 'o/r' })?.detector).toBe('unknown detector');
  });
});

describe('#811 issue rendering', () => {
  test('never reproduces the secret', () => {
    // The rule the whole feature turns on: an issue is read by more people than
    // the GitGuardian console, so echoing the credential widens the leak.
    const withSecret = {
      ...INCIDENT,
      // Fields a future GitGuardian payload might carry.
      match: 'AKIAIOSFODNN7EXAMPLE',
      secret: 'AKIAIOSFODNN7EXAMPLE'
    } as never;
    const { title, body } = renderIssue(withSecret);
    expect(body).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(title).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  test('carries the dedup marker', () => {
    expect(renderIssue(INCIDENT).body).toContain(incidentMarker('inc-42'));
  });

  test('includes the safe context fields', () => {
    const { title, body } = renderIssue(INCIDENT);
    expect(title).toContain('AWS Keys');
    expect(body).toContain('src/config.ts');
    expect(body).toContain('abc1234');
    expect(body).toContain('dashboard.gitguardian.com');
  });

  test('omits optional fields cleanly when absent', () => {
    const { body } = renderIssue({ id: 'i', detector: 'D', repository: 'o/r' });
    expect(body).not.toContain('**File:**');
    expect(body).not.toContain('**Commit:**');
    expect(body).toContain(incidentMarker('i'));
  });

  test('tells the reader to rotate first', () => {
    expect(renderIssue(INCIDENT).body).toContain('Revoke and rotate');
  });
});

describe('#811 dedup and lifecycle', () => {
  test('creates an issue for a new incident', () => {
    const action = decideAction('incident.created', INCIDENT, null);
    expect(action.kind).toBe('create');
    if (action.kind === 'create') expect(action.labels).toEqual(['security', 'secret-leak']);
  });

  test('a re-delivered create does NOT open a second issue', () => {
    // Webhooks retry. This is the case that produces duplicate noise if wrong.
    const action = decideAction('incident.created', INCIDENT, { number: 7, state: 'open' });
    expect(action.kind).toBe('noop');
  });

  test('a create against a closed issue reopens it', () => {
    const action = decideAction('incident.created', INCIDENT, { number: 7, state: 'closed' });
    expect(action.kind).toBe('reopen');
  });

  test('resolved closes the open issue', () => {
    const action = decideAction('incident.resolved', INCIDENT, { number: 7, state: 'open' });
    expect(action.kind).toBe('comment-and-close');
  });

  test('resolved with no issue is a no-op', () => {
    // Opening an issue purely to close it is noise.
    expect(decideAction('incident.resolved', INCIDENT, null).kind).toBe('noop');
  });

  test('resolved twice does not re-close', () => {
    expect(decideAction('incident.resolved', INCIDENT, { number: 7, state: 'closed' }).kind).toBe('noop');
  });

  test('reopened reopens a closed issue and creates when none exists', () => {
    expect(decideAction('incident.reopened', INCIDENT, { number: 7, state: 'closed' }).kind).toBe('reopen');
    expect(decideAction('incident.reopened', INCIDENT, null).kind).toBe('create');
  });

  test('an unknown event is ignored, not guessed at', () => {
    const action = decideAction('incident.exploded', INCIDENT, null);
    expect(action.kind).toBe('noop');
    if (action.kind === 'noop') expect(action.reason).toContain('unhandled event');
  });
});

describe('#811 issue lookup', () => {
  test('searches the marker, not the title', () => {
    // Two incidents can render the same title — the same credential leaking in
    // two files — so title matching would collapse them into one issue.
    const q = buildSearchQuery('jwilleke/ngdpbase', 'inc-42');
    expect(q).toContain('repo:jwilleke/ngdpbase');
    expect(q).toContain('in:body');
    expect(q).toContain(incidentMarker('inc-42'));
  });
});
