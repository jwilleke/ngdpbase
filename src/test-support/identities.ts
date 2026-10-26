/**
 * A stand-in IdentityManager for tests of what refers to a user (#2041).
 *
 * The accounts are a mutable map of username to identity `@id`: delete a key
 * to delete the account, set it again for a new account with the same name.
 * `identityIdOf`, `convertReference` and `canAnswer` are IdentityManager's own
 * methods, run against this stand-in, so the rule (what a stored reference
 * becomes, an orphan included) has one home and the tests exercise it.
 * `down: true` is an identity store that cannot answer; `failLookups: true`
 * one that says it can, then fails each lookup (a read error mid-pass).
 */
import IdentityManager from '../managers/IdentityManager.js';

export interface FakeIdentities {
  identityIdOf: IdentityManager['identityIdOf'];
  convertReference: IdentityManager['convertReference'];
  canAnswer: IdentityManager['canAnswer'];
  getByUserIdentifier(ctx: unknown, username: string): Promise<{ '@id': string; identifier: string } | null>;
  /** Every username looked up, in order. */
  lookups: string[];
}

export function fakeIdentityManager(accounts: Record<string, string>, opts: { down?: boolean; failLookups?: boolean; onLookup?: (ctx: unknown, username: string) => void } = {}): FakeIdentities {
  const lookups: string[] = [];
  const fake = {
    provider: opts.down ? null : {},
    engine: { getManager: () => null },
    lookups,
    async getByUserIdentifier(ctx: unknown, username: string) {
      lookups.push(username);
      opts.onLookup?.(ctx, username);
      if (opts.failLookups) throw new Error('identity store read failed');
      if (opts.down) throw new Error('IdentityManager: no provider available (initialization failed or storage path unavailable)');
      return accounts[username] ? { '@id': accounts[username], identifier: username } : null;
    }
  };
  const proto = IdentityManager.prototype as unknown as Record<string, unknown>;
  return Object.assign(fake, {
    identityIdOf: proto.identityIdOf,
    convertReference: proto.convertReference,
    canAnswer: proto.canAnswer
  }) as unknown as FakeIdentities;
}
