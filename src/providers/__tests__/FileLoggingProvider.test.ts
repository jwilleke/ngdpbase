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
});
