/**
 * #2038 — PersonManager was renamed IdentityManager. For one release the old
 * name is still answered: `getManager('PersonManager')` returns the manager
 * registered as `IdentityManager` and warns once, naming the caller. The
 * registry holds only the new name.
 */
import Engine, { MANAGER_ALIASES } from '../Engine';
import logger from '../../utils/logger';
import type BaseManager from '../../managers/BaseManager';

const identityManager = { name: 'IdentityManager' } as unknown as BaseManager;

function engineWithIdentityManager(): Engine {
  const engine = new Engine();
  engine.registerManager('IdentityManager', identityManager);
  return engine;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('#2038 the PersonManager alias', () => {
  test('PersonManager is an alias of IdentityManager', () => {
    expect(MANAGER_ALIASES.get('PersonManager')).toBe('IdentityManager');
  });

  test('getManager(\'PersonManager\') returns the same manager as getManager(\'IdentityManager\')', () => {
    const engine = engineWithIdentityManager();
    expect(engine.getManager('IdentityManager')).toBe(identityManager);
    expect(engine.getManager('PersonManager')).toBe(identityManager);
  });

  test('the old name warns once per engine, naming the caller; the new name never warns', () => {
    const warn = vi.spyOn(logger, 'warn');
    const engine = engineWithIdentityManager();
    engine.getManager('IdentityManager');
    expect(warn).not.toHaveBeenCalled();
    engine.getManager('PersonManager');
    engine.getManager('PersonManager');
    engine.getManager('PersonManager');
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain("getManager('PersonManager') is deprecated");
    expect(message).toContain("'IdentityManager'");
    // The caller is the first frame outside the engine: this test file.
    expect(message).toMatch(/Engine\.managerAlias\.test\.ts/);
  });

  test('the registry lists only the new name, so nothing sees the manager twice', () => {
    expect(engineWithIdentityManager().getRegisteredManagers()).toEqual(['IdentityManager']);
  });

  test('an unknown name is still undefined, and an alias with nothing registered is undefined', () => {
    expect(engineWithIdentityManager().getManager('NoSuchManager')).toBeUndefined();
    expect(new Engine().getManager('PersonManager')).toBeUndefined();
  });

  test('a manager actually registered under an old name wins over the alias (a test engine, an older add-on)', () => {
    const engine = new Engine();
    const own = { name: 'own' } as unknown as BaseManager;
    engine.registerManager('PersonManager', own);
    engine.registerManager('IdentityManager', identityManager);
    expect(engine.getManager('PersonManager')).toBe(own);
  });
});
