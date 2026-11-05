/**
 * The write door's deciders, allowing every write (#1815).
 *
 * `PageManager.savePage` and `deletePage` decide every write themselves, and
 * without a PolicyInformationPoint and a PolicyDecisionPoint nothing is
 * writable. A test whose subject is not who may write — storage, indexes,
 * metadata normalisation, migrations — adds these to its engine so the door
 * lets its writes through. A test about who may write uses the real deciders,
 * or stand-ins that refuse, never these.
 *
 * Spread them into a test's managers map, or ask {@link withWriteDoorAllowing}
 * to wrap an engine's `getManager`. A test that already stands in a PIP or PDP
 * of its own merges the methods it lacks from {@link ALLOWING_PIP} /
 * {@link ALLOWING_PDP}.
 */

/** The system principal's name in these stand-ins. */
export const TEST_SYSTEM_PRINCIPAL = 'system';

/** A PIP whose page decisions all allow. */
export const ALLOWING_PIP = {
  canUserAccessPage: async (): Promise<boolean> => true,
  pageAffordanceFor: async (): Promise<boolean> => true,
  audienceAdmits: async (): Promise<boolean> => true,
  isSystemPrincipal: (username: string): boolean => username === TEST_SYSTEM_PRINCIPAL,
  systemPrincipalName: (): string => TEST_SYSTEM_PRINCIPAL
};

/** A PDP that permits everything. */
export const ALLOWING_PDP = {
  decide: async (): Promise<{ permit: boolean; applicable: boolean; reason: string }> => ({ permit: true, applicable: true, reason: 'test' }),
  permits: async (): Promise<boolean> => true
};

/** The two deciders, for a test's managers map. */
export function allowingWriteDoor(): { PolicyInformationPoint: typeof ALLOWING_PIP; PolicyDecisionPoint: typeof ALLOWING_PDP } {
  return { PolicyInformationPoint: { ...ALLOWING_PIP }, PolicyDecisionPoint: { ...ALLOWING_PDP } };
}

/**
 * `getManager` answering the allowing deciders where `getManager` itself has
 * none, and everything else as before.
 */
export function withWriteDoorAllowing<T>(getManager: (name: string) => T): (name: string) => T {
  const door = allowingWriteDoor() as Record<string, unknown>;
  return (name: string) => (getManager(name) ?? door[name] ?? null) as T;
}
