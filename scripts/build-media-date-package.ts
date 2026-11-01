/**
 * Builds packages/media-date/dist, the folder mjs-media-handling copies. It
 * carries core's version, so a copy says which release it came from.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const pkgDir = path.join(root, 'packages/media-date');
const dist = path.join(pkgDir, 'dist');

fs.rmSync(dist, { recursive: true, force: true });
execFileSync('npx', ['tsc', '-p', path.join(pkgDir, 'tsconfig.json')], { cwd: root, stdio: 'inherit' });
fs.copyFileSync(path.join(pkgDir, 'README.md'), path.join(dist, 'README.md'));

const template = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) as Record<string, unknown>;
const core = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { version: string };
const { '//': _comment, private: _private, ...published } = template;
fs.writeFileSync(path.join(dist, 'package.json'), `${JSON.stringify({ ...published, version: core.version }, null, 2)}\n`);
console.log(`packages/media-date/dist built at ${core.version}`);
