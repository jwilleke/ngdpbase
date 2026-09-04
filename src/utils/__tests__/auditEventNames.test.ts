/**
 * #1201 — the names in code and the names in configuration are one set.
 *
 * Configuration owns which names exist; code lists the ones it may emit. A
 * name on one side only is the drift this pins: an emitter using a name no
 * on-failure rule was decided for, or a decision about a name nothing can send.
 */
import fs from 'fs';
import path from 'path';
import { AUDIT_EVENT, AUDIT_EVENT_NAME_PATTERN, auditEventNames } from '../auditEventNames';

const shipped = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'config', 'app-default-config.json'), 'utf8')
) as Record<string, unknown>;
const configured = Object.keys(shipped['ngdpbase.audit.events'] as Record<string, unknown>).sort();

describe('#1201 code and configuration name the same events', () => {
  test('every configured name is listed in code, and every listed name is configured', () => {
    expect(auditEventNames()).toEqual(configured);
  });

  test('every name is {target}-{action}, hyphens only', () => {
    expect(auditEventNames().filter((n) => !AUDIT_EVENT_NAME_PATTERN.test(n))).toEqual([]);
  });

  test('each key is the name upper-cased, so a test can derive one from the other', () => {
    for (const [key, name] of Object.entries(AUDIT_EVENT)) {
      expect(key).toBe(name.toUpperCase().replace(/-/g, '_'));
    }
  });
});
