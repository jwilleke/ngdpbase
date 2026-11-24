/**
 * #2391 slice 1: the calendar add-on declares `calendar-read`, the permission a
 * calendar whose visibility is `authenticated` asks, and grants it to every
 * signed-in account, so those calendars keep showing to signed-in people with
 * no site change. A signed-out visitor holds nothing here.
 */
import { readFileSync } from 'fs';
import path from 'path';

type Policy = { id: string; effect: string; subjects: Array<{ type: string; value?: string }>; actions: string[] };
const cfg = JSON.parse(readFileSync(path.join(__dirname, '..', 'config', 'default-config.json'), 'utf8')) as {
  'ngdpbase.permissions.definitions': Record<string, unknown>;
  'ngdpbase.access.policies': Policy[];
};

describe('calendar-read in the add-on defaults', () => {
  test('is declared as a permission', () => {
    expect(cfg['ngdpbase.permissions.definitions']).toHaveProperty('calendar-read');
  });

  test('is granted to every signed-in account, and to nobody else by name', () => {
    const grants = cfg['ngdpbase.access.policies'].filter(p => p.effect === 'allow' && p.actions.includes('calendar-read'));
    expect(grants).toHaveLength(1);
    expect(grants[0].subjects).toEqual([{ type: 'authenticated' }]);
  });

  test('calendar-manage is not widened', () => {
    const grants = cfg['ngdpbase.access.policies'].filter(p => p.actions.includes('calendar-manage'));
    expect(grants.flatMap(p => p.subjects)).toEqual([{ type: 'role', value: 'admin' }]);
  });
});
