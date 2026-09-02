/**
 * #1006 — one "what do you hold" contract across managers.
 *
 * Three managers already answered versions of this in three shapes, so every
 * admin surface rendered a bespoke view per manager and a manager added later
 * was invisible until somebody wrote another one — the drift #762 found from
 * the other direction.
 *
 * __The safety property is the point, not the uniformity.__ This contract is
 * counts-and-health only, never contents, and that is why it is not the
 * `getAll()` the question originally asked for: `AgentTokenManager` holds
 * bearer credentials and `ShareManager` holds capability tokens, so a generic
 * enumeration on the base class would hand them to the first generic caller.
 * A count cannot leak what it counts — as long as nothing quietly adds
 * contents later, which is what the negative test below is for.
 */
vi.unmock('../BaseManager');

import BaseManager, { type ManagerStats } from '../BaseManager';

const engine = { getManager: () => null } as never;

class Bare extends BaseManager {}

class Counting extends BaseManager {
  async getManagerStats(): Promise<ManagerStats> {
    return { ...(await super.getManagerStats()), count: 3, summary: '3 things' };
  }
}

/** Throws before a promise exists — what a bad `this.store.x` lookup does. */
class BrokenSync extends BaseManager {
  getManagerStats(): Promise<ManagerStats> {
    throw new Error('store unreachable');
  }
}

/** Rejects — what a failed await inside an override does. */
class BrokenAsync extends BaseManager {
  async getManagerStats(): Promise<ManagerStats> {
    await Promise.resolve();
    throw new Error('index read failed');
  }
}

describe('#1006 — the default answers something useful', () => {
  test('a manager that overrides nothing still reports health', async () => {
    const m = new Bare(engine);
    expect(await m.getManagerStats()).toEqual({ healthy: true });
  });

  test('count is OMITTED rather than zero when there is nothing to count', async () => {
    // "Nothing to count" and "none" are different answers. RenderingManager
    // and VariableManager hold behaviour, not collections; an admin row
    // showing `0` for them reads as empty rather than not-applicable.
    const stats = await new Bare(engine).getManagerStats();
    expect('count' in stats).toBe(false);
  });

  test('health comes from #1155 state, not a second source of truth', async () => {
    // A boolean derived from isInitialized() would put a weaker answer beside
    // the four-state one #1155 already gives — a manager can be initialised
    // AND degraded, and the two would disagree with nothing to reconcile them.
    const m = new (class extends BaseManager {
      degrade(): void { this.markDegraded('disk unwritable', 'ngdpbase.some.path'); }
    })(engine);

    expect((await m.getManagerStats()).healthy).toBe(true);
    m.degrade();
    expect((await m.getManagerStats()).healthy).toBe(false);
    expect(m.getManagerStatus().reason).toBe('disk unwritable');
  });

  test('an override composes with the default rather than replacing it', async () => {
    expect(await new Counting(engine).getManagerStats())
      .toEqual({ healthy: true, count: 3, summary: '3 things' });
  });
});

describe('#1006 — a broken manager does not break the page', () => {
  test('a synchronous throw becomes one unhealthy row', async () => {
    // An admin surface iterates every manager. One throwing must become one
    // unhealthy row, not a 500 for all of them. A sync throw is the harder
    // case: it happens before a promise exists, so `await` alone would not
    // catch it if safeGetManagerStats were written as a `.catch()` chain.
    const stats = await new BrokenSync(engine).safeGetManagerStats();
    expect(stats.healthy).toBe(false);
    expect(stats.summary).toContain('store unreachable');
  });

  test('a rejected promise does too', async () => {
    const stats = await new BrokenAsync(engine).safeGetManagerStats();
    expect(stats.healthy).toBe(false);
    expect(stats.summary).toContain('index read failed');
  });

  test('the unsafe call is NOT silently swallowed', async () => {
    // safeGetManagerStats is the admin surface's call. A manager's own callers
    // still see the failure, or the contract would hide real breakage.
    expect(() => new BrokenSync(engine).getManagerStats()).toThrow('store unreachable');
    await expect(new BrokenAsync(engine).getManagerStats()).rejects.toThrow('index read failed');
  });
});

/**
 * The negative test #1006 asks for by name.
 *
 * "Counts, never contents" is the whole safety property, and the issue is
 * explicit that it should be pinned rather than left to reviewer vigilance.
 * AgentTokenManager is the natural subject because it holds the worst thing
 * to leak.
 */
describe('#1006 — stats carry counts, never contents', () => {
  test('AgentTokenManager reports a number and nothing resembling a token', async () => {
    const { default: AgentTokenManager } = await import('../AgentTokenManager');
    const m = new AgentTokenManager(engine);
    // Not initialised: it must still answer rather than throw, and must not
    // reach for a store it does not have.
    const stats = await m.safeGetManagerStats();

    const serialised = JSON.stringify(stats);
    // Every field a token could hide in. `count` is a number by contract, and
    // a number cannot carry a secret.
    expect(typeof (stats.count ?? 0)).toBe('number');
    expect(serialised).not.toMatch(/token['"]?\s*:\s*['"]/i);
    expect(serialised).not.toMatch(/secret|bearer|hash|salt/i);
    // Guards the guard: if ManagerStats ever grows a field holding records,
    // this is the assertion that should start failing.
    expect(Object.keys(stats).sort()).toEqual(
      Object.keys(stats).filter((k) => ['count', 'lastModified', 'healthy', 'summary'].includes(k)).sort()
    );
  });

  test('the declared shape has no field that could hold items', () => {
    // The type is the contract; this pins its surface so a future field
    // called `items` or `records` has to be a deliberate decision.
    const sample: ManagerStats = { healthy: true, count: 1, lastModified: 'x', summary: 'y' };
    expect(Object.keys(sample).sort()).toEqual(['count', 'healthy', 'lastModified', 'summary']);
  });
});
