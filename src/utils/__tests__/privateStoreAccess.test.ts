/**
 * Private container access — owner or the owner's delegate, no role (#1398).
 * docs/planning/private-stores.md, Access.
 */
import { mayActInPrivateContainer } from '../privateStoreAccess';

const share = (issuer: string) => ({
  username: 'Anonymous',
  isAuthenticated: false,
  roles: ['anonymous'],
  viaShare: { id: 's1', issuer, actions: ['asset-upload'], resources: [] }
}) as never;

describe('mayActInPrivateContainer', () => {
  test('the owner passes; nobody else does, admin included', () => {
    expect(mayActInPrivateContainer({ username: 'alice', isAuthenticated: true, roles: ['editor'] }, 'alice')).toBe(true);
    expect(mayActInPrivateContainer({ username: 'bob', isAuthenticated: true, roles: ['editor'] }, 'alice')).toBe(false);
    expect(mayActInPrivateContainer({ username: 'admin', isAuthenticated: true, roles: ['admin'] }, 'alice')).toBe(false);
  });

  test('a job acting for the owner passes; a system job does not', () => {
    const job = (username: string) => ({ username, origin: 'request', requestedAt: '2026-09-15T00:00:00Z' }) as never;
    expect(mayActInPrivateContainer(job('alice'), 'alice')).toBe(true);
    expect(mayActInPrivateContainer(job('System'), 'alice')).toBe(false);
  });

  test('a delegate is the owner\'s share, and only when the store is shared', () => {
    expect(mayActInPrivateContainer(share('alice'), 'alice')).toBe(false);
    expect(mayActInPrivateContainer(share('alice'), 'alice', { storeShared: true })).toBe(true);
    expect(mayActInPrivateContainer(share('bob'), 'alice', { storeShared: true })).toBe(false);
  });

  test('no owner, no access', () => {
    expect(mayActInPrivateContainer({ username: '', isAuthenticated: false, roles: [] }, '')).toBe(false);
  });
});
