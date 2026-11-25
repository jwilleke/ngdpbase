/**
 * package-lock.json's root entry must list the same dependencies as package.json (#2519).
 *
 * A lockfile whose packages[""] names a package under dependencies that
 * package.json lists only under optionalDependencies makes every npm install
 * rewrite the lockfile, which leaves a site's working tree dirty and makes
 * `./server.sh update` refuse. This reads both files, so it needs no network.
 */

import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

type Manifest = Record<string, Record<string, string> | undefined>;

const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as Manifest;
const lock = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package-lock.json'), 'utf8')) as { packages: Record<string, Manifest> };
const root = lock.packages[''];

describe('package-lock.json root entry matches package.json (#2519)', () => {
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    it(`lists the same ${field}`, () => {
      expect(root[field] ?? {}).toEqual(pkg[field] ?? {});
    });
  }
});
