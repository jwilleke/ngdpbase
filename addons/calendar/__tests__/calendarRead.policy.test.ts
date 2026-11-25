/**
 * #2391 slice 1: the real access evaluator, over the shipped defaults plus the
 * calendar add-on's own policies, grants `calendar-read` to a signed-in account
 * and not to a signed-out visitor, and does not widen `calendar-manage`.
 * (visibilityConfig.test.ts checks the shape of the declaration; this asks.)
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { mergeConfigWithAddons } from '../../../dist/src/utils/addonConfigLayer.js';
import { pdpOver } from '../../../dist/src/test-support/policyDecisionPoint.js';

const repoRoot = path.resolve(__dirname, '../../..');
const shipped = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config/app-default-config.json'), 'utf8')) as Record<string, unknown>;

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cal-policy-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const decide = async (subject: unknown, action: string) => {
  const { merged } = mergeConfigWithAddons({ ...shipped, 'ngdpbase.addons.calendar.enabled': true }, {}, repoRoot, dir);
  return (await pdpOver(merged)).permits(subject, action);
};

describe('calendar-read, asked of the real evaluator', () => {
  test('a signed-in account holds it', async () => {
    expect(await decide({ username: 'ann', roles: ['reader'], isAuthenticated: true }, 'calendar-read')).toBe(true);
  });

  test('a signed-out visitor does not', async () => {
    expect(await decide({ username: null, roles: ['Anonymous'], isAuthenticated: false }, 'calendar-read')).toBe(false);
  });

  test('a signed-in account without a management grant does not hold calendar-manage', async () => {
    expect(await decide({ username: 'ann', roles: ['reader'], isAuthenticated: true }, 'calendar-manage')).toBe(false);
    expect(await decide({ username: 'root', roles: ['admin'], isAuthenticated: true }, 'calendar-manage')).toBe(true);
  });
});
