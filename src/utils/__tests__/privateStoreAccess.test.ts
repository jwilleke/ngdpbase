/**
 * Private container access — owner or the owner's delegate, no role (#1398).
 * docs/private-stores.md, Access.
 */
import { mayActInPrivateContainer } from '../privateStoreAccess';

const share = (issuer: string, resources: Array<{ type: string; pattern: string }> = []) => ({
  username: '',
  isAuthenticated: false,
  roles: ['anonymous'],
  viaShare: { id: 's1', issuer, actions: ['page-read'], resources, expiresAt: null }
}) as never;
const wholeVault = (owner: string, vault: string) => [{ type: 'page', pattern: `vault:${owner}/${vault}` }];
const onePage = (owner: string, vault: string, uuid: string) => [{ type: 'page', pattern: `vault-page:${owner}/${vault}/${uuid}` }];

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

  test('a share link gets in only to a vault its owner shared through it (#1388)', () => {
    expect(mayActInPrivateContainer(share('alice', wholeVault('alice', 'journal')), 'alice', { vault: 'journal' })).toBe(true);
    expect(mayActInPrivateContainer(share('alice', onePage('alice', 'journal', 'u1')), 'alice', { vault: 'journal' })).toBe(true);
  });

  test('a share link never reaches another vault, another owner, or the container as a whole (#1388)', () => {
    const link = share('alice', wholeVault('alice', 'journal'));
    expect(mayActInPrivateContainer(link, 'alice', { vault: 'default' })).toBe(false);
    expect(mayActInPrivateContainer(link, 'alice')).toBe(false);
    // Issued by someone else: bob cannot share alice's vault, whatever it names.
    expect(mayActInPrivateContainer(share('bob', wholeVault('alice', 'journal')), 'alice', { vault: 'journal' })).toBe(false);
    // A keyword link names no vault.
    expect(mayActInPrivateContainer(share('alice', [{ type: 'page', pattern: 'keyword:x' }]), 'alice', { vault: 'journal' })).toBe(false);
  });

  test('an unauthenticated subject never matches, even an owner recorded as Anonymous', () => {
    expect(mayActInPrivateContainer({ username: 'Anonymous', isAuthenticated: false, roles: ['anonymous'] }, 'Anonymous')).toBe(false);
    expect(mayActInPrivateContainer({ username: 'alice', isAuthenticated: false, roles: [] }, 'alice')).toBe(false);
  });

  test('no owner, no access', () => {
    expect(mayActInPrivateContainer({ username: '', isAuthenticated: false, roles: [] }, '')).toBe(false);
  });
});
