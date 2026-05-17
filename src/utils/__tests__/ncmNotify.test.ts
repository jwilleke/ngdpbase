/**
 * Tests for notifyNcmConversion (#728 Phase 2 Slice 5d).
 */

import { notifyNcmConversion } from '../ncmNotify';

function engineWith(addNotification?: (n: unknown) => Promise<string>) {
  const calls: unknown[] = [];
  const nm = addNotification
    ? { addNotification: (n: unknown) => { calls.push(n); return addNotification(n); } }
    : {};
  return {
    engine: { getManager: (name: string) => (name === 'NotificationManager' ? nm : null) },
    calls
  };
}

describe('notifyNcmConversion', () => {
  test('no warnings → no notification', () => {
    const { engine, calls } = engineWith(async () => 'id');
    notifyNcmConversion(engine, 'Import jspwiki', 'PageX', []);
    expect(calls).toHaveLength(0);
  });

  test('NotificationManager unavailable → no throw, no-op', () => {
    const engine = { getManager: () => null };
    expect(() => notifyNcmConversion(engine, 'MCP create_page', 'P', ['html-dropped: iframe'])).not.toThrow();
  });

  test('warnings present → system/warning notification with summary', () => {
    const { engine, calls } = engineWith(async () => 'nid');
    notifyNcmConversion(engine, 'MCP update_page', 'My Page', ['link-externalized: https://x', 'img-rejected: type: https://y']);
    expect(calls).toHaveLength(1);
    const n = calls[0] as { type: string; level: string; title: string; message: string };
    expect(n.type).toBe('system');
    expect(n.level).toBe('warning');
    expect(n.title).toBe('NCM conversion: MCP update_page');
    expect(n.message).toContain('My Page: 2 warning(s)');
    expect(n.message).toContain('link-externalized: https://x');
  });

  test('truncates to first 5 with "+N more"', () => {
    const { engine, calls } = engineWith(async () => 'nid');
    const ws = Array.from({ length: 8 }, (_, i) => `html-dropped: tag${i}`);
    notifyNcmConversion(engine, 'Import html', 'Big', ws);
    const n = calls[0] as { message: string };
    expect(n.message).toContain('8 warning(s)');
    expect(n.message).toContain('(+3 more)');
  });

  test('addNotification rejection is swallowed (best-effort)', () => {
    const { engine } = engineWith(async () => { throw new Error('store down'); });
    expect(() => notifyNcmConversion(engine, 'Import html', 'P', ['x: y'])).not.toThrow();
  });
});
