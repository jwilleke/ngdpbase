/**
 * FileLoggingProvider tests (#169)
 *
 * @jest-environment node
 */
import os from 'os';
import path from 'path';
import fs from 'fs';
import FileLoggingProvider from '../FileLoggingProvider';
import BaseLoggingProvider from '../BaseLoggingProvider';

describe('FileLoggingProvider', () => {
  const provider = new FileLoggingProvider();

  test('is a BaseLoggingProvider', () => {
    expect(provider).toBeInstanceOf(BaseLoggingProvider);
  });

  test('console-only transport when no dir', () => {
    const t = provider.createTransports({ level: 'info' });
    expect(t).toHaveLength(1);
    expect(t[0].constructor.name).toBe('Console');
  });

  test('adds file transport when dir is provided', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flp-test-'));
    try {
      const t = provider.createTransports({ dir: tmpDir });
      expect(t).toHaveLength(2);
      expect(t.map(x => x.constructor.name).sort()).toEqual(['Console', 'File']);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('maxSize accepts number and MB/KB/B strings without throwing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flp-test-'));
    try {
      for (const maxSize of [2048, '2MB', '512KB', '1024B', 'garbage'] as const) {
        expect(() => provider.createTransports({ dir: tmpDir, maxSize })).not.toThrow();
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('createFormat returns a winston format (has transform)', () => {
    const fmt = provider.createFormat();
    expect(fmt).toBeDefined();
    expect(typeof (fmt as { transform?: unknown }).transform).toBe('function');
  });

  test('getProviderInfo identifies the provider', () => {
    expect(provider.getProviderInfo().name).toBe('FileLoggingProvider');
  });

  /**
   * #1141 — the printf rendered only timestamp/level/message, so the second
   * argument of every `logger.error(msg, { error, stack })` call in the
   * codebase was silently dropped. A 500 on every missing page was logged as
   * the bare line `[error]: [VIEW] Error viewing page` with no message and no
   * stack, which is why the cause could not be read from the log at all.
   */
  describe('metadata rendering (#1141)', () => {
    /** Run one info object through the format, as winston does. */
    const render = (info: Record<string, unknown>): string => {
      const out = (provider.createFormat() as unknown as {
        transform: (i: Record<string, unknown>) => Record<string, unknown> | false;
      }).transform({ level: 'error', ...info });
      if (out === false) return '';
      return String((out as Record<symbol | string, unknown>)[Symbol.for('message')] ?? '');
    };

    test('a plain message still renders as before', () => {
      const line = render({ message: 'hello' });
      expect(line).toContain('[error]: hello');
      expect(line.trim().endsWith('hello')).toBe(true);
    });

    test('an error message passed as metadata is rendered', () => {
      const line = render({ message: '[VIEW] Error viewing page', error: 'page is not defined' });
      expect(line).toContain('[VIEW] Error viewing page');
      expect(line).toContain('page is not defined');
    });

    test('a stack passed as metadata is rendered', () => {
      const line = render({
        message: '[VIEW] Error viewing page',
        error: 'boom',
        stack: 'Error: boom\n    at viewPage (WikiRoutes.ts:3048:11)'
      });
      expect(line).toContain('at viewPage (WikiRoutes.ts:3048:11)');
    });

    test('winston internal keys never leak into the line', () => {
      const line = render({
        message: 'hello',
        error: 'boom',
        [Symbol.for('level')]: 'error',
        [Symbol.for('splat')]: ['x']
      });
      expect(line).toContain('boom');
      expect(line).not.toContain('Symbol(');
      expect(line).not.toContain('splat');
    });

    test('an undefined metadata value is omitted rather than printed', () => {
      const line = render({ message: 'hello', error: 'boom', stack: undefined });
      expect(line).toContain('boom');
      expect(line).not.toContain('undefined');
    });
  });
});
