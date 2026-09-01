import { resolvePosture, POSTURE_KEY } from '../securityPosture';

/**
 * #1145 — the security posture is a VIEW over existing settings (D3).
 *
 * It adds no resolution step and changes no value. It decides which settings
 * are presented as one subject and shows what each is currently set to.
 */
describe('#1145 — resolvePosture', () => {
  const reader = (values: Record<string, unknown>) =>
    (key: string, fallback?: unknown) => (key in values ? values[key] : fallback);

  const posture = {
    'ngdpbase.session.secure': { group: 'Session and cookie', restart: true },
    'ngdpbase.application.registration': { group: 'Identity and registration', restart: false }
  };

  test('reports each ingredient with its current value', () => {
    const groups = resolvePosture(reader({
      [POSTURE_KEY]: posture,
      'ngdpbase.session.secure': true,
      'ngdpbase.application.registration': false
    }));
    const items = groups.flatMap((g) => g.items);
    expect(items.find((i) => i.key === 'ngdpbase.session.secure')?.value).toBe(true);
    expect(items.find((i) => i.key === 'ngdpbase.application.registration')?.value).toBe(false);
  });

  test('groups ingredients by their declared group', () => {
    const groups = resolvePosture(reader({ [POSTURE_KEY]: posture }));
    expect(groups.map((g) => g.group)).toEqual(['Identity and registration', 'Session and cookie']);
  });

  test('carries the restart flag through', () => {
    const groups = resolvePosture(reader({ [POSTURE_KEY]: posture }));
    const items = groups.flatMap((g) => g.items);
    expect(items.find((i) => i.key === 'ngdpbase.session.secure')?.restart).toBe(true);
    expect(items.find((i) => i.key === 'ngdpbase.application.registration')?.restart).toBe(false);
  });

  test('an entry set to null is removed from the view', () => {
    // How an operator removes an ingredient: deepMergeConfigs already honours
    // an explicit null, and removing changes no value — the key keeps what it
    // is set to and the code keeps reading it (D4).
    const groups = resolvePosture(reader({
      [POSTURE_KEY]: { ...posture, 'ngdpbase.session.secure': null }
    }));
    expect(groups.flatMap((g) => g.items).map((i) => i.key)).not.toContain('ngdpbase.session.secure');
  });

  test('a secret key is NEVER rendered, even if an operator adds it', () => {
    // The section would otherwise reintroduce the disclosure
    // ngdpbase.config.secret-keys exists to prevent (D15).
    const groups = resolvePosture(reader({
      [POSTURE_KEY]: { 'ngdpbase.session.secret': { group: 'Session and cookie' } },
      'ngdpbase.config.secret-keys': ['ngdpbase.session.secret'],
      'ngdpbase.session.secret': 'the-actual-secret-value'
    }));
    expect(JSON.stringify(groups)).not.toContain('the-actual-secret-value');
  });

  test('a secret ingredient is reported as present but masked, not silently dropped', () => {
    // Dropping it would make the section quietly incomplete. Saying "set, not
    // shown" is the honest answer.
    const groups = resolvePosture(reader({
      [POSTURE_KEY]: { 'ngdpbase.session.secret': { group: 'Session and cookie' } },
      'ngdpbase.config.secret-keys': ['ngdpbase.session.secret'],
      'ngdpbase.session.secret': 'the-actual-secret-value'
    }));
    const item = groups.flatMap((g) => g.items).find((i) => i.key === 'ngdpbase.session.secret');
    expect(item?.secret).toBe(true);
    expect(item?.value).toBeUndefined();
  });

  test('an absent or malformed posture yields nothing rather than throwing', () => {
    expect(resolvePosture(reader({}))).toEqual([]);
    expect(resolvePosture(reader({ [POSTURE_KEY]: 'not-an-object' }))).toEqual([]);
    expect(resolvePosture(reader({ [POSTURE_KEY]: ['a', 'b'] }))).toEqual([]);
  });

  test('an ingredient with no group is still shown, under Other', () => {
    // A hand-added entry missing its group must not vanish — the operator put
    // it there on purpose.
    const groups = resolvePosture(reader({
      [POSTURE_KEY]: { 'ngdpbase.some.key': {} },
      'ngdpbase.some.key': 42
    }));
    expect(groups[0].group).toBe('Other');
    expect(groups[0].items[0].value).toBe(42);
  });
});

describe('#1145 — the shipped posture is coherent', () => {
  const config = JSON.parse(
     
    require('fs').readFileSync('config/app-default-config.json', 'utf8')
  ) as Record<string, unknown>;
  const posture = config[POSTURE_KEY] as Record<string, { group?: string }>;

  test('every ingredient names a key that actually exists', () => {
    // D3/rule 5 made a check rather than an aspiration: a posture that lists a
    // key nothing reads is the #1118 defect class — a declared control with
    // nothing behind it.
    const missing = Object.keys(posture).filter((k) => !(k in config));
    expect(missing).toEqual([]);
  });

  test('no ingredient is a declared secret', () => {
    // Shipping one would render it in the admin section by default, which is
    // the disclosure ngdpbase.config.secret-keys exists to prevent.
    const secrets = new Set(config['ngdpbase.config.secret-keys'] as string[]);
    expect(Object.keys(posture).filter((k) => secrets.has(k))).toEqual([]);
  });

  test('every ingredient declares a group', () => {
    // An ungrouped ingredient still renders, under "Other" — but a SHIPPED one
    // landing there means somebody forgot, not that it belongs nowhere.
    const ungrouped = Object.entries(posture).filter(([, v]) => !v?.group);
    expect(ungrouped.map(([k]) => k)).toEqual([]);
  });
});
