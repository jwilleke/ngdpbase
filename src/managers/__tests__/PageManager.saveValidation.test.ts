/**
 * Save-time content validation lives in PageManager (#1037).
 *
 * It used to live in route handlers, which meant it applied to whichever
 * handlers remembered to add the eight-line block. `POST /save/:page` had it;
 * `POST /create` — the header's "Create New Page" — did not, and neither did
 * `POST /api/page/ingest`. Both omissions were invisible: nothing failed, and
 * the endpoints worked perfectly.
 *
 * Every write path reaches PageManager, so the gate belongs here. These tests
 * pin that, and pin the opt-out that keeps startup safe.
 */

import PageManager, { PageContentValidationError } from '../PageManager';

const ERROR = {
  filterId: 'security',
  rule: 'no-script-tags',
  severity: 'error' as const,
  message: 'Inline <script> is not allowed',
  line: 3
};

function makeManager(errors: unknown[] = []) {
  const provider = { savePage: vi.fn().mockResolvedValue(undefined) };
  const validationManager = {
    collectContentErrors: vi.fn().mockResolvedValue(errors),
    checkConflicts: vi.fn().mockResolvedValue({ hasConflict: false })
  };
  const manager = new PageManager({
    getManager: (n: string) => (n === 'ValidationManager' ? validationManager : null)
  });
  (manager as unknown as { provider: unknown }).provider = provider;
  return { manager, provider, validationManager };
}

describe('PageManager.savePage — the chokepoint (#1037)', () => {
  test('refuses content that breaks a rule, and writes nothing', async () => {
    const { manager, provider } = makeManager([ERROR]);

    await expect(manager.savePage('Bad', '<script>alert(1)</script>')).rejects.toThrow(
      PageContentValidationError
    );
    expect(provider.savePage).not.toHaveBeenCalled();
  });

  test('carries the structured violations so a route can answer 400', async () => {
    // Without these, a caller can only produce a generic 500 — which is what
    // made moving the gate risky, and why the error is typed.
    const { manager } = makeManager([ERROR]);

    await manager.savePage('Bad', '<script>x</script>').catch((err: unknown) => {
      expect(err).toBeInstanceOf(PageContentValidationError);
      expect((err as PageContentValidationError).validationErrors).toEqual([ERROR]);
    });
    expect.hasAssertions();
  });

  test('clean content saves', async () => {
    const { manager, provider } = makeManager([]);

    await manager.savePage('Good', '# Fine');

    expect(provider.savePage).toHaveBeenCalledTimes(1);
  });
});

describe('the skipValidation opt-out (#1037)', () => {
  test('trusted content bypasses the gate entirely', async () => {
    // Addon page seeding and generated profile pages run at startup. A rule
    // aimed at user input must never be able to stop the instance booting.
    const { manager, provider, validationManager } = makeManager([ERROR]);

    await manager.savePage('Seeded', '<script>from the addon</script>', {}, { skipValidation: true });

    expect(validationManager.collectContentErrors).not.toHaveBeenCalled();
    expect(provider.savePage).toHaveBeenCalledTimes(1);
  });

  test('is opt-IN — omitting options validates', async () => {
    // The default must be the safe one. If this ever inverts, every caller
    // silently stops being checked.
    const { manager, validationManager } = makeManager([]);

    await manager.savePage('Ordinary', '# Hello');

    expect(validationManager.collectContentErrors).toHaveBeenCalled();
  });
});

describe('validation failures never become save failures (#1037)', () => {
  test('a broken ValidationManager does not block the save', async () => {
    // Turning an infrastructure fault into a refused edit would be worse than
    // the rule going unenforced for one save.
    const { manager, provider } = makeManager([]);
    (manager as unknown as { engine: { getManager: (n: string) => unknown } }).engine = {
      getManager: (n: string) =>
        n === 'ValidationManager'
          ? {
            collectContentErrors: vi.fn().mockRejectedValue(new Error('boom')),
            checkConflicts: vi.fn().mockResolvedValue({ hasConflict: false })
          }
          : null
    };

    await manager.savePage('Page', '# Hi');

    expect(provider.savePage).toHaveBeenCalledTimes(1);
  });

  test('no ValidationManager at all is not an error', async () => {
    const provider = { savePage: vi.fn().mockResolvedValue(undefined) };
    const manager = new PageManager({ getManager: () => null });
    (manager as unknown as { provider: unknown }).provider = provider;

    await manager.savePage('Page', '# Hi');

    expect(provider.savePage).toHaveBeenCalledTimes(1);
  });
});
