/**
 * #2348 — an item on the dashboard leads with the plain name of its feature. A manager
 * with no name loses all context (a bad path with no feature in it), so every manager
 * that can report a state must have one in featureNames.ts.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { featureNameFor } from '../featureNames';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPORTS_STATE = /this\.(preflightConfiguredPath|markNeedsAttention|markDegraded|markFailed)\(/;

describe('#2348 every manager that reports a state has a plain feature name', () => {
  // A manager is named for its file; PolicyInformationPoint lives in src/security, not src/managers.
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if (e.name === '__tests__' || e.name === 'node_modules') return [];
      const full = path.join(dir, e.name);
      return e.isDirectory() ? walk(full) : [full];
    });
  const reporters = walk(SRC)
    .filter((f) => f.endsWith('.ts') && path.basename(f) !== 'BaseManager.ts')
    .filter((f) => REPORTS_STATE.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.basename(f, '.ts'));

  test('the scan finds the managers', () => {
    expect(reporters).toEqual(expect.arrayContaining(['BackupManager', 'ShareManager', 'TemplateManager', 'IdentityManager', 'PolicyInformationPoint', 'OrganizationManager']));
  });

  test.each(reporters)('%s has a name that is not its class name', (manager) => {
    const name = featureNameFor(manager);
    expect(name).toBeTruthy();
    expect(name).not.toMatch(/Manager|Evaluator|Point/);
  });

  test('an unknown manager has none', () => {
    expect(featureNameFor('Mystery')).toBeUndefined();
    expect(featureNameFor('constructor')).toBeUndefined();
  });
});
