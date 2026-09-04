/**
 * #1207 — the audit docs are generated from configuration, and a stale copy
 * is caught.
 */
import fs from 'fs';
import path from 'path';
import { eventsTable, coverageSection, generate } from '../generate-audit-docs';

const events = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config', 'app-default-config.json'), 'utf8'))['ngdpbase.audit.events'] as Record<string, { 'on-failure': string; enabled?: boolean; description: string }>;

describe('#1207 audit docs come from configuration', () => {
  test('the event table lists every configured event with its on-failure rule and switch', () => {
    const table = eventsTable(events);
    for (const [name, d] of Object.entries(events)) {
      expect(table).toContain(`| \`${name}\` | ${d.description} | ${d['on-failure']} | ${d.enabled === false ? 'no' : 'yes'} |`);
    }
  });

  test('the coverage section states the counts and the switched-off and critical lists', () => {
    const section = coverageSection(events);
    expect(section).toMatch(/\| Declared in configuration \| \d+ \|/);
    expect(section).toContain('`page-read`');
    expect(section).toContain('`user-delete`');
  });

  test('the committed docs match what configuration generates', () => {
    for (const { file, content } of generate()) {
      expect(fs.readFileSync(file, 'utf8')).toBe(content);
    }
  });

  test('an on-failure rule edited in configuration without regenerating would differ (sabotage, in memory)', () => {
    const edited = { ...events, 'page-delete': { ...events['page-delete'], 'on-failure': 'continue' } };
    expect(eventsTable(edited)).not.toBe(eventsTable(events));
  });
});
