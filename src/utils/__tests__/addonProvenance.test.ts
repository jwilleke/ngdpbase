/**
 * Sigstore provenance check (#1830), with real cryptography and no network:
 * the fixture is the registry's attestations for semver@7.8.5 (published from
 * github.com/npm/node-semver by GitHub Actions), verified against the trusted
 * root shipped inside @sigstore/tuf.
 *
 * Sabotage: drop the subjectAlternativeName policy in verifyProvenance and the
 * "another repository" test goes green-to-red; skip the digest comparison and
 * the "different tarball" test does.
 */
import fs from 'fs';
import path from 'path';
import { normaliseRepository, npmPurl, verifyProvenance } from '../addonProvenance';
import { seededTrustedRoot } from '../sigstoreTrustedRoot';

const attestations = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'semver-7.8.5-attestations.json'), 'utf8')) as unknown;
// dist.integrity of semver@7.8.5, as hex.
const sha512Hex = Buffer.from('Y7/KDsb8LjooZpwaqGyulO6DQlksgCncchHGk+sZIY4SBvUocMBEFH5Ur1fI4dV+Jvl0w6cjvucaIi40puRioA==', 'base64').toString('hex');
const trustedRoot = seededTrustedRoot();

const check = (over: Partial<Parameters<typeof verifyProvenance>[0]> = {}) => verifyProvenance({
  attestations, name: 'semver', version: '7.8.5', sha512Hex, repository: 'github.com/npm/node-semver', trustedRoot, ...over
});

describe('addonProvenance (#1830)', () => {
  test('a valid attestation from the expected repository is accepted', () => {
    expect(check()).toEqual({ ok: true, repository: 'github.com/npm/node-semver' });
  });

  test('the expected repository may be written as a URL', () => {
    expect(check({ repository: 'git+https://github.com/npm/node-semver.git' })).toMatchObject({ ok: true });
  });

  test('an attestation from another repository is refused', () => {
    const result = check({ repository: 'github.com/jwilleke/yourphr' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/does not verify for github\.com\/jwilleke\/yourphr/);
  });

  test('an attestation for a different tarball is refused', () => {
    const result = check({ sha512Hex: '00'.repeat(64) });
    expect(!result.ok && result.reason).toMatch(/different tarball/);
  });

  test('an attestation for another package or version is refused', () => {
    expect(check({ version: '7.8.4' })).toMatchObject({ ok: false });
  });

  test('missing provenance is refused', () => {
    expect(check({ attestations: { attestations: [] } })).toMatchObject({ ok: false, reason: expect.stringMatching(/no SLSA provenance/) });
    expect(check({ attestations: null })).toMatchObject({ ok: false });
  });

  test('a tampered signature is refused', () => {
    const copy = JSON.parse(JSON.stringify(attestations)) as { attestations: Array<{ predicateType: string; bundle: { dsseEnvelope: { signatures: Array<{ sig: string }> } } }> };
    const slsa = copy.attestations.find((a) => a.predicateType.startsWith('https://slsa.dev/'));
    const sig = Buffer.from(slsa.bundle.dsseEnvelope.signatures[0].sig, 'base64');
    sig[sig.length - 1] ^= 1;
    slsa.bundle.dsseEnvelope.signatures[0].sig = sig.toString('base64');
    expect(check({ attestations: copy })).toMatchObject({ ok: false });
  });

  test('an unsupported host or a malformed repository is refused', () => {
    expect(check({ repository: 'example.com/a/b' })).toMatchObject({ ok: false, reason: expect.stringMatching(/not supported/) });
    expect(check({ repository: 'node-semver' })).toMatchObject({ ok: false, reason: expect.stringMatching(/not a repository/) });
  });

  test('helpers', () => {
    expect(normaliseRepository('https://GitHub.com/Owner/Repo/')).toBe('github.com/owner/repo');
    expect(npmPurl('@yourphr/phr-addon', '1.0.0')).toBe('pkg:npm/%40yourphr/phr-addon@1.0.0');
  });
});
