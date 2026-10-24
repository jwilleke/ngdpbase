/**
 * #2018 — rule 6 of `scripts/check-context-discipline.ts` (`npm run lint:context`):
 * the identity-record and role lookups take the caller's context first, so a
 * call with one argument too few is the old, context-free call.
 *
 * Run over this repository it reports nothing; run over planted source it
 * names each context-free call, and leaves alone a provider's own lookups and
 * another manager's `getById`.
 *
 * Sabotaged (2026-10-24): `resolveUserRoles(username)` put back into
 * `src/security/PolicyInformationPoint.ts` → `npm run lint:context` exited 1
 * naming it, and "this repository has no context-free lookup" went red.
 */
import { contextFreeLookups, scan } from '../check-context-discipline';

describe('#2018 lint:context — no context-free lookup', () => {
  test('this repository has no context-free lookup', () => {
    expect(scan().filter((v) => v.rule === 'context-free-lookup').map((v) => `${v.file}:${v.line} ${v.detail}`)).toEqual([]);
  });

  test('a reintroduced context-free call is named, in core or an add-on', () => {
    const planted = [
      'const a = await personManager.getByUserIdentifier(username);',
      'const b = await roleManager.hasRole(username, roleName);',
      'const c = await this.engine.getManager(\'RoleManager\').resolveUserRoles(u.username);',
      'const d = await persons.getByIdentifier(\'alice\');',
      'const e = await orgs.getById(organization);',
      'const f = await assetManager.getById(id, providerId);'
    ].join('\n');
    const found = contextFreeLookups('addons/x/index.ts', planted);
    expect(found.map((v) => v.line).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(found.every((v) => v.rule === 'context-free-lookup')).toBe(true);
    // Line 6, AssetManager.getById(id, providerId), has as many arguments as a call with the
    // context and no provider id, so a count cannot tell them apart; the compiler does, in src/.
  });

  test('calls with the context, a provider\'s own lookups and another manager\'s getById are left alone', () => {
    const fine = [
      'await roleManager.hasRole(ctx, username, \'admin\');',
      'await roleManager?.resolveUserRoles(systemContext(engine, \'why, and more\'), name);',
      'await personManager.getByIdentifier(ctx, username);',
      'await this.requireProvider().getByIdentifier(identifier);',
      'await provider.getById(id);',
      'await this.provider.getByIdentifier(id);',
      'const token = tokens.getById(id);',
      'const event = m.getById(String(req.params[\'id\']));'
    ].join('\n');
    expect(contextFreeLookups('addons/x/index.ts', fine)).toEqual([]);
  });

  test('inside a door\'s own file, this.getById(id) is the door too', () => {
    expect(contextFreeLookups('src/managers/PersonManager.ts', 'return this.getById(id);')).toHaveLength(1);
    expect(contextFreeLookups('src/managers/AgentTokenManager.ts', 'return this.getById(id);')).toEqual([]);
  });
});
