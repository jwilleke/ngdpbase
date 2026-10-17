/**
 * package.json `engines.node` is the Node floor ngdpbase promises (#1830).
 * The lowest Node the floor allows must satisfy every runtime dependency's own
 * `engines.node`; otherwise an install on the floor runs a dependency on a
/* packages
 * and tuf-js. (They also leave out the odd-numbered Node 25, which the open
 * floor still admits; the shipped image and CI run Node 24.)
 *
/* and tuf-js
 * entries are listed.
 */
import fs from 'fs';
import path from 'path';
import semver from 'semver';

const root = path.resolve(__dirname, '..', '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  engines: { node: string };
  dependencies: Record<string, string>;
};

describe('Node engines floor (#1830)', () => {
  test('every runtime dependency supports the lowest Node the floor allows', () => {
    const floor = semver.minVersion(pkg.engines.node).version;
    const narrower: string[] = [];
    for (const name of Object.keys(pkg.dependencies)) {
      // Read from the folder, not require(): a package whose `exports` leaves
      // out ./package.json would otherwise be skipped.
      const file = path.join(root, 'node_modules', name, 'package.json');
      if (!fs.existsSync(file)) continue;
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as { engines?: { node?: string } };
      const wanted = manifest.engines?.node;
      if (wanted && semver.validRange(wanted) && !semver.satisfies(floor, wanted)) narrower.push(`${name} wants ${wanted}`);
    }
    expect(narrower).toEqual([]);
  });

  test('the floor is at least 24.15.0', () => {
    expect(semver.minVersion(pkg.engines.node)?.version).toBe('24.15.0');
  });
});
