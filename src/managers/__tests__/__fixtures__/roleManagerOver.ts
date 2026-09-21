/**
 * A real RoleManager over a test's own storage stub (#1431 step 12).
 *
 * Who holds which role is RoleManager's: reading a user's roles, adding and
 * removing members. Tests used to stub RoleManager's storage calls
 * (`listByMember`, `getByOrgAndPosition`, `create`, `update`) and drive the
 * membership logic through UserManager. That logic now lives in RoleManager,
 * so a test keeps its stub and gets the real membership code on top of it.
 *
 * `engine` must be the engine the RoleManager is registered in: membership
 * looks up PersonManager and OrganizationManager through it.
 */
import RoleManager from '../../RoleManager';
import type { WikiEngine } from '../../../types/WikiEngine';

type RoleStorage = Partial<Pick<RoleManager,
  'listByMember' | 'getByOrgAndPosition' | 'create' | 'update' | 'delete' | 'list' | 'getById'
>>;

export function roleManagerOver(engine: object, storage: RoleStorage): RoleManager {
  const roleManager = new RoleManager(engine as WikiEngine);
  Object.assign(roleManager, storage);
  return roleManager;
}
