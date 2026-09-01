import fs from 'fs';
import path from 'path';

/**
 * #1157 — three places described behaviour the code no longer had.
 *
 * Each told an operator or a contributor something false, and each was found
 * by reading rather than by anything failing. These assertions are cheap and
 * turn "somebody noticed" into "the suite notices".
 */
const read = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), ...p), 'utf8');

describe('#1157 — nothing describes the removed model or a fatal refuse-boot', () => {
  test('the dashboard does not call refuse-boot fatal', () => {
    // #1152 made it blocking: the instance stays running and serves the
    // maintenance page so the provider can be repaired through the UI. An
    // operator told "fatal" expects a dead process and may avoid the setting.
    expect(read('views', 'admin-dashboard.ejs')).not.toMatch(/make this fatal/i);
  });

  test('the audit on-failure comment does not say it refuses to start', () => {
    const config = JSON.parse(read('config', 'app-default-config.json')) as Record<string, unknown>;
    const comment = String(config._comment_audit_on_failure ?? '');
    expect(comment).not.toMatch(/refuses to start\b/);
    // And says what actually happens, so the correction cannot be undone by
    // deleting a sentence.
    expect(comment).toMatch(/blocking, not fatal|stays RUNNING/i);
  });

  test('no shipped configuration key names the removed profile', () => {
    // #1144 removed ngdpbase.security.profile. A key or comment still naming it
    // would send an operator looking for a setting that does not exist.
    const raw = read('config', 'app-default-config.json');
    expect(raw).not.toContain('ngdpbase.security.profile');
  });

  test('the superseded planning document says so at the top', () => {
    // Kept rather than deleted: its rejected alternatives are the reasoning
    // behind decisions that stand. But docs/planning/ is where a contributor
    // looks first, and it must not read as current.
    const planning = read('docs', 'planning', 'security-profile.md');
    expect(planning.slice(0, 400)).toMatch(/SUPERSEDED/);
    expect(planning).toMatch(/security-posture\.md/);
  });
});
